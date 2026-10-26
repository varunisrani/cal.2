/**
 * Server addresses a person types for Ollama and Custom (spec 03 §3.13, §3.15 item 2). An address
 * is cleaned (R03.22) and then checked: https to any host, plain http only to this device, because
 * a key sent over http to any other host travels in clear text and an https page cannot reach a
 * LAN address over http anyway (D-16.26, R03.3). Reasons are codes; their sentences live with the
 * screens that show them.
 */
import type { ProviderId } from './catalog/providers';

/** The only hosts plain http may use, as the URL parser writes them. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Why a typed address cannot be saved. */
export type ServerUrlRefusal =
  /** Nothing typed. */
  | 'empty'
  /** Not an address with a host, or it carries a query or a fragment. */
  | 'notUrl'
  /** A scheme other than https or http. */
  | 'scheme'
  /** A user name or password inside the address (browsers refuse to send those). */
  | 'credentials'
  /** Plain http to a host other than this device. */
  | 'plainHttp';

/** Advice that does not block saving: an Ollama address usually ends in `/v1`. */
export type ServerUrlHint = 'missingV1';

export type ServerUrlCheck =
  | { readonly ok: true; readonly url: string; readonly hint?: ServerUrlHint }
  | { readonly ok: false; readonly reason: ServerUrlRefusal };

/** The typed address trimmed and without trailing slashes, ready to have a path appended. */
export function normaliseBaseUrl(text: string): string {
  return text.trim().replace(/\/+$/, '');
}

/** Whether `text` may be saved as a server address, and the cleaned address when it may. */
export function checkServerUrl(text: string, provider?: ProviderId): ServerUrlCheck {
  const url = normaliseBaseUrl(text);
  if (url === '') return { ok: false, reason: 'empty' };
  const parsed = parse(url);
  if (parsed === undefined) return { ok: false, reason: 'notUrl' };
  // Before the host test, so `localhost:11434/v1` (scheme left out) is told to add one.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'scheme' };
  }
  // A path is appended to the address, so a query or fragment (even an empty one) would swallow it.
  if (parsed.host === '' || /[?#]/.test(url)) {
    return { ok: false, reason: 'notUrl' };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: 'credentials' };
  }
  if (parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    return { ok: false, reason: 'plainHttp' };
  }
  return provider === 'ollama' && !hasV1Segment(parsed.pathname)
    ? { ok: true, url, hint: 'missingV1' }
    : { ok: true, url };
}

/**
 * Whether two addresses name the same server path: compared cleaned, with the scheme and host in
 * the URL parser's spelling (case and default ports ignored) and the path as typed.
 */
export function sameServer(a: string, b: string): boolean {
  return serverKey(a) === serverKey(b);
}

function serverKey(text: string): string {
  const url = normaliseBaseUrl(text);
  const parsed = parse(url);
  if (parsed === undefined) return url;
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
}

function hasV1Segment(pathname: string): boolean {
  return pathname.split('/').includes('v1');
}

function parse(text: string): URL | undefined {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}
