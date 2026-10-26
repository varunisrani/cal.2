import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import { CryptoUnavailableError, WRAP_KEY, createWrapKey, webCrypto } from '../crypto';
import { settleQuarantine } from '../guard';
import type { PlatewiseDb } from '../schema';
import {
  FDC_SLOT,
  WrapKeyChangedError,
  createSecretsRepo,
  mask,
  type SecretsRepoOptions,
} from './secretsRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

const OPENAI_KEY = 'sk-proj-4fA9xQ2mZ7bW1cR8tY5uI3oP6aS0dF4gH7jK2lL';

async function setUp(options: SecretsRepoOptions = {}) {
  const opened = await openTestDb();
  const secrets = createSecretsRepo(opened.db, { clock, ids: withIdSequence('wrap'), ...options });
  return { ...opened, secrets };
}

/** True when `needle` appears as a run of bytes inside `haystack`. */
function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((byte, index) => haystack[start + index] === byte)) return true;
  }
  return false;
}

/** Every string and every run of bytes inside a stored value, however deep. */
function storedParts(value: unknown, out: Array<string | Uint8Array> = []) {
  if (typeof value === 'string') out.push(value);
  else if (ArrayBuffer.isView(value)) {
    out.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) storedParts(item, out);
  }
  return out;
}

async function rawRows(db: PlatewiseDb): Promise<unknown[]> {
  return [...(await db.secrets.toArray()), ...(await db.meta.toArray())];
}

describe('set and get', () => {
  it('round-trips a key per slot', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    await secrets.set(FDC_SLOT, 'fdc-key-1234567890');

    expect(await secrets.get('openai')).toBe(OPENAI_KEY);
    expect(await secrets.get(FDC_SLOT)).toBe('fdc-key-1234567890');
    expect(await secrets.get('gemini')).toBeNull();
    db.close();
  });

  it('trims a key before storing it: " sk-abc " and a newline reads back as "sk-abc"', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('groq', ' sk-abc \n');
    expect(await secrets.get('groq')).toBe('sk-abc');
    db.close();
  });

  it('deletes the slot when the value is blank', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    await secrets.set('openai', '  \n\t');

    expect(await secrets.get('openai')).toBeNull();
    expect(await db.secrets.count()).toBe(0);
    // Removing an unset slot is fine too.
    await secrets.set('mistral', '');
    expect(await secrets.slots()).toEqual([]);
    db.close();
  });

  it('replaces the key of a slot', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', 'sk-old-0000000000');
    await secrets.set('openai', 'sk-new-1111111111');
    expect(await secrets.get('openai')).toBe('sk-new-1111111111');
    expect(await db.secrets.count()).toBe(1);
    db.close();
  });

  it('lists the slots that hold a key, without their values', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    await secrets.set(FDC_SLOT, 'fdc-key-1234567890');
    await secrets.set('anthropic', 'sk-ant-0123456789');
    await secrets.remove('anthropic');

    expect(await secrets.slots()).toEqual([FDC_SLOT, 'openai']);
    db.close();
  });

  it('never stores the plain key, in the table or beside the device key (D-16.51)', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', `  ${OPENAI_KEY}\n`);

    const plainBytes = new TextEncoder().encode(OPENAI_KEY);
    const parts = storedParts(await rawRows(db));
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      if (typeof part === 'string') expect(part).not.toContain(OPENAI_KEY);
      else expect(containsBytes(part, plainBytes)).toBe(false);
    }
    // The stored row is the slot, a 12-byte nonce and the ciphertext with its 16-byte tag.
    const [row] = await db.secrets.toArray();
    expect(Object.keys(row!).sort()).toEqual(['data', 'id', 'iv']);
    expect(storedParts(row!.iv)[0]).toHaveLength(12);
    expect(storedParts(row!.data)[0]).toHaveLength(plainBytes.length + 16);
    db.close();
  });

  it('keeps the keys across a reopen with one device key', async () => {
    const { db, factory, name, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    await secrets.set(FDC_SLOT, 'fdc-key-1234567890');
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    const again = createSecretsRepo(reopened.db, { clock });
    expect(await again.get('openai')).toBe(OPENAI_KEY);
    expect(await again.slots()).toEqual([FDC_SLOT, 'openai']);
    expect(await reopened.db.meta.get(WRAP_KEY)).toMatchObject({ value: { id: 'wrap-1' } });
    reopened.db.close();
  });

  it('makes one device key when two saves race on a fresh store', async () => {
    const { db, factory, name, secrets } = await setUp();
    const otherTab = await openTestDb({ indexedDB: factory, name });
    const otherSecrets = createSecretsRepo(otherTab.db, { clock, ids: withIdSequence('other') });

    await Promise.all([
      secrets.set('openai', OPENAI_KEY),
      otherSecrets.set('groq', 'gsk-0123456789'),
    ]);

    expect(await secrets.get('openai')).toBe(OPENAI_KEY);
    expect(await secrets.get('groq')).toBe('gsk-0123456789');
    expect(await otherSecrets.slots()).toEqual(['groq', 'openai']);
    otherTab.db.close();
    db.close();
  });

  it('refuses a save whose device key was replaced while it was encrypting', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    const crypto = webCrypto()!;
    const { subtle } = crypto;
    const swapping = createSecretsRepo(db, {
      clock,
      crypto: {
        getRandomValues: crypto.getRandomValues.bind(crypto),
        subtle: {
          generateKey: subtle.generateKey.bind(subtle),
          decrypt: subtle.decrypt.bind(subtle),
          // Another tab replaces the device key while this save is encrypting.
          encrypt: async (...args: Parameters<SubtleCrypto['encrypt']>) => {
            const sealed = await subtle.encrypt(...args);
            const other = await createWrapKey(crypto, () => 'swapped');
            await db.meta.put({ key: WRAP_KEY, value: other });
            return sealed;
          },
        } as unknown as SubtleCrypto,
      },
    });

    await expect(swapping.set('groq', 'gsk-0123456789')).rejects.toBeInstanceOf(
      WrapKeyChangedError,
    );
    expect(await db.secrets.get('groq')).toBeUndefined();
    db.close();
  });

  it('refuses invalid slot names', async () => {
    const { db, secrets } = await setUp();
    await expect(secrets.set('Open AI', OPENAI_KEY)).rejects.toBeInstanceOf(TypeError);
    await expect(secrets.set('', OPENAI_KEY)).rejects.toBeInstanceOf(TypeError);
    await expect(secrets.remove('../meta')).rejects.toBeInstanceOf(TypeError);
    expect(await db.secrets.count()).toBe(0);
    db.close();
  });
});

describe('recovery (R03.27)', () => {
  it('reads every slot as unset and empties the table when the device key is gone, without throwing', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    await secrets.set(FDC_SLOT, 'fdc-key-1234567890');
    await db.meta.delete(WRAP_KEY);

    expect(await secrets.get('openai')).toBeNull();
    expect(await secrets.get(FDC_SLOT)).toBeNull();
    expect(await secrets.slots()).toEqual([]);
    expect(await db.secrets.count()).toBe(0);

    // The person types the key again: a new device key is made and the key reads back.
    await secrets.set('openai', OPENAI_KEY);
    expect(await secrets.get('openai')).toBe(OPENAI_KEY);
    expect(await db.meta.get(WRAP_KEY)).toMatchObject({ value: { id: 'wrap-2' } });
    db.close();
  });

  it('starts a new device key without the rows of the lost one', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    await db.meta.delete(WRAP_KEY);

    // A save before any read: the stale row must not stay next to the new key.
    await secrets.set('groq', 'gsk-0123456789');
    expect(await secrets.slots()).toEqual(['groq']);
    expect(await secrets.get('groq')).toBe('gsk-0123456789');
    db.close();
  });

  it('reads every slot as unset when one value fails to decrypt, and empties the table', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    await secrets.set(FDC_SLOT, 'fdc-key-1234567890');
    const stored = await db.secrets.get('openai');
    const data = Uint8Array.from(stored!.data as Uint8Array);
    data[3] = data[3]! ^ 0xff;
    await db.secrets.put({ ...stored!, data });

    expect(await secrets.slots()).toEqual([]);
    expect(await secrets.get(FDC_SLOT)).toBeNull();
    expect(await db.secrets.count()).toBe(0);
    db.close();
  });

  it('reads every slot as unset when the device key is replaced by another', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    const crypto = webCrypto()!;
    await db.meta.put({ key: WRAP_KEY, value: await createWrapKey(crypto, () => 'other') });

    expect(await secrets.get('openai')).toBeNull();
    expect(await db.secrets.count()).toBe(0);
    db.close();
  });

  it('keeps an unreadable row aside before emptying the table', async () => {
    const { db, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);
    await db.secrets.put({ id: FDC_SLOT, iv: 'not bytes', data: 42 });

    expect(await secrets.get('openai')).toBeNull();
    await settleQuarantine(db);
    expect(await db.secrets.count()).toBe(0);
    const kept = await db.quarantine.where('table').equals('secrets').toArray();
    expect(kept.map((row) => row.key)).toEqual([FDC_SLOT]);
    db.close();
  });

  it('reads nothing and deletes nothing on a page without WebCrypto, and refuses to save', async () => {
    const { db, factory, name, secrets } = await setUp();
    await secrets.set('openai', OPENAI_KEY);

    const insecure = createSecretsRepo(db, { clock, crypto: null });
    expect(await insecure.get('openai')).toBeNull();
    expect(await insecure.slots()).toEqual([]);
    await expect(insecure.set('groq', 'gsk-0123456789')).rejects.toBeInstanceOf(
      CryptoUnavailableError,
    );
    expect(await db.secrets.count()).toBe(1);
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    expect(await createSecretsRepo(reopened.db, { clock }).get('openai')).toBe(OPENAI_KEY);
    reopened.db.close();
  });
});

describe('mask (ACC-E14-1)', () => {
  it('shows the first four and the last four characters of a 40-character key', () => {
    const key = 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ01wxyz';
    expect(key).toHaveLength(40);
    expect(mask(key)).toBe('sk-p…wxyz');
  });

  it('shows dots only for a key of eight characters or fewer', () => {
    expect(mask('12345678')).toBe('•'.repeat(8));
    expect(mask('abc')).toBe('•'.repeat(8));
    expect(mask('123456789')).toBe('1234…6789');
  });

  it('shows nothing for a blank key and ignores surrounding spaces', () => {
    expect(mask('')).toBe('');
    expect(mask('   ')).toBe('');
    expect(mask('  sk-0123456789  ')).toBe('sk-0…6789');
  });
});
