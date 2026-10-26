import { describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../lib/clock';
import { withIdSequence } from '../lib/ids';
import { openTestDb } from '../test/db';
import { FACTORY_NOW } from '../test/factories';
import {
  CryptoUnavailableError,
  IV_BYTES,
  WRAP_KEY,
  createWrapKey,
  decryptText,
  encryptText,
  isUsableWrapKey,
  readWrapKey,
  storeWrapKey,
  webCrypto,
  type CryptoLike,
} from './crypto';
import { settleQuarantine } from './guard';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

function realCrypto(): CryptoLike {
  const crypto = webCrypto();
  if (!crypto) throw new Error('These tests need WebCrypto');
  return crypto;
}

describe('device key', () => {
  it('is an AES-GCM 256 key that cannot be exported', async () => {
    const crypto = realCrypto();
    const wrap = await createWrapKey(crypto, withIdSequence('wrap'));

    expect(wrap.id).toBe('wrap-1');
    expect(wrap.key.extractable).toBe(false);
    expect(wrap.key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect(isUsableWrapKey(wrap.key)).toBe(true);
    await expect(crypto.subtle.exportKey('raw', wrap.key)).rejects.toThrow();
  });

  it('survives a trip through IndexedDB as the key object and still opens what it sealed (D-16.51)', async () => {
    const { db, factory, name } = await openTestDb();
    const crypto = realCrypto();
    const wrap = await createWrapKey(crypto, withIdSequence('wrap'));
    const sealed = await encryptText(wrap.key, 'sk-test-0123456789', crypto);
    await db.transaction('rw', ['meta', 'quarantine'], () => storeWrapKey(db, wrap, clock));
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    const back = await readWrapKey(reopened.db, clock);
    expect(back?.id).toBe('wrap-1');
    expect(back?.key).not.toBe(wrap.key);
    expect(back && isUsableWrapKey(back.key)).toBe(true);
    expect(await decryptText(back!.key, sealed, crypto)).toBe('sk-test-0123456789');
    reopened.db.close();
  });

  it('reads as null when there is none', async () => {
    const { db } = await openTestDb();
    expect(await readWrapKey(db, clock)).toBeNull();
    db.close();
  });

  it('reads an unusable stored key as null and keeps the row aside', async () => {
    const { db } = await openTestDb();
    const crypto = realCrypto();
    const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    await db.meta.put({ key: WRAP_KEY, value: { id: 'old', key: extractable } });
    expect(await readWrapKey(db, clock)).toBeNull();

    await db.meta.put({ key: WRAP_KEY, value: { id: 'old', key: 'not a key' } });
    expect(await readWrapKey(db, clock)).toBeNull();
    await settleQuarantine(db);
    expect(await db.quarantine.where('table').equals('meta').count()).toBe(2);
    db.close();
  });
});

describe('encryptText and decryptText', () => {
  it('round-trips a text', async () => {
    const crypto = realCrypto();
    const { key } = await createWrapKey(crypto);
    const sealed = await encryptText(key, 'gsk_ünïcödé-key ✓', crypto);
    expect(await decryptText(key, sealed, crypto)).toBe('gsk_ünïcödé-key ✓');
  });

  it('draws a fresh 12-byte nonce for every encryption', async () => {
    const crypto = realCrypto();
    const draws = vi.spyOn(crypto, 'getRandomValues');
    const { key } = await createWrapKey(crypto);
    const first = await encryptText(key, 'same text', crypto);
    const second = await encryptText(key, 'same text', crypto);

    expect(draws).toHaveBeenCalledTimes(2);
    expect(first.iv).toHaveLength(IV_BYTES);
    expect(second.iv).toHaveLength(IV_BYTES);
    expect([...first.iv]).not.toEqual([...second.iv]);
    expect([...first.data]).not.toEqual([...second.data]);
  });

  it('refuses to open a value under another key', async () => {
    const crypto = realCrypto();
    const mine = await createWrapKey(crypto);
    const other = await createWrapKey(crypto);
    const sealed = await encryptText(mine.key, 'sk-abc', crypto);
    await expect(decryptText(other.key, sealed, crypto)).rejects.toThrow();
  });

  it('refuses to open a value with one byte changed', async () => {
    const crypto = realCrypto();
    const { key } = await createWrapKey(crypto);
    const sealed = await encryptText(key, 'sk-abc', crypto);
    sealed.data[0] = sealed.data[0]! ^ 1;
    await expect(decryptText(key, sealed, crypto)).rejects.toThrow();
  });

  it('refuses to work without WebCrypto', async () => {
    const { key } = await createWrapKey(realCrypto());
    await expect(encryptText(key, 'sk-abc', null)).rejects.toBeInstanceOf(CryptoUnavailableError);
  });
});
