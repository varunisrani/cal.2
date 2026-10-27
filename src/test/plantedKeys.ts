/**
 * Planted keys for the security review's tests (P10-09). Each key slot the app can store gets a
 * made-up key of its own, long and distinctive, so finding one anywhere in an output is a leak and
 * never a coincidence. `plantedIn` names the keys found in a text or in raw bytes: as typed, as
 * UTF-16, and as base64 at any byte alignment (a key inside an encoded Blob). `recordConsole`
 * keeps every console call of a test, errors read through their message, stack and cause, so a
 * test can search what would have been logged. `plantKeys` stores them all, sealed, as the app
 * does.
 */
import { vi } from 'vitest';
import { PROVIDER_IDS, PROVIDERS } from '../ai/catalog/providers';
import type { ProviderKeys } from '../ai/settings';
import { createSecretsRepo } from '../data/repos/secretsRepo';
import type { PlatewiseDb } from '../data/schema';
import type { Clock } from '../lib/clock';

/** Every slot that holds a key: each AI provider that takes one, and the food-database key. */
export const PLANTED_SLOTS = [
  ...PROVIDER_IDS.filter((id) => PROVIDERS[id].key !== 'none'),
  'fdc',
] as const;

/** A planted key per slot: `pw-planted-<slot>-<digits>-KEY`, unique and not part of another. */
export const PLANTED_KEYS: Readonly<Record<string, string>> = Object.fromEntries(
  PLANTED_SLOTS.map((slot, index) => [
    slot,
    `pw-planted-${slot}-${String(7_340_000 + index * 1_013).padStart(9, '0')}-KEY`,
  ]),
);

/** The planted AI provider keys, as the client takes them (the `fdc` slot is not an AI key). */
export function plantedProviderKeys(): ProviderKeys {
  const keys: Record<string, string> = {};
  for (const [slot, key] of Object.entries(PLANTED_KEYS)) if (slot !== 'fdc') keys[slot] = key;
  return keys as ProviderKeys;
}

function base64Of(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The parts of base64 text that only the key's own bytes decide, for the key starting at each of
 * the three byte offsets in a group: a key encoded anywhere in a longer run contains one of them.
 */
function base64Forms(key: string): string[] {
  const bytes = new TextEncoder().encode(key);
  return [0, 1, 2].map((offset) => {
    const padded = new Uint8Array(offset + bytes.length);
    padded.set(bytes, offset);
    const encoded = base64Of(padded);
    const head = offset === 0 ? 0 : 4;
    const tail = (offset + bytes.length) % 3 === 0 ? encoded.length : encoded.length - 4;
    return encoded.slice(head, tail).replace(/=+$/, '');
  });
}

/** Forms a key could take in an output, all plain ASCII (UTF-16 as its bytes, NULs included). */
function forms(key: string): string[] {
  const utf16 = Array.from(key, (char) => `${char}\u0000`).join('');
  return [key, encodeURIComponent(key), utf16, ...base64Forms(key)];
}

/** Bytes read one character per byte, so byte runs can be searched as text. */
function latin1(bytes: Uint8Array): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return text;
}

/** The slots whose planted key appears in `output` (text, or raw bytes) in any of its forms. */
export function plantedIn(output: string | Uint8Array): string[] {
  const haystack = typeof output === 'string' ? output : latin1(output);
  return Object.entries(PLANTED_KEYS)
    .filter(([, key]) => forms(key).some((form) => haystack.includes(form)))
    .map(([slot]) => slot);
}

/** The bytes of a Blob or File. */
export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** A value as text for searching: errors with their message, stack and cause, objects as JSON. */
export function describeValue(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return String(value);
  if (seen.has(value)) return '[seen]';
  seen.add(value);
  if (value instanceof Error) {
    const cause = 'cause' in value ? describeValue(value.cause, seen) : '';
    const own = Object.entries(value).map(
      ([name, field]) => `${name}=${describeValue(field, seen)}`,
    );
    return [value.name, value.message, value.stack ?? '', cause, ...own].join('\n');
  }
  if (Array.isArray(value)) return value.map((item) => describeValue(item, seen)).join('\n');
  return Object.entries(value)
    .map(([name, field]) => `${name}=${describeValue(field, seen)}`)
    .join('\n');
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

export interface ConsoleRecord {
  /** Every call so far, its arguments described as text. */
  calls(): string[];
}

/** Records (and silences) every console call until the test's mocks are restored. */
export function recordConsole(): ConsoleRecord {
  const calls: string[] = [];
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      calls.push(args.map((arg) => describeValue(arg)).join(' '));
    });
  }
  return { calls: () => [...calls] };
}

/** Stores every planted key in its slot, sealed as the app seals keys. */
export async function plantKeys(db: PlatewiseDb, clock?: Clock): Promise<void> {
  const secrets = createSecretsRepo(db, clock === undefined ? {} : { clock });
  for (const [slot, key] of Object.entries(PLANTED_KEYS)) await secrets.set(slot, key);
}

/** The sealed bytes of every stored key: an output must not carry these either. */
export async function sealedKeys(db: PlatewiseDb): Promise<Uint8Array[]> {
  const rows = (await db.secrets.toArray()) as unknown as { data: ArrayBufferView }[];
  return rows.map(
    (row) => new Uint8Array(row.data.buffer, row.data.byteOffset, row.data.byteLength),
  );
}

/** True when `needle` occurs in `haystack`, byte for byte. */
export function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  return latin1(haystack).includes(latin1(needle));
}
