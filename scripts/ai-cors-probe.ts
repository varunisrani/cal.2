/**
 * The browser CORS probe (P03-19, D-04.1): `PLATEWISE_PROBE=1 pnpm probe:cors`. From a real
 * Chromium page at the app's own origin (the built app under `vite preview`), it sends one tiny
 * text request per configured provider through the app's own adapters and transport, and prints
 * one verdict per provider:
 * - `direct`: the page could read the reply (an answer, or an error it can show);
 * - `needs header`: readable only with Anthropic's direct-browser header;
 * - `blocked`: the browser refused the call (a TypeError, no status for the page);
 * - `opaque error`: the page got a status but nothing readable in the body;
 * - `blocked by environment` or `timeout`: no answer for another reason (the machine's proxy,
 *   DNS, TLS, a refused connection, a vendor that never answered): not a CORS answer;
 * - `skipped`: no key, or no server address for Ollama and Custom.
 *
 * Opt-in: without `PLATEWISE_PROBE=1` it prints "skipped" and sends nothing. Keys come only from
 * `PLATEWISE_PROBE_KEY_<ID>` (the catalogue id in capitals); server addresses from
 * `PLATEWISE_PROBE_URL_OLLAMA` and `PLATEWISE_PROBE_URL_CUSTOM`; `PLATEWISE_PROBE_MODEL_<ID>`
 * replaces the default model. Keys never reach disk, the output or an address: every printed line
 * goes through `redact`. Exit code: 0 whatever the verdicts, 1 when the script itself failed.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PROVIDER_IDS,
  PROVIDERS,
  type BrowserAccess,
  type ProviderId,
} from '../src/ai/catalog/providers';
import { defaultModel } from '../src/ai/catalog/presets';
import { checkServerUrl } from '../src/ai/endpoint';
import type { PageOutcome, PageRequest } from './ai-cors-probe/page';

export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const FLAG = 'PLATEWISE_PROBE';
/** How long one request may take before it counts as `timeout`. */
export const REQUEST_TIMEOUT_SECONDS = 30;
/** Anthropic's opt-in for calls from a browser page; the control request leaves it out. */
export const DIRECT_BROWSER_HEADER = 'anthropic-dangerous-direct-browser-access';

export type Env = Readonly<Record<string, string | undefined>>;

/** `PLATEWISE_PROBE_KEY_GEMINI`, `PLATEWISE_PROBE_URL_CUSTOM`, `PLATEWISE_PROBE_MODEL_QWEN`, … */
export function envName(kind: 'KEY' | 'URL' | 'MODEL', id: ProviderId): string {
  return `PLATEWISE_PROBE_${kind}_${id.toUpperCase()}`;
}

// ---- Redaction ---------------------------------------------------------------------------------

const MASK = '[redacted]';

/**
 * A value of one of the key-carrying headers, written as `name: value`, `"name":"value"` or
 * `name=value`, with an optional auth scheme kept in front of the hidden value.
 */
const KEY_HEADER_VALUE =
  /\b(authorization|x-api-key|x-goog-api-key)(["']?\s*[:=]\s*["']?)(?:(bearer|basic)\s+)?([^\s"',;&)}\]]+)/gi;

/**
 * `text` with every secret, and every value of an `Authorization`, `x-api-key` or
 * `x-goog-api-key` header or field, replaced by `[redacted]`. A secret is also found trimmed and
 * URL-encoded; longer secrets go first, so one that contains another is hidden whole.
 */
export function redact(text: string, secrets: readonly string[]): string {
  const forms = new Set<string>();
  for (const secret of secrets) {
    for (const form of [secret, secret.trim(), encodeURIComponent(secret.trim())]) {
      if (form.trim() !== '') forms.add(form);
    }
  }
  const byHeader = text.replace(
    KEY_HEADER_VALUE,
    (_match, name: string, separator: string, scheme: string | undefined) =>
      `${name}${separator}${scheme === undefined ? '' : `${scheme} `}${MASK}`,
  );
  return [...forms]
    .sort((a, b) => b.length - a.length)
    .reduce((out, form) => out.split(form).join(MASK), byHeader);
}

/** Every probe key in the environment, whether or not its provider is probed: all are hidden. */
export function probeSecrets(env: Env): string[] {
  return Object.entries(env)
    .filter(([name, value]) => name.startsWith('PLATEWISE_PROBE_KEY_') && value?.trim())
    .map(([, value]) => value!);
}

// ---- The plan ----------------------------------------------------------------------------------

export interface Probe {
  readonly kind: 'probe';
  readonly id: ProviderId;
  readonly baseUrl: string;
  readonly model: string;
  readonly key?: string;
}

export interface Skip {
  readonly kind: 'skip';
  readonly id: ProviderId;
  readonly reason: string;
}

/**
 * What to do for each catalogue entry, in catalogue order. A cloud vendor is probed when its key
 * is set; Ollama and Custom when their server address is set and the app would accept it (https,
 * or plain http to this machine only). Custom sends its key when one is set; Ollama never does.
 */
export function planProbes(env: Env): Array<Probe | Skip> {
  const value = (name: string): string | undefined => env[name]?.trim() || undefined;
  return PROVIDER_IDS.map((id): Probe | Skip => {
    const entry = PROVIDERS[id];
    const model = value(envName('MODEL', id)) ?? defaultModel(id, 'text');
    const key = entry.key === 'none' ? undefined : value(envName('KEY', id));
    if (entry.endpoint === 'userServer') {
      const address = value(envName('URL', id));
      if (address === undefined) {
        return { kind: 'skip', id, reason: `no server address (set ${envName('URL', id)})` };
      }
      const checked = checkServerUrl(address, id);
      // The address itself is not printed: it could carry a user name and password.
      if (!checked.ok) {
        return { kind: 'skip', id, reason: `server address refused: ${checked.error}` };
      }
      return { kind: 'probe', id, baseUrl: checked.value.url, model, ...(key ? { key } : {}) };
    }
    if (key === undefined) {
      return { kind: 'skip', id, reason: `no key (set ${envName('KEY', id)})` };
    }
    return { kind: 'probe', id, baseUrl: entry.baseUrl, model, key };
  });
}

/** The page's input for a planned probe. */
export function pageRequest(probe: Probe, withoutHeaders?: readonly string[]): PageRequest {
  return {
    provider: probe.id,
    baseUrl: probe.baseUrl,
    model: probe.model,
    ...(probe.key === undefined ? {} : { key: probe.key }),
    ...(withoutHeaders === undefined ? {} : { withoutHeaders }),
    timeoutSeconds: REQUEST_TIMEOUT_SECONDS,
  };
}

// ---- Verdicts ----------------------------------------------------------------------------------

export type Verdict =
  | 'direct'
  | 'needs header'
  | 'blocked'
  | 'opaque error'
  | 'blocked by environment'
  | 'timeout'
  | 'skipped';

/** What Chromium's network layer and console said about the request, beside the page's view. */
export interface NetworkClue {
  /** Playwright's `requestfailed` text, such as `net::ERR_FAILED`. */
  readonly errorText?: string;
  /** Chromium's console line for a CORS refusal of this address, matched but never printed. */
  readonly corsMessage?: string;
}

/** One request: what the page saw and what the network layer saw. */
export interface Attempt {
  readonly outcome: PageOutcome;
  readonly clue: NetworkClue;
}

export interface Judgement {
  readonly verdict: Verdict;
  readonly detail: string;
}

/** Network failures of the machine or the route, not of the vendor's CORS answer. */
const ENVIRONMENT_ERROR =
  /^net::ERR_(TUNNEL_|PROXY_|NAME_|INTERNET_|CONNECTION_|ADDRESS_|NETWORK_|CERT_|SSL_|TIMED_OUT|UNSAFE_PORT)/;

const ENVIRONMENT_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/TUNNEL_CONNECTION_FAILED/, 'the proxy refused the host or could not resolve it'],
  [/PROXY_/, 'the proxy failed'],
  [/NAME_/, 'the host name did not resolve'],
  [/CERT_|SSL_/, 'TLS failed'],
  [/CONNECTION_REFUSED/, 'nothing listens there'],
];

/** Our own short phrase for Chromium's "blocked by CORS policy" console line. */
export function corsReason(message: string): string {
  const parts: string[] = [];
  if (/preflight/i.test(message)) parts.push('preflight refused');
  const header = /Request header field (\S+) is not allowed/i.exec(message)?.[1];
  if (header !== undefined) parts.push(`header not allowed: ${header.toLowerCase()}`);
  else if (/No 'Access-Control-Allow-Origin' header/i.test(message)) {
    parts.push('no Access-Control-Allow-Origin');
  } else if (/Access-Control-Allow-Origin/i.test(message)) {
    parts.push('Access-Control-Allow-Origin does not match');
  }
  return parts.length > 0 ? parts.join(', ') : 'refused by CORS policy';
}

/** The verdict for one request. */
export function judgeAttempt({ outcome, clue }: Attempt): Judgement {
  if (outcome.kind === 'reply') {
    const status = `HTTP ${outcome.status}`;
    if (outcome.blankBody) return { verdict: 'opaque error', detail: `${status}, blank body` };
    if ((outcome.status >= 200 && outcome.status <= 299) || outcome.hasMessage) {
      return { verdict: 'direct', detail: `${status}, ${outcome.read}` };
    }
    return { verdict: 'opaque error', detail: `${status}, no message in the body` };
  }
  if (outcome.failure === 'timeout') {
    return { verdict: 'timeout', detail: `no answer in ${REQUEST_TIMEOUT_SECONDS} s` };
  }
  if (clue.corsMessage !== undefined) {
    return { verdict: 'blocked', detail: `CORS: ${corsReason(clue.corsMessage)}` };
  }
  const errorText = clue.errorText;
  if (errorText !== undefined && ENVIRONMENT_ERROR.test(errorText)) {
    const hint = ENVIRONMENT_HINTS.find(([pattern]) => pattern.test(errorText))?.[1];
    return {
      verdict: 'blocked by environment',
      detail: hint === undefined ? errorText : `${errorText} (${hint})`,
    };
  }
  if (outcome.failure === 'offline') {
    return { verdict: 'blocked by environment', detail: 'the browser reports no connection' };
  }
  return { verdict: 'blocked', detail: errorText ?? 'TypeError, cause unknown' };
}

/**
 * The verdict for a provider that sends Anthropic's opt-in header, from the request as the app
 * sends it and the same request without the header. Only a refusal of the second makes it
 * `needs header`; a second request that also gets through means the header is no longer needed.
 */
export function judgeWithHeaderCheck(withHeader: Judgement, withoutHeader: Judgement): Judgement {
  if (withHeader.verdict !== 'direct') return withHeader;
  if (withoutHeader.verdict === 'blocked') {
    return {
      verdict: 'needs header',
      detail: `${withHeader.detail}; without the header: ${withoutHeader.detail}`,
    };
  }
  if (withoutHeader.verdict === 'direct') {
    return { verdict: 'direct', detail: `${withHeader.detail}; works without the header too` };
  }
  return {
    verdict: 'direct',
    detail: `${withHeader.detail}; without the header: ${withoutHeader.verdict} (${withoutHeader.detail})`,
  };
}

/** What the catalogue's `browserAccess` predicts the probe will find. */
const EXPECTED: Readonly<Record<BrowserAccess, Verdict>> = {
  direct: 'direct',
  directWithHeader: 'needs header',
  // The person's own server must allow our origin; then it behaves like a direct vendor.
  userServer: 'direct',
  unsupported: 'blocked',
};

/** The verdicts that answer the CORS question; the others say nothing about the catalogue. */
const MEASURED: ReadonlySet<Verdict> = new Set([
  'direct',
  'needs header',
  'blocked',
  'opaque error',
]);

export interface Row extends Judgement {
  readonly id: ProviderId;
}

export function differsFromCatalogue(row: Row): boolean {
  return MEASURED.has(row.verdict) && EXPECTED[PROVIDERS[row.id].browserAccess] !== row.verdict;
}

// ---- Output ------------------------------------------------------------------------------------

export function formatTable(rows: readonly Row[]): string {
  const cells = [
    ['provider', 'catalogue', 'verdict', 'detail'],
    ...rows.map((row) => [
      PROVIDERS[row.id].name,
      PROVIDERS[row.id].browserAccess,
      row.verdict,
      row.detail,
    ]),
  ];
  const widths = [0, 1, 2].map((i) => Math.max(...cells.map((line) => line[i]!.length)));
  const lines = cells.map((line) =>
    line
      .map((cell, i) => (i < 3 ? cell.padEnd(widths[i]!) : cell))
      .join('  ')
      .trimEnd(),
  );

  const probed = rows.filter((row) => row.verdict !== 'skipped');
  const measured = rows.filter((row) => MEASURED.has(row.verdict));
  const differing = rows.filter(differsFromCatalogue);
  if (probed.length === 0) {
    lines.push(
      '',
      'Nothing was probed. Set PLATEWISE_PROBE_KEY_<ID> for the vendors to check ' +
        '(PLATEWISE_PROBE_URL_OLLAMA or PLATEWISE_PROBE_URL_CUSTOM for a server you run).',
    );
  } else if (measured.length === 0) {
    lines.push('', 'No provider gave a CORS answer: see the details.');
  } else if (differing.length === 0) {
    lines.push('', `All ${measured.length} measured providers match the catalogue.`);
  } else {
    const names = differing.map(
      (row) =>
        `${PROVIDERS[row.id].name} (catalogue says ${PROVIDERS[row.id].browserAccess}, ` +
        `found ${row.verdict})`,
    );
    lines.push('', `Differs from the catalogue: ${names.join('; ')}.`);
  }
  return lines.join('\n');
}

// ---- Running -----------------------------------------------------------------------------------

/** A browser page at the app's origin, ready to send probe requests. */
export interface ProbeSession {
  /** Where the page is served, e.g. `http://127.0.0.1:41234`. */
  readonly origin: string;
  readonly browser: string;
  send(request: PageRequest): Promise<Attempt>;
  close(): Promise<void>;
}

/** Builds and serves the app and opens Chromium; `log` prints progress lines. */
export type OpenSession = (log: (line: string) => void) => Promise<ProbeSession>;

/** Probes one provider: one request, plus the no-header control for `directWithHeader`. */
export async function probeProvider(session: ProbeSession, probe: Probe): Promise<Row> {
  const first = judgeAttempt(await session.send(pageRequest(probe)));
  if (PROVIDERS[probe.id].browserAccess !== 'directWithHeader' || first.verdict !== 'direct') {
    return { id: probe.id, ...first };
  }
  const control = judgeAttempt(await session.send(pageRequest(probe, [DIRECT_BROWSER_HEADER])));
  return { id: probe.id, ...judgeWithHeaderCheck(first, control) };
}

export interface MainOptions {
  readonly write?: (text: string) => void;
  readonly writeError?: (text: string) => void;
  readonly open?: OpenSession;
}

const openBrowserSession: OpenSession = async (log) => {
  const { openSession } = await import('./ai-cors-probe/browser');
  return openSession(PRODUCT_ROOT, log);
};

export async function main(env: Env, options: MainOptions = {}): Promise<number> {
  const secrets = probeSecrets(env);
  const out = options.write ?? ((text: string) => process.stdout.write(`${text}\n`));
  const outError = options.writeError ?? ((text: string) => process.stderr.write(`${text}\n`));
  const print = (text: string): void => out(redact(text, secrets));
  const printError = (text: string): void => outError(redact(text, secrets));

  if (env[FLAG] !== '1') {
    print(
      `CORS probe skipped: set ${FLAG}=1 to run it. It sends one small request to each ` +
        'provider you give a key for (PLATEWISE_PROBE_KEY_<ID>).',
    );
    return 0;
  }

  const plan = planProbes(env);
  const probes = plan.filter((step): step is Probe => step.kind === 'probe');
  const rows = new Map<ProviderId, Row>(
    plan.flatMap((step) =>
      step.kind === 'skip'
        ? [[step.id, { id: step.id, verdict: 'skipped', detail: step.reason } as Row]]
        : [],
    ),
  );

  if (probes.length > 0) {
    let session: ProbeSession | undefined;
    let failed = false;
    try {
      session = await (options.open ?? openBrowserSession)(print);
      print(`Probing ${probes.length} provider(s) from ${session.origin} in ${session.browser}.`);
      for (const probe of probes) rows.set(probe.id, await probeProvider(session, probe));
    } catch (error) {
      printError(`CORS probe failed: ${describe(error)}`);
      failed = true;
    }
    try {
      await session?.close();
    } catch (error) {
      printError(
        `CORS probe could not close the browser or the preview server: ${describe(error)}`,
      );
      failed = true;
    }
    if (failed) return 1;
  }

  print(formatTable(PROVIDER_IDS.map((id) => rows.get(id)!)));
  return 0;
}

function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main(process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${redact(String(error), probeSecrets(process.env))}\n`);
      process.exitCode = 1;
    },
  );
}
