import { describe, expect, it } from 'vitest';
import { checkServerUrl, normaliseBaseUrl, sameServerUrl } from './endpoint';

describe('normaliseBaseUrl (R03.22)', () => {
  it.each([
    ['http://localhost:11434/v1/', 'http://localhost:11434/v1'],
    ['  https://models.example.net/v1  ', 'https://models.example.net/v1'],
    ['https://models.example.net/v1///\n', 'https://models.example.net/v1'],
    ['https://models.example.net', 'https://models.example.net'],
    ['   ', ''],
  ])('tidies %j to %j', (typed, stored) => {
    expect(normaliseBaseUrl(typed)).toBe(stored);
  });
});

describe('checkServerUrl: which addresses can be saved (D-16.26, R03.3)', () => {
  it('accepts https to any host, tidied', () => {
    expect(checkServerUrl('https://192.168.1.5:11434/v1/')).toEqual({
      ok: true,
      value: { url: 'https://192.168.1.5:11434/v1' },
    });
    expect(checkServerUrl(' https://gpu-box.example.org/openai/v1 ').ok).toBe(true);
  });

  it('accepts plain http to this device: localhost, 127.0.0.1 and [::1]', () => {
    expect(checkServerUrl('http://localhost:11434/v1/')).toEqual({
      ok: true,
      value: { url: 'http://localhost:11434/v1' },
    });
    for (const url of [
      'http://127.0.0.1:8080/v1',
      'http://[::1]:11434/v1',
      'HTTP://LOCALHOST:11434/v1',
      // The URL parser writes these as 127.0.0.1 and [::1].
      'http://127.1:11434/v1',
      'http://[0:0:0:0:0:0:0:1]/v1',
    ]) {
      expect(checkServerUrl(url).ok, url).toBe(true);
    }
  });

  it('refuses plain http to the local network or the internet, with the reason', () => {
    for (const url of [
      'http://192.168.1.5:11434/v1',
      'http://10.0.0.2:11434/v1',
      'http://gpu-box.local:11434/v1',
      'http://models.example.net/v1',
      'http://127.0.0.2:11434/v1',
      'http://localhost.example.net/v1',
    ]) {
      expect(checkServerUrl(url), url).toEqual({ ok: false, error: 'plainHttp' });
    }
  });

  it('refuses nothing typed, junk, other schemes, credentials and queries', () => {
    expect(checkServerUrl('  ')).toEqual({ ok: false, error: 'empty' });
    expect(checkServerUrl('not an address')).toEqual({ ok: false, error: 'malformed' });
    expect(checkServerUrl('https://')).toEqual({ ok: false, error: 'malformed' });
    expect(checkServerUrl('ftp://models.example.net/v1')).toEqual({ ok: false, error: 'scheme' });
    expect(checkServerUrl('localhost:11434/v1')).toEqual({ ok: false, error: 'scheme' });
    expect(checkServerUrl('https://me:secret@models.example.net/v1')).toEqual({
      ok: false,
      error: 'credentials',
    });
    expect(checkServerUrl('https://models.example.net/v1?mode=fast')).toEqual({
      ok: false,
      error: 'malformed',
    });
    expect(checkServerUrl('https://models.example.net/v1#top')).toEqual({
      ok: false,
      error: 'malformed',
    });
  });
});

describe('checkServerUrl: the Ollama /v1 hint (R03.22)', () => {
  it('accepts an Ollama address without /v1 but suggests adding it', () => {
    expect(checkServerUrl('http://localhost:11434', 'ollama')).toEqual({
      ok: true,
      value: { url: 'http://localhost:11434', hint: 'addV1' },
    });
    expect(checkServerUrl('https://ollama.example.org/api/', 'ollama')).toEqual({
      ok: true,
      value: { url: 'https://ollama.example.org/api', hint: 'addV1' },
    });
  });

  it('gives no hint when the address ends in /v1, or for other providers', () => {
    expect(checkServerUrl('http://localhost:11434/v1/', 'ollama')).toEqual({
      ok: true,
      value: { url: 'http://localhost:11434/v1' },
    });
    expect(checkServerUrl('https://relay.example.org', 'custom')).toEqual({
      ok: true,
      value: { url: 'https://relay.example.org' },
    });
  });
});

describe('sameServerUrl', () => {
  it('treats spelling differences the URL parser removes as the same server', () => {
    expect(sameServerUrl('http://localhost:11434/v1/', 'http://localhost:11434/v1')).toBe(true);
    expect(sameServerUrl('HTTP://LocalHost:11434/v1', 'http://localhost:11434/v1')).toBe(true);
    expect(sameServerUrl('https://relay.example.org:443/v1', 'https://relay.example.org/v1')).toBe(
      true,
    );
    expect(sameServerUrl('', '')).toBe(true);
  });

  it('tells two servers, ports or paths apart', () => {
    expect(sameServerUrl('http://localhost:11434/v1', 'http://localhost:11435/v1')).toBe(false);
    expect(sameServerUrl('https://a.example.org/v1', 'https://b.example.org/v1')).toBe(false);
    expect(sameServerUrl('https://a.example.org/v1', 'https://a.example.org/v2')).toBe(false);
  });
});
