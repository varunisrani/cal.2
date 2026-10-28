// Google Drive's REST API (v3) for the copies of backups (P15-04, D-16.97). Pure requests over an
// injected `fetch` and a token source; the Android plugin only signs in (`drivePlugin.ts`).
//
// Platewise asks for the `drive.file` scope, so Drive shows it only the files it made itself.
// Everything it makes also carries a tag (`appProperties.platewise`), and only tagged files are
// ever listed, counted or deleted: a file of the person's, or anything else the app can see, is
// never touched. Each backup also carries the id of the install that uploaded it
// (`appProperties.platewiseInstall`): pruning counts only one install's own copies, so a new
// phone never pushes out the copies a lost or old phone left.
//
// - The "Platewise backups" folder is looked up (by its tag) once per run, and made only when
//   none is found. A folder deleted while the app runs is looked up or made again, once.
// - A backup of 5 MiB or less goes up in one multipart request (the metadata and the bytes); a
//   larger one in a resumable session, in pieces of 8 MiB. When the connection drops during a
//   piece, the session is asked how much arrived and the rest is sent, once per upload.
// - A 401 refreshes the token once and repeats the request; a second 401 means signing in again.
// - A request that gets no answer in time is given up: 30 s for the small calls (folder, list,
//   account, delete), 120 s for each upload request or piece and for a download. That is a plain
//   failure, tried again later.
// - Failures reject with a `DriveError` whose `problem` says what the person can do about it.

import { ZIP_TYPE } from './zip';

/** The folder the copies go into, in the person's Drive. */
export const DRIVE_FOLDER_NAME = 'Platewise backups';

/** The largest file sent in one multipart request; larger ones use a resumable session. */
export const DRIVE_MULTIPART_LIMIT = 5 * 1024 * 1024;

/** The size of each piece of a resumable upload: a multiple of 256 KiB, as Drive requires. */
export const DRIVE_CHUNK_BYTES = 8 * 1024 * 1024;

/** How long a small call (folder, list, account, delete) may take. */
export const DRIVE_METADATA_TIMEOUT_MS = 30_000;
/** How long one upload request or piece, or a download, may take. */
export const DRIVE_TRANSFER_TIMEOUT_MS = 120_000;

/** The `appProperties` key on everything Platewise makes in Drive. */
export const DRIVE_TAG = 'platewise';
/** The `appProperties` key holding the id of the install that uploaded a backup. */
export const DRIVE_INSTALL_TAG = 'platewiseInstall';
const BACKUP_TAG = 'backup';
const FOLDER_TAG = 'folder';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const ABOUT = 'https://www.googleapis.com/drive/v3/about';
const UPLOADS = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const FILE_FIELDS = 'id,name,size,createdTime,appProperties';
const JSON_TYPE = 'application/json; charset=UTF-8';

/** Why a Drive request failed. */
export type DriveProblem =
  /** No connection (the request never got an answer). */
  | 'offline'
  /** Google no longer lets Platewise in: connect again. */
  | 'signIn'
  /** The person's Drive is full. */
  | 'quota'
  /** No such file (deleted in Drive). */
  | 'missing'
  | 'failed';

/** A Drive request that failed, and why. */
export class DriveError extends Error {
  override readonly name = 'DriveError';
  readonly problem: DriveProblem;

  constructor(problem: DriveProblem, detail?: string, cause?: unknown) {
    super(`Google Drive refused the request (${problem}${detail ? `: ${detail}` : ''})`, {
      cause,
    });
    this.problem = problem;
  }
}

/** `error` as a `DriveError`'s problem; anything else counts as `failed`. */
export function driveProblemOf(error: unknown): DriveProblem {
  return error instanceof DriveError ? error.problem : 'failed';
}

/** A backup Platewise put into Drive. */
export interface DriveFile {
  readonly id: string;
  readonly name: string;
  /** Bytes. */
  readonly size: number;
  /** When it was uploaded, epoch ms. */
  readonly createdAt: number;
  /** The install that uploaded it; null for a copy that carries none. */
  readonly install: string | null;
}

/** Where access tokens come from (the sign-in plugin, through the service). */
export interface DriveTokens {
  /** The current token, signing in silently when there is none. */
  get(): Promise<string>;
  /** A new token, after Drive refused the current one. */
  refresh(): Promise<string>;
}

/** The page's fetch, handed over by the composition root (no service uses the global). */
export type DriveFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface DriveClientDeps {
  readonly fetch: DriveFetch;
  readonly tokens: DriveTokens;
}

export interface DriveClient {
  /** Puts `data` into the folder as `name`, tagged as a backup of `install`. */
  upload(name: string, data: Blob, install: string): Promise<DriveFile>;
  /** The backups Platewise made, from every install, newest first. */
  list(): Promise<DriveFile[]>;
  /** One backup's bytes, as a `File` called by its name. */
  download(file: Pick<DriveFile, 'id' | 'name'>): Promise<File>;
  /** Deletes one file; one already gone is fine. */
  remove(id: string): Promise<void>;
  /**
   * Deletes `install`'s own backups beyond its newest `keep`; another install's copies and those
   * without an install stay. Returns the ids it deleted.
   */
  prune(keep: number, install: string): Promise<string[]>;
  /** The account's address, from Drive itself (for a sign-in that did not give one). */
  account(): Promise<string | null>;
  /** Forgets the folder found earlier (another account may be next). */
  forget(): void;
}

interface RawFile {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly size?: unknown;
  readonly createdTime?: unknown;
  readonly appProperties?: unknown;
}

const tagged = (value: string) => `appProperties has { key='${DRIVE_TAG}' and value='${value}' }`;

function propertyOf(raw: RawFile, key: string): unknown {
  const properties = raw.appProperties;
  return typeof properties === 'object' && properties !== null
    ? (properties as Record<string, unknown>)[key]
    : undefined;
}

function isOurs(raw: RawFile, tag: string): boolean {
  return propertyOf(raw, DRIVE_TAG) === tag;
}

/** A listed or uploaded file, or null when Drive's answer is not one. */
function fileOf(raw: RawFile): DriveFile | null {
  if (typeof raw.id !== 'string' || raw.id === '' || typeof raw.name !== 'string') return null;
  const size = Number(raw.size);
  const createdAt = typeof raw.createdTime === 'string' ? Date.parse(raw.createdTime) : NaN;
  const install = propertyOf(raw, DRIVE_INSTALL_TAG);
  return {
    id: raw.id,
    name: raw.name,
    size: Number.isFinite(size) && size >= 0 ? size : 0,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    install: typeof install === 'string' && install !== '' ? install : null,
  };
}

/** The reasons in a Drive error answer (`error.errors[].reason`, `error.details[].reason`). */
async function reasonsOf(response: Response): Promise<string[]> {
  const body: unknown = await response.json().catch(() => null);
  const error =
    typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  if (typeof error !== 'object' || error === null) return [];
  const fields = error as { errors?: unknown; details?: unknown; status?: unknown };
  const reasons: string[] = typeof fields.status === 'string' ? [fields.status] : [];
  for (const list of [fields.errors, fields.details]) {
    if (!Array.isArray(list)) continue;
    for (const item of list as unknown[]) {
      const reason =
        typeof item === 'object' && item !== null ? (item as { reason?: unknown }).reason : null;
      if (typeof reason === 'string') reasons.push(reason);
    }
  }
  return reasons;
}

const QUOTA_REASONS = ['storageQuotaExceeded', 'quotaExceeded'];
const SCOPE_REASONS = ['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'];

/** The error for an answer that is not a success. */
async function refusal(response: Response, what: string): Promise<DriveError> {
  const detail = `${what} ${response.status}`;
  if (response.status === 401) return new DriveError('signIn', detail);
  if (response.status === 404) return new DriveError('missing', detail);
  if (response.status === 403) {
    const reasons = await reasonsOf(response);
    if (reasons.some((reason) => QUOTA_REASONS.includes(reason))) {
      return new DriveError('quota', detail);
    }
    if (reasons.some((reason) => SCOPE_REASONS.includes(reason))) {
      return new DriveError('signIn', detail);
    }
  }
  return new DriveError('failed', detail);
}

async function expectOk(response: Response, what: string): Promise<Response> {
  if (response.ok) return response;
  throw await refusal(response, what);
}

/** A boundary for a multipart body: random, so a backup's bytes never hold it. */
function boundary(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return `platewise-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** How many bytes a resumable session holds, from its `Range: bytes=0-<last>`; null without. */
function receivedBytes(range: string | null): number | null {
  const match = range ? /^bytes=0-(\d+)$/.exec(range.trim()) : null;
  return match ? Number(match[1]) + 1 : null;
}

/**
 * Runs one request, its body read included, with `ms` to answer. One that takes longer is
 * stopped and fails as a plain failure (it is tried again later), never as offline.
 */
async function timed<T>(ms: number, what: string, work: (signal: AbortSignal) => Promise<T>) {
  const stop = new AbortController();
  let late = false;
  const timer = setTimeout(() => {
    late = true;
    stop.abort();
  }, ms);
  try {
    return await work(stop.signal);
  } catch (error) {
    if (late) throw new DriveError('failed', `${what}: no answer in ${ms / 1000} s`, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function createDriveClient(deps: DriveClientDeps): DriveClient {
  const { tokens } = deps;
  let folder: Promise<string> | null = null;

  /** One request; a request that gets no answer at all is `offline`. */
  async function call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await deps.fetch(url, init);
    } catch (error) {
      throw new DriveError('offline', url.split('?')[0], error);
    }
  }

  /** A signed request; a 401 refreshes the token once and repeats it. */
  async function signed(url: string, init: RequestInit = {}): Promise<Response> {
    const withToken = (token: string): RequestInit => ({
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
    const first = await call(url, withToken(await tokens.get()));
    if (first.status !== 401) return first;
    return call(url, withToken(await tokens.refresh()));
  }

  /** Every file matching `query`, page by page, oldest or newest first. */
  async function search(query: string, newestFirst: boolean): Promise<RawFile[]> {
    const found: RawFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: query,
        spaces: 'drive',
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        orderBy: newestFirst ? 'createdTime desc' : 'createdTime',
        pageSize: '100',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await timed(DRIVE_METADATA_TIMEOUT_MS, 'list', async (signal) => {
        const response = await expectOk(await signed(`${FILES}?${params}`, { signal }), 'list');
        return (await response.json()) as { files?: unknown; nextPageToken?: unknown };
      });
      if (Array.isArray(page.files)) found.push(...(page.files as RawFile[]));
      pageToken = typeof page.nextPageToken === 'string' ? page.nextPageToken : undefined;
    } while (pageToken);
    return found;
  }

  async function findOrMakeFolder(): Promise<string> {
    const found = await search(
      `mimeType = '${FOLDER_TYPE}' and ${tagged(FOLDER_TAG)} and trashed = false`,
      false,
    );
    const existing = found.find((raw) => isOurs(raw, FOLDER_TAG) && typeof raw.id === 'string');
    if (existing) return existing.id as string;
    const made = await timed(DRIVE_METADATA_TIMEOUT_MS, 'make folder', async (signal) => {
      const response = await expectOk(
        await signed(`${FILES}?fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': JSON_TYPE },
          body: JSON.stringify({
            name: DRIVE_FOLDER_NAME,
            mimeType: FOLDER_TYPE,
            appProperties: { [DRIVE_TAG]: FOLDER_TAG },
          }),
          signal,
        }),
        'make folder',
      );
      return (await response.json()) as RawFile;
    });
    if (typeof made.id !== 'string') throw new DriveError('failed', 'no folder id');
    return made.id;
  }

  function folderId(): Promise<string> {
    folder ??= findOrMakeFolder().catch((error: unknown) => {
      folder = null;
      throw error;
    });
    return folder;
  }

  function metadata(name: string, parent: string, install: string) {
    return {
      name,
      mimeType: ZIP_TYPE,
      parents: [parent],
      appProperties: { [DRIVE_TAG]: BACKUP_TAG, [DRIVE_INSTALL_TAG]: install },
    };
  }

  async function uploaded(response: Response, what: string): Promise<DriveFile> {
    const file = fileOf((await (await expectOk(response, what)).json()) as RawFile);
    if (!file) throw new DriveError('failed', `${what}: no file in the answer`);
    return file;
  }

  async function multipart(
    name: string,
    data: Blob,
    parent: string,
    install: string,
  ): Promise<DriveFile> {
    const mark = boundary();
    const body = new Blob([
      `--${mark}\r\nContent-Type: ${JSON_TYPE}\r\n\r\n`,
      JSON.stringify(metadata(name, parent, install)),
      `\r\n--${mark}\r\nContent-Type: ${ZIP_TYPE}\r\n\r\n`,
      data,
      `\r\n--${mark}--`,
    ]);
    return timed(DRIVE_TRANSFER_TIMEOUT_MS, 'upload', async (signal) =>
      uploaded(
        await signed(`${UPLOADS}?uploadType=multipart&fields=${FILE_FIELDS}`, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${mark}` },
          body,
          signal,
        }),
        'upload',
      ),
    );
  }

  /** Sends `data` to a resumable session piece by piece; returns the last answer. */
  async function pieces(session: string, data: Blob): Promise<Response> {
    let from = 0;
    let resumed = false;
    const rounds = 2 * Math.ceil(data.size / DRIVE_CHUNK_BYTES) + 2;
    for (let round = 0; round < rounds; round++) {
      const end = Math.min(from + DRIVE_CHUNK_BYTES, data.size);
      let answer: Response;
      let asked = false;
      try {
        // The session address is the credential: no token, so no refresh either.
        answer = await timed(DRIVE_TRANSFER_TIMEOUT_MS, 'upload', (signal) =>
          call(session, {
            method: 'PUT',
            headers: {
              'Content-Type': ZIP_TYPE,
              'Content-Range': `bytes ${from}-${end - 1}/${data.size}`,
            },
            body: data.slice(from, end),
            signal,
          }),
        );
      } catch (error) {
        // A dropped connection (not a timeout): ask how far the session got, once per upload.
        if (resumed || driveProblemOf(error) !== 'offline') throw error;
        resumed = true;
        asked = true;
        answer = await timed(DRIVE_METADATA_TIMEOUT_MS, 'upload status', (signal) =>
          call(session, {
            method: 'PUT',
            headers: { 'Content-Range': `bytes */${data.size}` },
            signal,
          }),
        );
      }
      if (answer.status !== 308) return answer;
      // Drive says how much it holds; a piece it answered without saying arrived whole.
      const next = receivedBytes(answer.headers.get('Range')) ?? (asked ? 0 : end);
      if (next >= data.size) throw new DriveError('failed', 'the session holds every byte');
      from = next;
    }
    throw new DriveError('failed', 'the upload session does not move on');
  }

  async function resumable(
    name: string,
    data: Blob,
    parent: string,
    install: string,
  ): Promise<DriveFile> {
    const session = await timed(DRIVE_METADATA_TIMEOUT_MS, 'start upload', async (signal) => {
      const opened = await expectOk(
        await signed(`${UPLOADS}?uploadType=resumable&fields=${FILE_FIELDS}`, {
          method: 'POST',
          headers: {
            'Content-Type': JSON_TYPE,
            'X-Upload-Content-Type': ZIP_TYPE,
            'X-Upload-Content-Length': String(data.size),
          },
          body: JSON.stringify(metadata(name, parent, install)),
          signal,
        }),
        'start upload',
      );
      return opened.headers.get('Location');
    });
    if (!session) throw new DriveError('failed', 'no upload session');
    return uploaded(await pieces(session, data), 'upload');
  }

  async function put(name: string, data: Blob, install: string): Promise<DriveFile> {
    const parent = await folderId();
    return data.size > DRIVE_MULTIPART_LIMIT
      ? resumable(name, data, parent, install)
      : multipart(name, data, parent, install);
  }

  async function list(): Promise<DriveFile[]> {
    const found = await search(
      `mimeType = '${ZIP_TYPE}' and ${tagged(BACKUP_TAG)} and trashed = false`,
      true,
    );
    return found
      .filter((raw) => isOurs(raw, BACKUP_TAG))
      .flatMap((raw) => fileOf(raw) ?? [])
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async function remove(id: string): Promise<void> {
    await timed(DRIVE_METADATA_TIMEOUT_MS, 'delete', async (signal) => {
      const url = `${FILES}/${encodeURIComponent(id)}`;
      const response = await signed(url, { method: 'DELETE', signal });
      if (response.status !== 404) await expectOk(response, 'delete');
    });
  }

  return {
    async upload(name, data, install) {
      try {
        return await put(name, data, install);
      } catch (error) {
        // The folder was deleted in Drive while the app ran: find or make it again, once.
        if (driveProblemOf(error) !== 'missing' || folder === null) throw error;
        folder = null;
        return put(name, data, install);
      }
    },

    list,

    download(file) {
      return timed(DRIVE_TRANSFER_TIMEOUT_MS, 'download', async (signal) => {
        const url = `${FILES}/${encodeURIComponent(file.id)}?alt=media`;
        const response = await expectOk(await signed(url, { signal }), 'download');
        return new File([await response.blob()], file.name, { type: ZIP_TYPE });
      });
    },

    remove,

    async prune(keep, install) {
      const removed: string[] = [];
      const own = (await list()).filter((file) => file.install === install);
      for (const file of own.slice(keep)) {
        await remove(file.id);
        removed.push(file.id);
      }
      return removed;
    },

    async account() {
      const about = await timed(DRIVE_METADATA_TIMEOUT_MS, 'about', async (signal) => {
        const url = `${ABOUT}?fields=${encodeURIComponent('user(emailAddress)')}`;
        const response = await expectOk(await signed(url, { signal }), 'about');
        return (await response.json()) as { user?: { emailAddress?: unknown } };
      });
      const email = about.user?.emailAddress;
      return typeof email === 'string' && email !== '' ? email : null;
    },

    forget() {
      folder = null;
    },
  };
}
