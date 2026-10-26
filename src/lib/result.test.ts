import { describe, expect, it } from 'vitest';
import { err, isOk, ok, type Result } from './result';

function halve(n: number): Result<number, 'odd'> {
  return n % 2 === 0 ? ok(n / 2) : err('odd');
}

describe('Result', () => {
  it('builds a success and a failure', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err('nope')).toEqual({ ok: false, error: 'nope' });
  });

  it('isOk narrows to the value on success and to the error otherwise', () => {
    const good = halve(8);
    const bad = halve(7);
    expect(isOk(good)).toBe(true);
    expect(isOk(bad)).toBe(false);
    if (isOk(good)) expect(good.value).toBe(4);
    if (!isOk(bad)) expect(bad.error).toBe('odd');
  });
});
