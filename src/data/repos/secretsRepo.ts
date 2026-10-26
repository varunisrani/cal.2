// The person's API keys (D-16.7): one row of the `secrets` table per slot, where a slot is an AI
// provider id or `fdc` (the food-database key). Each value is trimmed, then encrypted under the
// device key (`crypto.ts`, Proposed D-16.51) with its own nonce, so the table never holds a plain
// key. If the device key is missing or unusable, or any stored value cannot be decrypted, nothing
// in the table can be trusted: every slot reads as unset and the rows are deleted, so the person
// types their keys again, and no read throws while the app starts (R03.27).
//
// Export and backup code never reads this table (a P09 test enforces it).

import { systemClock, type Clock } from '../../lib/clock';
import { newId, type IdSource } from '../../lib/ids';
import type { Codec } from '../codecs';
import {
  CryptoUnavailableError,
  IV_BYTES,
  createWrapKey,
  decryptText,
  encryptText,
  readWrapKey,
  storeWrapKey,
  webCrypto,
  type CryptoLike,
  type Sealed,
  type WrapKey,
} from '../crypto';
import { GUARD_TABLES, readAll, removeRows, writeOne } from '../guard';
import type { PlatewiseDb } from '../schema';

/** The slot of the food-database key; every other slot is an AI provider id. */
export const FDC_SLOT = 'fdc';

/** Lower-case letters and digits, then also `.`, `_` or `-`; at most 64 characters. */
const SLOT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isSecretSlot(value: unknown): value is string {
  return typeof value === 'string' && SLOT_PATTERN.test(value);
}

function assertSlot(slot: string): void {
  if (!isSecretSlot(slot)) throw new TypeError(`Not a key slot: "${slot}"`);
}

/** A stored slot: its value sealed under the device key. */
export type SecretRow = Sealed & { id: string };

// Typed arrays read back from IndexedDB may belong to another realm, so no `instanceof` here; the
// copy also gives the WebCrypto calls a plain ArrayBuffer-backed array.
function bytesOf(value: unknown): Uint8Array<ArrayBuffer> | null {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  }
  if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
    return new Uint8Array(value as ArrayBuffer).slice();
  }
  return null;
}

/** A row needs a slot name, a 12-byte nonce and some ciphertext. */
export const decodeSecretRow: Codec<SecretRow> = (raw) => {
  if (typeof raw !== 'object' || raw === null) return null;
  const fields = raw as Record<string, unknown>;
  const iv = bytesOf(fields.iv);
  const data = bytesOf(fields.data);
  if (!isSecretSlot(fields.id) || iv?.length !== IV_BYTES || !data?.length) return null;
  return { id: fields.id, iv, data };
};

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** Eight dots: a short key is hidden whole, and so is its length. */
const HIDDEN = '•'.repeat(8);
const SHOWN = 4;

/**
 * A key as Settings shows it: its first four characters, "…", its last four. A key of eight
 * characters or fewer shows as dots only; a blank one as nothing.
 */
export function mask(value: string): string {
  const chars = Array.from(value.trim());
  if (chars.length === 0) return '';
  if (chars.length <= SHOWN * 2) return HIDDEN;
  return `${chars.slice(0, SHOWN).join('')}…${chars.slice(-SHOWN).join('')}`;
}

/** The device key was replaced while a key was being saved; nothing was stored. */
export class WrapKeyChangedError extends Error {
  override readonly name = 'WrapKeyChangedError';
  readonly slot: string;

  constructor(slot: string) {
    super(`Refused: the device key changed while the key for "${slot}" was being saved`);
    this.slot = slot;
  }
}

export interface SecretsRepo {
  /**
   * Stores the key for a slot, trimmed; a value that trims to nothing removes the slot. Rejects
   * with `CryptoUnavailableError` on a page without WebCrypto.
   */
  set(slot: string, value: string): Promise<void>;
  /** The key of a slot, or null when it is unset or the stored keys cannot be read. */
  get(slot: string): Promise<string | null>;
  /** The slots that hold a key, sorted; never their values. */
  slots(): Promise<string[]>;
  remove(slot: string): Promise<void>;
}

export interface SecretsRepoOptions {
  /** Defaults to the browser's WebCrypto; `null` for a page without it. */
  crypto?: CryptoLike | null;
  /** Time for quarantine copies; defaults to the device clock. */
  clock?: Clock;
  /** Ids of new device keys. */
  ids?: IdSource;
}

export function createSecretsRepo(db: PlatewiseDb, options: SecretsRepoOptions = {}): SecretsRepo {
  const crypto = options.crypto === undefined ? webCrypto() : options.crypto;
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? newId;

  /** One read-write transaction over the secrets and the guard's tables (`meta` among them). */
  function change<T>(work: () => Promise<T>): Promise<T> {
    return db.transaction('rw', ['secrets', ...GUARD_TABLES], work);
  }

  function storedKeys(rows: readonly unknown[]): string[] {
    // `id` is the table's key path, so every stored row has one, readable or not.
    return rows.map((raw) => (raw as { id: string }).id);
  }

  /** The stored device key, or a new one stored now. */
  async function deviceKey(webCrypto: CryptoLike): Promise<WrapKey> {
    const stored = await readWrapKey(db, clock);
    if (stored) return stored;
    // Making a key is not an IndexedDB call, so it runs before the transaction that stores it.
    const fresh = await createWrapKey(webCrypto, ids);
    return change(async () => {
      const current = await readWrapKey(db, clock);
      if (current) return current; // another save or tab stored one first
      // Rows sealed under a lost key can never be read; a new key starts with none of them.
      const rows: unknown[] = await db.secrets.toArray();
      await removeRows(db, 'secrets', storedKeys(rows), decodeSecretRow, clock);
      await storeWrapKey(db, fresh, clock);
      return fresh;
    });
  }

  /**
   * Deletes what a failed read saw: every row that cannot be read and every row still holding a
   * nonce that read saw. A row saved since then is sealed under the current key and stays.
   */
  async function forget(seen: readonly SecretRow[]): Promise<void> {
    try {
      await change(async () => {
        const rows: unknown[] = await db.secrets.toArray();
        const doomed = rows.filter((raw) => {
          const row = decodeSecretRow(raw);
          return row === null || seen.some((old) => old.id === row.id && sameBytes(old.iv, row.iv));
        });
        await removeRows(db, 'secrets', storedKeys(doomed), decodeSecretRow, clock);
      });
    } catch {
      // The rows stay, still unreadable, and the next read tries again; a read never throws for
      // keys it cannot open (R03.27).
    }
  }

  /** Every stored key by slot; empty, and the table emptied, when any of them cannot be opened. */
  async function openAll(): Promise<Map<string, string>> {
    const values = new Map<string, string>();
    if (!crypto) return values;
    const { wrap, rows, dropped } = await db.transaction('r', ['secrets', 'meta'], async () => {
      const found = await readWrapKey(db, clock);
      const { items, dropped: unreadable } = await readAll(db, 'secrets', decodeSecretRow, clock);
      return { wrap: found, rows: items, dropped: unreadable };
    });
    if (rows.length === 0 && dropped === 0) return values;
    if (wrap && dropped === 0) {
      try {
        for (const row of rows) values.set(row.id, await decryptText(wrap.key, row, crypto));
        return values;
      } catch {
        // One value that cannot be opened makes the whole table untrustworthy.
      }
    }
    await forget(rows);
    return new Map();
  }

  async function remove(slot: string): Promise<void> {
    assertSlot(slot);
    await removeRows(db, 'secrets', [slot], decodeSecretRow, clock);
  }

  return {
    async set(slot, value) {
      assertSlot(slot);
      const trimmed = value.trim();
      if (trimmed === '') return remove(slot);
      if (!crypto) throw new CryptoUnavailableError();
      const wrap = await deviceKey(crypto);
      const sealed = await encryptText(wrap.key, trimmed, crypto);
      await change(async () => {
        // A value sealed under a key that has since been replaced could never be read back.
        if ((await readWrapKey(db, clock))?.id !== wrap.id) throw new WrapKeyChangedError(slot);
        await writeOne(db, 'secrets', { id: slot, ...sealed }, decodeSecretRow, clock);
      });
    },

    async get(slot) {
      return (await openAll()).get(slot) ?? null;
    },

    async slots() {
      return [...(await openAll()).keys()].sort();
    },

    remove,
  };
}
