/**
 * A scripted OpenAI-compatible provider for e2e and parity runs, so no run needs a key or the
 * internet and every run gets the same answers. It listens on 127.0.0.1 only (plain HTTP is
 * allowed for loopback, D-16.26); the app reaches it as the Custom provider at
 * `http://127.0.0.1:<port>/v1`.
 *
 * Routes (every reply carries `Access-Control-Allow-Origin: *`):
 * - `POST /v1/chat/completions`: recorded, then answered with the script's next reply.
 * - `POST /__script`: `{ "name": "<file in scripts/ without .json>" }` or an inline script.
 * - `GET /__requests`: the recorded chat requests, oldest first, never with `authorization`.
 * - `POST /__reset`: an empty script and nothing recorded.
 * - `OPTIONS <any path>`: the CORS preflight.
 *
 * By hand: `pnpm exec tsx e2e/fake-ai/server.ts` (port from PLATEWISE_FAKE_AI_PORT, default 4320).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Loopback only: the fake must never be reachable from another machine. */
export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 4320;
export const PORT_ENV = 'PLATEWISE_FAKE_AI_PORT';
export const CHAT_PATH = '/v1/chat/completions';
export const SCRIPTS_DIR = fileURLToPath(new URL('./scripts/', import.meta.url));

/** One canned answer: an HTTP status, a body, and an optional wait before answering. */
export interface ScriptReply {
  status: number;
  /** A string is sent as-is (so a script can send text that is not JSON); anything else as JSON. */
  body: unknown;
  delayMs?: number;
}

/** What a script file in `scripts/` (or an inline `POST /__script` body) holds. */
export interface Script {
  /** What the script is for, in a line (JSON has no comments). */
  description?: string;
  replies: ScriptReply[];
}

export interface RecordedRequest {
  method: string;
  /** Path and query as sent. */
  path: string;
  /** Lower-case names; `authorization` is never kept. */
  headers: Record<string, string>;
  /** The parsed JSON body, the raw text when it is not JSON, or null when empty. */
  body: unknown;
}

export interface FakeAiServer {
  port: number;
  /** The origin, `http://127.0.0.1:<port>`; the provider base URL is `${url}/v1`. */
  url: string;
  /** Cancels replies still waiting out their delay, drops open connections, stops listening. */
  close(): Promise<void>;
}

/** A script or control request the server refuses; answered with 400. */
export class ScriptError extends Error {
  override name = 'ScriptError';
}

const PREFLIGHT_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const SCRIPT_KEYS = ['description', 'replies'];
const REPLY_KEYS = ['status', 'body', 'delayMs'];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The port from `PLATEWISE_FAKE_AI_PORT`, or 4320 when it is unset or blank. */
export function portFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = env[PORT_ENV]?.trim();
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port > 65_535) {
    throw new Error(`${PORT_ENV} must be a port number from 0 to 65535, not "${raw}"`);
  }
  return port;
}

function parseReply(value: unknown, n: number): ScriptReply {
  const where = `reply ${n}`;
  if (!isRecord(value)) throw new ScriptError(`${where} is not an object`);
  const unknownKey = Object.keys(value).find((key) => !REPLY_KEYS.includes(key));
  if (unknownKey !== undefined) {
    throw new ScriptError(
      `${where}: unknown key "${unknownKey}" (allowed: ${REPLY_KEYS.join(', ')})`,
    );
  }
  const { status, delayMs } = value;
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 200 || status > 599) {
    throw new ScriptError(`${where}: status must be a whole number from 200 to 599`);
  }
  if (!('body' in value)) throw new ScriptError(`${where}: body is missing`);
  if (delayMs === undefined) return { status, body: value.body };
  if (typeof delayMs !== 'number' || !Number.isFinite(delayMs) || delayMs < 0) {
    throw new ScriptError(`${where}: delayMs must be a number of milliseconds, 0 or more`);
  }
  return { status, body: value.body, delayMs };
}

/** Checks a script's shape; throws a ScriptError naming the first problem. */
export function parseScript(value: unknown): Script {
  if (!isRecord(value) || !Array.isArray(value.replies)) {
    throw new ScriptError('a script is an object with a "replies" array');
  }
  const unknownKey = Object.keys(value).find((key) => !SCRIPT_KEYS.includes(key));
  if (unknownKey !== undefined) {
    throw new ScriptError(
      `unknown script key "${unknownKey}" (allowed: ${SCRIPT_KEYS.join(', ')})`,
    );
  }
  const { description } = value;
  if (description !== undefined && typeof description !== 'string') {
    throw new ScriptError('the script description must be a string');
  }
  const replies = value.replies.map((reply, i) => parseReply(reply, i + 1));
  return description === undefined ? { replies } : { description, replies };
}

/** The scripts in `dir`, by name (file name without `.json`), sorted. */
export function scriptNames(dir = SCRIPTS_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .sort();
}

/** Reads and checks `<dir>/<name>.json`. Only names listed in `dir` load, so paths cannot. */
export function readNamedScript(name: string, dir = SCRIPTS_DIR): Script {
  const names = scriptNames(dir);
  if (!names.includes(name)) {
    throw new ScriptError(`no script named "${name}" (scripts: ${names.join(', ')})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
  } catch (error) {
    throw new ScriptError(`script "${name}" is not valid JSON: ${messageOf(error)}`);
  }
  try {
    return parseScript(parsed);
  } catch (error) {
    throw new ScriptError(`script "${name}": ${messageOf(error)}`);
  }
}

/** An OpenAI-style error body, so the app shows the message like a provider's own. */
const errorBody = (message: string) => ({ error: { message, type: 'fake_ai_server' } });

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = typeof body === 'string' ? body : (JSON.stringify(body) ?? 'null');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const text = await readText(req);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ScriptError(`the request body must be JSON: ${messageOf(error)}`);
  }
}

function keptHeaders(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (name === 'authorization' || value === undefined) continue;
    out[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

function bodyOf(text: string): unknown {
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Starts the server on 127.0.0.1. `port` defaults to `PLATEWISE_FAKE_AI_PORT` or 4320; pass 0
 * for a free port (unit tests). Starts with an empty script.
 */
export function startFakeAiServer(options: { port?: number } = {}): Promise<FakeAiServer> {
  const port = options.port ?? portFromEnv();
  let script: Script = { replies: [] };
  /** How replies name the script: `"food-ok"`, `inline`, or `none` before any load. */
  let scriptLabel = 'none';
  /** Chat requests answered since the script was loaded; the next reply's index. */
  let turn = 0;
  let requests: RecordedRequest[] = [];
  const waiting = new Set<ReturnType<typeof setTimeout>>();

  // The global setTimeout, looked up at call time, so a test's fake timers drive the delay.
  const wait = (ms: number) =>
    new Promise<void>((done) => {
      const timer = setTimeout(() => {
        waiting.delete(timer);
        done();
      }, ms);
      waiting.add(timer);
    });

  function noReplyMessage(n: number): string {
    const fix = 'Load a script with POST /__script.';
    if (scriptLabel === 'none') return `fake AI server: no script is loaded. ${fix}`;
    const name = scriptLabel === 'inline' ? 'the inline script' : `script ${scriptLabel}`;
    const count = script.replies.length;
    if (count === 0) return `fake AI server: ${name} has no replies. ${fix}`;
    return (
      `fake AI server: ${name} has ${count} ${count === 1 ? 'reply' : 'replies'}, all used; ` +
      `this is request ${n}. ${fix}`
    );
  }

  async function chat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const text = await readText(req);
    requests.push({
      method: req.method ?? 'POST',
      path: req.url ?? CHAT_PATH,
      headers: keptHeaders(req),
      body: bodyOf(text),
    });
    const n = ++turn;
    const reply = script.replies[n - 1];
    if (!reply) {
      send(res, 500, errorBody(noReplyMessage(n)));
      return;
    }
    if (reply.delayMs) await wait(reply.delayMs);
    // The client left while the reply waited (a Coach Reset, a closed page): nothing to answer.
    if (req.socket.destroyed) return;
    send(res, reply.status, reply.body);
  }

  async function loadScript(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req);
    let name: string | undefined;
    if (isRecord(body) && 'name' in body) {
      if (typeof body.name !== 'string' || Object.keys(body).length !== 1) {
        throw new ScriptError(
          'send { "name": "<script>" } alone, or an inline { "replies": [...] }',
        );
      }
      name = body.name;
    }
    // Checked before anything changes, so a bad script leaves the loaded one in place.
    const next = name === undefined ? parseScript(body) : readNamedScript(name);
    script = next;
    scriptLabel = name === undefined ? 'inline' : `"${name}"`;
    turn = 0;
    send(res, 200, { ok: true, script: name ?? 'inline', replies: next.replies.length });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const path = new URL(req.url ?? '/', `http://${HOST}`).pathname;
    if (method === 'OPTIONS') {
      res.writeHead(204, PREFLIGHT_HEADERS);
      res.end();
    } else if (method === 'POST' && path === CHAT_PATH) {
      await chat(req, res);
    } else if (method === 'POST' && path === '/__script') {
      await loadScript(req, res);
    } else if (method === 'GET' && path === '/__requests') {
      send(res, 200, requests);
    } else if (method === 'POST' && path === '/__reset') {
      script = { replies: [] };
      scriptLabel = 'none';
      turn = 0;
      requests = [];
      send(res, 200, { ok: true });
    } else {
      send(res, 404, errorBody(`fake AI server: no route for ${method} ${path}`));
    }
  }

  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    route(req, res).catch((error: unknown) => {
      if (res.headersSent) return;
      const status = error instanceof ScriptError ? 400 : 500;
      send(res, status, errorBody(`fake AI server: ${messageOf(error)}`));
    });
  });

  const close = () =>
    new Promise<void>((done, fail) => {
      for (const timer of waiting) clearTimeout(timer);
      waiting.clear();
      server.close((error) => (error ? fail(error) : done()));
      server.closeAllConnections();
    });

  return new Promise((done, fail) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      fail(
        error.code === 'EADDRINUSE'
          ? new Error(
              `fake AI server: port ${port} on ${HOST} is in use; stop the other server or set ${PORT_ENV}`,
            )
          : error,
      );
    });
    server.listen(port, HOST, () => {
      const bound = (server.address() as AddressInfo).port;
      done({ port: bound, url: `http://${HOST}:${bound}`, close });
    });
  });
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  const server = await startFakeAiServer();
  console.log(`fake AI server: provider base URL ${server.url}/v1 (Ctrl+C stops it)`);
}
