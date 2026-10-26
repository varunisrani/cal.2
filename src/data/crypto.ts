// The device key that wraps the person's API keys at rest (Proposed D-16.51) and the AES-GCM
// helpers that use it. The key is made once, can never be exported, and is kept in `meta` as the
// key object itself: IndexedDB stores a CryptoKey by structured clone without exposing its bytes.
// This protects copies of the raw storage files only; code running on the site can still ask the
// browser to use the key, which is why Settings says so plainly (D-16.7).

import { systemClock, type Clock } from '../lib/clock';
import { newId, type IdSource } from '../lib/ids';
import type { Codec } from './codecs';
import { readOne, writeOne } from './guard';
import type { KeyValueRow, PlatewiseDb } from './schema';

/** The `meta` key of the device key row. */
export const WRAP_KEY = 'wrapKey';

/** Bytes of the AES-GCM nonce; every encryption draws a fresh one. */
export const IV_BYTES = 12;

const ALGORITHM = 'AES-GCM';
const KEY_BITS = 256;

/** The part of WebCrypto used here; tests may pass their own. */
export type CryptoLike = Pick<Crypto, 'subtle' | 'getRandomValues'>;

/** The page has no WebCrypto (it is not on a secure origin), so nothing can be sealed. */
export class CryptoUnavailableError extends Error {
  override readonly name = 'CryptoUnavailableError';

  constructor() {
    super('This page cannot encrypt: WebCrypto needs a secure origin');
  }
}

/** The browser's WebCrypto, or null where the page has none. */
export function webCrypto(): CryptoLike | null {
  const candidate = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  return candidate?.subtle && candidate.getRandomValues ? (candidate as CryptoLike) : null;
}

/** The device key, and an id that changes whenever the key is replaced. */
export interface WrapKey {
  readonly id: string;
  readonly key: CryptoKey;
}

/** A text encrypted under the device key: the nonce and the ciphertext with its tag. */
export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: Uint8Array<ArrayBuffer>;
}

/** True for a secret AES-GCM 256 key that can encrypt and decrypt and cannot be exported. */
export function isUsableWrapKey(value: unknown): value is CryptoKey {
  if (typeof CryptoKey === 'undefined' || !(value instanceof CryptoKey)) return false;
  const algorithm = value.algorithm as Partial<AesKeyAlgorithm>;
  return (
    value.type === 'secret' &&
    !value.extractable &&
    algorithm.name === ALGORITHM &&
    algorithm.length === KEY_BITS &&
    value.usages.includes('encrypt') &&
    value.usages.includes('decrypt')
  );
}

/** Makes a new device key. It is not stored: see `storeWrapKey`. */
export async function createWrapKey(crypto: CryptoLike, ids: IdSource = newId): Promise<WrapKey> {
  const key = await crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_BITS }, false, [
    'encrypt',
    'decrypt',
  ]);
  return { id: ids(), key };
}

type WrapKeyRow = KeyValueRow & { value: WrapKey };

/** The device key row; a value that is not a usable key is unreadable. */
export const decodeWrapKeyRow: Codec<WrapKeyRow> = (raw) => {
  if (typeof raw !== 'object' || raw === null) return null;
  const { key, value } = raw as { key?: unknown; value?: unknown };
  if (key !== WRAP_KEY || typeof value !== 'object' || value === null) return null;
  const { id, key: cryptoKey } = value as { id?: unknown; key?: unknown };
  if (typeof id !== 'string' || id === '' || !isUsableWrapKey(cryptoKey)) return null;
  return { key: WRAP_KEY, value: { id, key: cryptoKey } };
};

/**
 * The stored device key, or null when there is none or it cannot be used (an unusable row is
 * kept aside by the guard). Joins the caller's transaction when there is one.
 */
export async function readWrapKey(
  db: PlatewiseDb,
  clock: Clock = systemClock,
): Promise<WrapKey | null> {
  const stored = await readOne(db, 'meta', WRAP_KEY, decodeWrapKeyRow, clock);
  return stored.kind === 'ok' ? stored.value.value : null;
}

/**
 * Stores the device key, keeping an unreadable stored row aside first. Joins the caller's
 * read-write transaction, which must include `meta` and the guard's tables.
 */
export function storeWrapKey(
  db: PlatewiseDb,
  wrap: WrapKey,
  clock: Clock = systemClock,
): Promise<void> {
  return writeOne(db, 'meta', { key: WRAP_KEY, value: wrap }, decodeWrapKeyRow, clock);
}

/** Encrypts a text under `key` with a fresh 12-byte nonce. */
export async function encryptText(
  key: CryptoKey,
  text: string,
  crypto: CryptoLike | null = webCrypto(),
): Promise<Sealed> {
  if (!crypto) throw new CryptoUnavailableError();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plain = new TextEncoder().encode(text);
  const data = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plain);
  return { iv, data: new Uint8Array(data) };
}

/**
 * Decrypts a sealed text. Rejects when it cannot be opened: another key, a changed byte, or bytes
 * that are not text.
 */
export async function decryptText(
  key: CryptoKey,
  sealed: Sealed,
  crypto: CryptoLike | null = webCrypto(),
): Promise<string> {
  if (!crypto) throw new CryptoUnavailableError();
  const plain = await crypto.subtle.decrypt({ name: ALGORITHM, iv: sealed.iv }, key, sealed.data);
  return new TextDecoder('utf-8', { fatal: true }).decode(plain);
}
