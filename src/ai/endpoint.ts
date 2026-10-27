/**
 * Server addresses for the providers people run themselves (Ollama, Custom). An address is
 * tidied before it is stored or compared (R03.22): adapters append a path such as
 * `/chat/completions`, so a trailing slash would give `//chat/completions`. Plain http is
 * accepted only for this device: it would send the key unencrypted, and a page served over https
 * cannot reach a plain-http address on the local network anyway (D-16.26, R03.3).
 */
import type { ProviderId } from './catalog/providers';
import { err, ok, type Result } from '../lib/result';

/** Trims the text and removes every trailing slash. */
export function normaliseBaseUrl(text: string): string {
  return text.trim().replace(/\/+$/, '');
}

/**
 * Whether two addresses name the same server path: compared as the URL parser writes them
 * (scheme and host in lower case, a default port dropped), or as tidied text when either is not
 * an address.
 */
export function sameServerUrl(a: string, b: string): boolean {
  return canonical(a) === canonical(b);
}

function canonical(text: string): string {
  const tidy = normaliseBaseUrl(text);
  try {
    return normaliseBaseUrl(new URL(tidy).href);
  } catch {
    return tidy;
  }
}

/**
 * The hosts plain http may reach: this device only, as the URL parser writes them. Not `[::1]`:
 * a CSP source cannot name an IPv6 address, so the page's `connect-src` could never let a request
 * to it through (S-3).
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

/** This device as an IPv6 address, as the URL parser writes it. */
const IPV6_LOOPBACK = '[::1]';

/**
 * Why an address cannot be saved: nothing typed; not an address (or one carrying a query or
 * fragment, which the appended path would break); a user name or password inside it (`fetch`
 * refuses those); a scheme other than http and https; plain http to another machine; plain http
 * to this device written as `[::1]` (type `localhost` or `127.0.0.1` instead).
 */
export type UrlProblem =
  'empty' | 'malformed' | 'credentials' | 'scheme' | 'plainHttp' | 'ipv6Loopback';

/** Advice that does not block saving: Ollama's OpenAI-compatible API lives under `/v1`. */
export type UrlHint = 'addV1';

export interface CheckedUrl {
  /** The address as it will be stored: trimmed, without trailing slashes. */
  readonly url: string;
  readonly hint?: UrlHint;
}

/**
 * Checks a server address before it is saved: https to any host, plain http only to
 * `localhost` or `127.0.0.1`. For Ollama, an address whose path does not end in `/v1` is accepted
 * with the `addV1` hint.
 */
export function checkServerUrl(
  text: string,
  provider?: ProviderId,
): Result<CheckedUrl, UrlProblem> {
  const url = normaliseBaseUrl(text);
  if (url === '') return err('empty');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return err('malformed');
  }
  if (parsed.search !== '' || parsed.hash !== '' || url.includes('?') || url.includes('#')) {
    return err('malformed');
  }
  if (parsed.username !== '' || parsed.password !== '') return err('credentials');
  if (parsed.protocol === 'http:') {
    if (parsed.hostname === IPV6_LOOPBACK) return err('ipv6Loopback');
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) return err('plainHttp');
  } else if (parsed.protocol !== 'https:') {
    return err('scheme');
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  return provider === 'ollama' && !path.endsWith('/v1') ? ok({ url, hint: 'addV1' }) : ok({ url });
}
