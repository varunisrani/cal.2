import { describe, expect, it } from 'vitest';
import { testBlob } from '../test/factories';
import { fingerprint, isBlobLike, sameData, stableText } from './values';

describe('isBlobLike', () => {
  it('recognises blobs from this realm and from the test runtime, and nothing else', () => {
    expect(isBlobLike(new Blob(['x']))).toBe(true);
    expect(isBlobLike(testBlob('x'))).toBe(true);
    expect(isBlobLike({ size: 1, type: 'image/jpeg' })).toBe(false);
    expect(isBlobLike(null)).toBe(false);
  });
});

describe('sameData', () => {
  it('compares plain objects and arrays by content, whatever the key order', () => {
    expect(sameData({ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1 })).toBe(true);
    expect(sameData([1, 2], [2, 1])).toBe(false);
    expect(sameData({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameData({ a: Number.NaN }, { a: Number.NaN })).toBe(true);
  });

  it('compares dates, bytes, maps and sets by content', () => {
    expect(sameData(new Date(5), new Date(5))).toBe(true);
    expect(sameData(new Date(5), 5)).toBe(false);
    expect(sameData(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(sameData(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(sameData(new Map([['a', { n: 1 }]]), new Map([['a', { n: 1 }]]))).toBe(true);
    expect(sameData(new Set(['a']), new Set(['b']))).toBe(false);
  });

  it('treats two blobs as the same only when they are one object', () => {
    const blob = testBlob('photo');
    expect(sameData({ blob }, { blob })).toBe(true);
    expect(sameData({ blob }, { blob: testBlob('photo') })).toBe(false);
  });
});

describe('stableText and fingerprint', () => {
  it('give the same result for the same content in any key order', () => {
    const a = { id: 'e-1', kcal: 'lots', nested: { y: 2, x: [1, null] } };
    const b = { nested: { x: [1, null], y: 2 }, kcal: 'lots', id: 'e-1' };
    expect(stableText(a)).toBe(stableText(b));
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(fingerprint(a)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('tell apart values that JSON would mix up', () => {
    const forms = [1, '1', null, undefined, -0, 0, Number.NaN, [undefined], [null], {}, []];
    expect(new Set(forms.map(stableText)).size).toBe(forms.length);
  });

  it('write blobs as size and type, and survive a value that contains itself', () => {
    expect(stableText({ thumb: testBlob('abc', 'image/png') })).toBe(
      '{"thumb":blob(3,"image/png")}',
    );
    const loop: Record<string, unknown> = { name: 'loop' };
    loop.self = loop;
    expect(stableText(loop)).toBe('{"name":"loop","self":@cycle}');
  });
});
