/**
 * A scripted OpenAI-compatible provider for e2e and parity runs (P00-09). It listens on 127.0.0.1
 * only and answers `POST /v1/chat/completions` from a loaded script, one reply per request in
 * order, so AI flows run without keys or network. The app reaches it as the Custom provider at
 * `${url}/v1`; plain HTTP is allowed there because it is loopback (D-16.26).
 *
 * Control routes for tests: `POST /__script` loads `{"name": "food-ok"}` (a file in ./scripts) or
 * an inline `{"replies": [...]}`, `GET /__requests` lists what the app sent (never the key), and
 * `POST /__reset` forgets both. Every reply carries `Access-Control-Allow-Origin: *`.
 */
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FAKE_AI_HOST = '127.0.0.1';
export const DEFAULT_FAKE_AI_PORT = 4320;
export const FAKE_AI_PORT_ENV = 'PLATEWISE_FAKE_AI_PORT';
/** Set by global-setup.ts for the specs: the server root, e.g. http://127.0.0.1:4320. */
export const FAKE_AI_URL_ENV = 'PLATEWISE_FAKE_AI_URL';
export const CHAT_PATH = '/v1/chat/completions';

/** Named scripts: `<SCRIPTS_DIR>/<name>.json`. */
export const SCRIPTS_DIR = fileURLToPath(new URL('./scripts/', import.meta.url));

/** One scripted answer. A string body is sent as it is (it need not be JSON); any other as JSON. */
export interface ScriptedReply {
  status: number;
  body: unknown;
  /** Wait this long (ms) before answering; measured with `setTimeout`, so fake timers drive it. */
  delayMs?: number;
}

/** The shape of a script file, and of an inline script sent to `POST /__script`. */
export interface Script {
  about?: string;
  replies: ScriptedReply[];
}

/** What the server kept of one chat-completion request. */
export interface RecordedRequest {
  /** The request headers (lower-case names), without `authorization`. */
  headers: Record<string, string>;
  /** Whether an `authorization` header came with the request; its value is never kept. */
  hasAuthorization: boolean;
  /** The body parsed as JSON, or its raw text when it is not JSON. */
  body: unknown;
}

export interface FakeAi {
  port: number;
  /** The server root, e.g. http://127.0.0.1:4320; the provider base URL is `${url}/v1`. */
  url: string;
  /** Stops listening and drops open connections and pending delayed replies. Safe to repeat. */
  close(): Promise<void>;
}

/** A refused script load or an unusable request, answered with `status` and the message. */
export class ScriptError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ScriptError';
  }
}

/** The port to listen on: `PLATEWISE_FAKE_AI_PORT` when set (0 = any free port), else 4320. */
export function fakeAiPortFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = env[FAKE_AI_PORT_ENV]?.trim();
  if (raw === undefined || raw === '') return DEFAULT_FAKE_AI_PORT;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port > 65_535) {
    throw new RangeError(`${FAKE_AI_PORT_ENV} must be a port number (0-65535), got "${raw}"`);
  }
  return port;
}

const SCRIPT_KEYS = new Set(['about', 'replies']);
const REPLY_KEYS = new Set(['status', 'body', 'delayMs']);
const SCRIPT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ScriptError(`${label}: unknown key "${key}" (allowed: ${[...allowed].join(', ')})`);
    }
  }
}

function readReply(value: unknown, label: string): ScriptedReply {
  if (!isRecord(value)) throw new ScriptError(`${label}: a reply is an object {status, body}`);
  checkKeys(value, REPLY_KEYS, label);
  const { status, body, delayMs } = value;
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 200 || status > 599) {
    throw new ScriptError(`${label}: "status" must be an HTTP status from 200 to 599`);
  }
  if (body === undefined) throw new ScriptError(`${label}: "body" is missing`);
  if (delayMs === undefined) return { status, body };
  if (typeof delayMs !== 'number' || !Number.isFinite(delayMs) || delayMs < 0) {
    throw new ScriptError(`${label}: "delayMs" must be a number of milliseconds, 0 or more`);
  }
  return { status, body, delayMs };
}

/** Checks a script's shape (file or inline); throws a ScriptError naming the first problem. */
export function readScript(value: unknown, label: string): Script {
  if (!isRecord(value)) throw new ScriptError(`${label}: a script is an object {"replies": [...]}`);
  checkKeys(value, SCRIPT_KEYS, label);
  const { about, replies } = value;
  if (about !== undefined && typeof about !== 'string') {
    throw new ScriptError(`${label}: "about" must be text`);
  }
  if (!Array.isArray(replies)) throw new ScriptError(`${label}: "replies" must be a list`);
  const read = replies.map((reply, i) => readReply(reply, `${label}, reply ${i + 1}`));
  return about === undefined ? { replies: read } : { about, replies: read };
}

/** Reads `<SCRIPTS_DIR>/<name>.json`; the name is a plain slug, so it never leaves the folder. */
export async function loadNamedScript(name: string): Promise<Script> {
  if (!SCRIPT_NAME.test(name)) {
    throw new ScriptError(`a script name is a slug such as "food-ok", got ${JSON.stringify(name)}`);
  }
  let text: string;
  try {
    text = await readFile(join(SCRIPTS_DIR, `${name}.json`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ScriptError(`no script named "${name}" in e2e/fake-ai/scripts/`, 404);
    }
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ScriptError(`script "${name}": the file is not valid JSON`);
  }
  return readScript(json, `script "${name}"`);
}

function errorBody(message: string): { error: { message: string; type: string } } {
  return { error: { message: `fake AI: ${message}`, type: 'fake_ai' } };
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Starts the server on 127.0.0.1; `port` defaults to `fakeAiPortFromEnv()`. */
export async function startFakeAi(options: { port?: number } = {}): Promise<FakeAi> {
  const wanted = options.port ?? fakeAiPortFromEnv();
  let scriptName: string | null = null;
  let script: ScriptedReply[] | null = null;
  let next = 0;
  let requests: RecordedRequest[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, ms);
      timers.add(timer);
    });
  }

  /** The next scripted reply, or a 500 that says why there is none. */
  function takeReply(): ScriptedReply {
    if (script === null) {
      return { status: 500, body: errorBody('no script is loaded; load one with POST /__script') };
    }
    if (script.length === 0) {
      return { status: 500, body: errorBody(`script "${scriptName}" has no replies`) };
    }
    const reply = script[next];
    if (reply === undefined) {
      const sent = `all ${script.length} ${script.length === 1 ? 'reply was' : 'replies were'} sent`;
      return {
        status: 500,
        body: errorBody(`script "${scriptName}" is used up (${sent}); load another one`),
      };
    }
    next += 1;
    return reply;
  }

  async function answerChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const text = await readText(req);
    const { authorization, ...headers } = req.headers;
    const parsed = parseJson(text);
    requests.push({
      headers: Object.fromEntries(
        Object.entries(headers).flatMap(([name, value]) =>
          value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]],
        ),
      ),
      hasAuthorization: authorization !== undefined,
      body: parsed.ok ? parsed.value : text,
    });
    // Taken on arrival, so a slow first reply never trades places with the second.
    const reply = takeReply();
    if (reply.delayMs) await wait(reply.delayMs);
    // The caller gave up while we waited (Cancel, Coach Reset): nobody is left to answer.
    if (res.destroyed) return;
    send(res, reply.status, reply.body);
  }

  async function loadScript(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = parseJson(await readText(req));
    if (!parsed.ok) throw new ScriptError('POST /__script needs a JSON body');
    const request = parsed.value;
    let name: string;
    let loaded: Script;
    if (isRecord(request) && 'name' in request) {
      const { name: wanted, ...rest } = request;
      if (Object.keys(rest).length > 0) {
        throw new ScriptError(
          'send either {"name": ...} or an inline {"replies": [...]}, not both',
        );
      }
      if (typeof wanted !== 'string') {
        throw new ScriptError(`"name" must be a script name such as "food-ok"`);
      }
      loaded = await loadNamedScript(wanted);
      name = wanted;
    } else {
      loaded = readScript(request, 'inline script');
      name = 'inline';
    }
    scriptName = name;
    script = loaded.replies;
    next = 0;
    send(res, 200, { loaded: name, replies: loaded.replies.length });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const method = req.method ?? 'GET';
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      });
      res.end();
      return;
    }
    const path = new URL(req.url ?? '/', 'http://fake-ai.invalid').pathname;
    switch (`${method} ${path}`) {
      case `POST ${CHAT_PATH}`:
        return answerChat(req, res);
      case 'POST /__script':
        return loadScript(req, res);
      case 'GET /__requests':
        return send(res, 200, { requests });
      case 'POST /__reset':
        scriptName = null;
        script = null;
        next = 0;
        requests = [];
        return send(res, 204);
      default:
        return send(res, 404, errorBody(`no route for ${method} ${path}`));
    }
  }

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }
      const status = error instanceof ScriptError ? error.status : 500;
      send(res, status, errorBody(error instanceof Error ? error.message : String(error)));
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(
              `fake AI: ${FAKE_AI_HOST}:${wanted} is already in use; set ${FAKE_AI_PORT_ENV} to a free port`,
            )
          : error,
      );
    };
    server.once('error', onError);
    server.listen(wanted, FAKE_AI_HOST, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const { port } = server.address() as AddressInfo;
  let closing: Promise<void> | undefined;
  return {
    port,
    url: `http://${FAKE_AI_HOST}:${port}`,
    close() {
      closing ??= new Promise<void>((resolve, reject) => {
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      return closing;
    },
  };
}
