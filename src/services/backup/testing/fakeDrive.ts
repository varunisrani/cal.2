// Test helpers: Google Drive in memory, behind a `fetch` that answers the requests the Drive
// client makes (the folder lookup and making, multipart and resumable uploads, listing with the
// queries it sends, downloads and deletes), and a fake of the Android sign-in plugin.
//
// The fake keeps the `drive.file` rule: the app sees only files it made. A test can put in files
// someone else made (invisible, a 404 to the app) or files the app can see that carry no backup
// tag, accept only one token (a 401 for any other), fill the Drive, drop the connection, or cut a
// resumable upload after some bytes.

import type { Clock } from '../../../lib/clock';
import type { DriveFetch } from '../driveClient';
import type { DriveErrorCode, DrivePlugin } from '../drivePlugin';

export interface FakeDriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly parents: readonly string[];
  readonly appProperties: Readonly<Record<string, string>>;
  readonly data: Blob;
  /** Epoch ms. */
  readonly createdAt: number;
  /** Made by the app: only those are visible to it (`drive.file`). */
  readonly byApp: boolean;
  readonly trashed: boolean;
}

export interface FakeDrive {
  /** The `fetch` the client is given. */
  readonly fetch: DriveFetch;
  /** Every file by id, the app's and others'. */
  readonly files: Map<string, FakeDriveFile>;
  /** The one token Drive accepts; any other gets a 401. */
  token: string;
  /** The signed-in account's address, as Drive's `about` gives it. */
  accountEmail: string;
  /** Every request rejects as a fetch does without a connection. */
  offline: boolean;
  /** How many bytes the Drive holds before it is full. */
  quotaBytes: number;
  /** Files per page of a listing (the client asks for 100). */
  pageSize: number | null;
  /** The next resumable PUT stops after this many bytes, as a dropped connection does. */
  dropAfter: number | null;
  /** Every request, in order: `list folder`, `make folder`, `multipart <name>`, … */
  readonly log: string[];
  /** Puts in a file; by the app (visible) unless `byApp` is false. */
  put(file: Partial<FakeDriveFile> & { readonly name: string }): FakeDriveFile;
  /** The app's tagged backups that are not in the trash, newest first. */
  backups(): FakeDriveFile[];
  /** The folders the app made. */
  folders(): FakeDriveFile[];
}

const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const SESSION = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=';

interface Session {
  readonly meta: Partial<FakeDriveFile>;
  readonly size: number;
  received: Uint8Array<ArrayBuffer>;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const failure = (status: number, reason: string) =>
  json({ error: { code: status, message: reason, errors: [{ reason }] } }, status);

/**
 * A download's answer. Its `blob()` hands back the stored Blob itself: under jsdom a Response can
 * neither take jsdom's Blob as its body nor give a Blob jsdom's File can read.
 */
const media = (data: Blob) =>
  Object.assign(new Response(null, { status: 200 }), { blob: async () => data });

function indexOf(bytes: Uint8Array, part: Uint8Array, from = 0): number {
  outer: for (let at = from; at <= bytes.length - part.length; at++) {
    for (let i = 0; i < part.length; i++) if (bytes[at + i] !== part[i]) continue outer;
    return at;
  }
  return -1;
}

async function bytesOf(body: BodyInit | null | undefined): Promise<Uint8Array<ArrayBuffer>> {
  if (body === null || body === undefined) return new Uint8Array();
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  throw new Error(`fake Drive: a body it does not read (${typeof body})`);
}

/** The headers and content of one part of a multipart body. */
function splitPart(part: Uint8Array<ArrayBuffer>): {
  head: string;
  content: Uint8Array<ArrayBuffer>;
} {
  const gap = indexOf(part, new TextEncoder().encode('\r\n\r\n'));
  if (gap < 0) throw new Error('fake Drive: a part without headers');
  return { head: new TextDecoder().decode(part.slice(0, gap)), content: part.slice(gap + 4) };
}

/** Metadata and bytes from a `multipart/related` body, checked strictly. */
function readMultipart(bytes: Uint8Array<ArrayBuffer>, mark: string) {
  const encode = (text: string) => new TextEncoder().encode(text);
  const open = encode(`--${mark}\r\n`);
  const between = encode(`\r\n--${mark}\r\n`);
  const close = encode(`\r\n--${mark}--`);
  if (indexOf(bytes, open) !== 0) throw new Error('fake Drive: the body does not open a part');
  const middle = indexOf(bytes, between, open.length);
  const end = bytes.length - close.length;
  if (middle < 0 || indexOf(bytes, close, end) !== end) {
    throw new Error('fake Drive: the body is not two parts');
  }
  const first = splitPart(bytes.slice(open.length, middle));
  const second = splitPart(bytes.slice(middle + between.length, end));
  if (!/content-type: application\/json/i.test(first.head)) {
    throw new Error('fake Drive: the first part is not JSON');
  }
  return {
    meta: JSON.parse(new TextDecoder().decode(first.content)) as Partial<FakeDriveFile>,
    type: /content-type: ([^\r\n;]+)/i.exec(second.head)?.[1] ?? '',
    content: second.content,
  };
}

/** One clause of a Drive query, as a test on a file; the clauses the client sends only. */
function clause(text: string): (file: FakeDriveFile) => boolean {
  let match = /^mimeType = '([^']+)'$/.exec(text);
  if (match) return (file) => file.mimeType === match![1];
  if (text === 'trashed = false') return (file) => !file.trashed;
  match = /^appProperties has \{ key='([^']+)' and value='([^']+)' \}$/.exec(text);
  if (match) return (file) => file.appProperties[match![1]!] === match![2];
  match = /^'([^']+)' in parents$/.exec(text);
  if (match) return (file) => file.parents.includes(match![1]!);
  match = /^name = '([^']+)'$/.exec(text);
  if (match) return (file) => file.name === match![1];
  throw new Error(`fake Drive: a query clause it does not know: ${text}`);
}

/** A query's clauses joined by `and` (an `and` inside braces belongs to its clause). */
function query(text: string): (file: FakeDriveFile) => boolean {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0 && text.startsWith(' and ', i)) {
      parts.push(text.slice(start, i));
      start = i + 5;
    }
  }
  parts.push(text.slice(start));
  const tests = parts.map((part) => clause(part.trim()));
  return (file) => tests.every((test) => test(file));
}

function wire(file: FakeDriveFile) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: String(file.data.size),
    createdTime: new Date(file.createdAt).toISOString(),
    appProperties: file.appProperties,
  };
}

export function fakeDrive(clock: Pick<Clock, 'now'>): FakeDrive {
  const files = new Map<string, FakeDriveFile>();
  const sessions = new Map<string, Session>();
  const log: string[] = [];
  let made = 0;

  function used(): number {
    return [...files.values()].reduce((sum, file) => sum + file.data.size, 0);
  }

  function visible(id: string): FakeDriveFile | undefined {
    const file = files.get(id);
    return file?.byApp ? file : undefined;
  }

  function create(meta: Partial<FakeDriveFile>, data: Blob): FakeDriveFile | Response {
    if (used() + data.size > drive.quotaBytes) return failure(403, 'storageQuotaExceeded');
    for (const parent of meta.parents ?? []) {
      if (!visible(parent)) return failure(404, 'notFound');
    }
    return drive.put({ ...meta, name: meta.name ?? 'Untitled', data });
  }

  async function handle(url: URL, init: RequestInit): Promise<Response> {
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const path = url.pathname;
    const uploadId = url.searchParams.get('upload_id');

    if (method === 'PUT' && uploadId !== null) return session(uploadId, headers, init.body);
    if (headers.get('Authorization') !== `Bearer ${drive.token}`) {
      log.push(`401 ${method} ${path}`);
      return failure(401, 'authError');
    }

    if (path === '/drive/v3/about' && method === 'GET') {
      log.push('about');
      return json({ user: { emailAddress: drive.accountEmail } });
    }

    if (path === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      log.push(q.includes(FOLDER_TYPE) ? 'list folder' : 'list backups');
      const desc = url.searchParams.get('orderBy') === 'createdTime desc';
      const found = [...files.values()]
        .filter((file) => file.byApp && query(q)(file))
        .sort((a, b) => (desc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
      const size = drive.pageSize ?? Number(url.searchParams.get('pageSize') ?? 100);
      const from = Number(url.searchParams.get('pageToken') ?? 0);
      const page = found.slice(from, from + size);
      const next = from + size < found.length ? { nextPageToken: String(from + size) } : {};
      return json({ files: page.map(wire), ...next });
    }

    if (path === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(new TextDecoder().decode(await bytesOf(init.body)));
      log.push(meta.mimeType === FOLDER_TYPE ? 'make folder' : `make ${meta.name}`);
      const result = create(meta, new Blob([]));
      return result instanceof Response ? result : json(wire(result));
    }

    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(path);
    if (one && method === 'GET' && url.searchParams.get('alt') === 'media') {
      const id = decodeURIComponent(one[1]!);
      log.push(`download ${id}`);
      const file = visible(id);
      return file ? media(file.data) : failure(404, 'notFound');
    }
    if (one && method === 'DELETE') {
      const id = decodeURIComponent(one[1]!);
      log.push(`delete ${id}`);
      if (!visible(id)) return failure(404, 'notFound');
      files.delete(id);
      return new Response(null, { status: 204 });
    }

    if (path === '/upload/drive/v3/files' && method === 'POST') {
      const type = url.searchParams.get('uploadType');
      if (type === 'multipart') {
        const mark = /boundary=(.+)$/.exec(headers.get('Content-Type') ?? '')?.[1];
        if (!mark) throw new Error('fake Drive: a multipart request without a boundary');
        const part = readMultipart(await bytesOf(init.body), mark);
        log.push(`multipart ${part.meta.name}`);
        const result = create({ ...part.meta, mimeType: part.type }, new Blob([part.content]));
        return result instanceof Response ? result : json(wire(result));
      }
      if (type === 'resumable') {
        const meta = JSON.parse(new TextDecoder().decode(await bytesOf(init.body)));
        const size = Number(headers.get('X-Upload-Content-Length'));
        log.push(`resumable ${meta.name} ${size}`);
        if (used() + size > drive.quotaBytes) return failure(403, 'storageQuotaExceeded');
        const id = String(sessions.size + 1);
        sessions.set(id, {
          meta: { ...meta, mimeType: headers.get('X-Upload-Content-Type') ?? meta.mimeType },
          size,
          received: new Uint8Array(),
        });
        return new Response(null, { status: 200, headers: { Location: `${SESSION}${id}` } });
      }
    }
    throw new Error(`fake Drive: a request it does not know: ${method} ${url}`);
  }

  async function session(id: string, headers: Headers, body: BodyInit | null | undefined) {
    const open = sessions.get(id);
    if (!open) return failure(404, 'notFound');
    const range = headers.get('Content-Range');
    const status = () =>
      new Response(null, {
        status: 308,
        headers: open.received.length > 0 ? { Range: `bytes=0-${open.received.length - 1}` } : {},
      });
    if (range === `bytes */${open.size}`) {
      log.push(`session status ${open.received.length}`);
      return status();
    }
    const from = range ? Number(/^bytes (\d+)-/.exec(range)?.[1]) : 0;
    if (from !== open.received.length) throw new Error('fake Drive: bytes sent out of order');
    const bytes = await bytesOf(body);
    log.push(`session put ${from}+${bytes.length}`);
    const kept = drive.dropAfter === null ? bytes : bytes.slice(0, drive.dropAfter);
    const joined = new Uint8Array(open.received.length + kept.length);
    joined.set(open.received);
    joined.set(kept, open.received.length);
    open.received = joined;
    if (drive.dropAfter !== null) {
      drive.dropAfter = null;
      throw new TypeError('Failed to fetch');
    }
    if (open.received.length < open.size) return status();
    sessions.delete(id);
    const result = create(open.meta, new Blob([open.received]));
    return result instanceof Response ? result : json(wire(result));
  }

  const drive: FakeDrive = {
    files,
    token: 'token-1',
    accountEmail: 'sam@example.com',
    offline: false,
    quotaBytes: Number.POSITIVE_INFINITY,
    pageSize: null,
    dropAfter: null,
    log,

    async fetch(input, init = {}) {
      if (drive.offline) throw new TypeError('Failed to fetch');
      return handle(new URL(input), init);
    },

    put(file) {
      made++;
      const stored: FakeDriveFile = {
        id: file.id ?? `file-${made}`,
        name: file.name,
        mimeType: file.mimeType ?? 'application/zip',
        parents: file.parents ?? [],
        appProperties: file.appProperties ?? {},
        data: file.data ?? new Blob(['someone else’s file']),
        // Files made in the same fake minute still keep their order.
        createdAt: file.createdAt ?? clock.now() + made,
        byApp: file.byApp ?? true,
        trashed: file.trashed ?? false,
      };
      files.set(stored.id, stored);
      return stored;
    },

    backups() {
      return [...files.values()]
        .filter((file) => file.byApp && !file.trashed && file.appProperties.platewise === 'backup')
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    folders() {
      return [...files.values()].filter((file) => file.byApp && file.mimeType === FOLDER_TYPE);
    },
  };
  return drive;
}

export interface FakeDrivePlugin extends DrivePlugin {
  /** The tokens `authorize` hands out, in order; the last one repeats. */
  readonly grants: string[];
  /** The account's address, or null when Google gives none. */
  email: string | null;
  /** Every `authorize` rejects with this code. */
  refuse: DriveErrorCode | null;
  /** Only the silent `authorize` (`interactive: false`) rejects with this code. */
  refuseSilent: DriveErrorCode | null;
  /** Every call: `authorize interactive`, `authorize silent`, `signOut`. */
  readonly calls: string[];
}

/** The Android sign-in plugin: grants tokens, or refuses with a contract code. */
export function fakeDrivePlugin(grants: string[] = ['token-1']): FakeDrivePlugin {
  const plugin: FakeDrivePlugin = {
    grants,
    email: 'sam@example.com',
    refuse: null,
    refuseSilent: null,
    calls: [],

    async authorize({ interactive }) {
      plugin.calls.push(interactive ? 'authorize interactive' : 'authorize silent');
      const code = plugin.refuse ?? (interactive ? null : plugin.refuseSilent);
      if (code) throw Object.assign(new Error(`authorize refused: ${code}`), { code });
      const accessToken = grants.length > 1 ? grants.shift()! : grants[0]!;
      return { accessToken, email: plugin.email };
    },

    async signOut() {
      plugin.calls.push('signOut');
    },
  };
  return plugin;
}
