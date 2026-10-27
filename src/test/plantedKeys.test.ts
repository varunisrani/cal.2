import { describe, expect, it } from 'vitest';
import {
  PLANTED_KEYS,
  PLANTED_SLOTS,
  describeValue,
  plantedIn,
  plantedProviderKeys,
  recordConsole,
} from './plantedKeys';

const KEY = PLANTED_KEYS.openai!;

function base64(text: string): string {
  return btoa(text);
}

describe('plantedIn: the search the security tests rely on (P10-09)', () => {
  it('gives every key slot its own key, none inside another', () => {
    const keys = Object.values(PLANTED_KEYS);
    expect(Object.keys(PLANTED_KEYS)).toEqual([...PLANTED_SLOTS]);
    expect(PLANTED_SLOTS).toContain('fdc');
    expect(PLANTED_SLOTS).not.toContain('ollama');
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(keys.filter((other) => other.includes(key))).toEqual([key]);
    }
    expect(Object.keys(plantedProviderKeys())).not.toContain('fdc');
  });

  it('finds nothing in clean text or bytes', () => {
    expect(plantedIn('Lunch, 410 kcal, logged by photo')).toEqual([]);
    expect(plantedIn(new TextEncoder().encode('{"kcal":410}'))).toEqual([]);
  });

  it('finds a key as typed, URL-encoded, in UTF-16 bytes and in raw bytes', () => {
    expect(plantedIn(`detail: ${KEY}.`)).toEqual(['openai']);
    expect(plantedIn(`?k=${encodeURIComponent(KEY)}`)).toEqual(['openai']);
    const utf16 = new Uint8Array(KEY.length * 2);
    Array.from(KEY).forEach((char, index) => (utf16[index * 2] = char.charCodeAt(0)));
    expect(plantedIn(utf16)).toEqual(['openai']);
    expect(plantedIn(new TextEncoder().encode(`xx${KEY}yy`))).toEqual(['openai']);
  });

  it.each([0, 1, 2, 3, 4])('finds a key inside base64 after %i other bytes', (before) => {
    const encoded = base64(`${'z'.repeat(before)}${KEY}${'q'.repeat(5)}`);
    expect(plantedIn(`{"@blob":"image/jpeg","data":"${encoded}"}`)).toEqual(['openai']);
  });

  it('reads errors through their message, stack, cause and own fields', () => {
    const inner = new Error(`refused ${PLANTED_KEYS.gemini}`);
    const outer = Object.assign(new Error('outer', { cause: inner }), {
      request: { headers: { 'x-api-key': PLANTED_KEYS.anthropic } },
    });
    expect(plantedIn(describeValue(outer)).sort()).toEqual(['anthropic', 'gemini']);
  });

  it('records console calls without printing them', () => {
    const record = recordConsole();
    console.error('Platewise: something failed', new Error(`with ${PLANTED_KEYS.fdc}`));
    console.warn('plain');
    expect(record.calls()).toHaveLength(2);
    expect(plantedIn(record.calls().join('\n'))).toEqual(['fdc']);
  });
});
