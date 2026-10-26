import { describe, expect, it } from 'vitest';
import { checkServerUrl, normaliseBaseUrl, sameServer, type ServerUrlCheck } from './endpoint';

const refusal = (check: ServerUrlCheck) => (check.ok ? undefined : check.reason);

describe('normaliseBaseUrl', () => {
  it('trims the address and drops trailing slashes (R03.22)', () => {
    expect(normaliseBaseUrl('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1');
    expect(normaliseBaseUrl('  https://relay.example.org/v1///\n')).toBe(
      'https://relay.example.org/v1',
    );
    expect(normaliseBaseUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com');
    expect(normaliseBaseUrl('   ')).toBe('');
  });
});

describe('checkServerUrl', () => {
  it('accepts https to any host, cleaned', () => {
    expect(checkServerUrl(' https://ollama.home.example/v1/ ', 'ollama')).toEqual({
      ok: true,
      url: 'https://ollama.home.example/v1',
    });
    expect(checkServerUrl('https://192.168.1.5:8443/v1', 'custom')).toEqual({
      ok: true,
      url: 'https://192.168.1.5:8443/v1',
    });
  });

  it('accepts plain http only on this device: localhost, 127.0.0.1 and [::1] (D-16.26)', () => {
    expect(checkServerUrl('http://localhost:11434/v1/', 'ollama')).toEqual({
      ok: true,
      url: 'http://localhost:11434/v1',
    });
    expect(checkServerUrl('http://[::1]:11434/v1', 'ollama')).toEqual({
      ok: true,
      url: 'http://[::1]:11434/v1',
    });
    expect(checkServerUrl('HTTP://LocalHost:8080/v1', 'custom').ok).toBe(true);
    // Other spellings of the same loopback addresses, as the URL parser reads them.
    expect(checkServerUrl('http://[0:0:0:0:0:0:0:1]:11434/v1', 'ollama').ok).toBe(true);
    expect(checkServerUrl('http://127.1:11434/v1', 'ollama').ok).toBe(true);
  });

  it('accepts the e2e fake AI server as a Custom address', () => {
    expect(checkServerUrl('http://127.0.0.1:4320/v1', 'custom')).toEqual({
      ok: true,
      url: 'http://127.0.0.1:4320/v1',
    });
  });

  it('refuses plain http to any host but this device (D-16.26, R03.3)', () => {
    for (const address of [
      'http://192.168.1.5:11434/v1',
      'http://10.0.0.2:11434/v1',
      'http://my-desktop.local:11434/v1',
      'http://api.example.com/v1',
      'http://localhost.example.com/v1',
      'http://0.0.0.0:11434/v1',
      'http://127.0.0.2:11434/v1',
    ]) {
      expect(refusal(checkServerUrl(address, 'custom')), address).toBe('plainHttp');
    }
  });

  it('refuses schemes other than https and http, including a missing one', () => {
    expect(refusal(checkServerUrl('ftp://files.example.com/v1'))).toBe('scheme');
    expect(refusal(checkServerUrl('ws://localhost:11434/v1'))).toBe('scheme');
    expect(refusal(checkServerUrl('javascript:alert(1)'))).toBe('scheme');
    expect(refusal(checkServerUrl('localhost:11434/v1', 'ollama'))).toBe('scheme');
  });

  it('refuses text that is not an address with a host, or that carries a query or fragment', () => {
    for (const text of [
      'not an address',
      'example.com/v1',
      '192.168.1.5:11434',
      'https://relay.example.org/v1?key=1',
      'https://relay.example.org/v1?',
      'https://relay.example.org/v1#top',
      'https://exa mple.org/v1',
    ]) {
      expect(refusal(checkServerUrl(text, 'custom')), text).toBe('notUrl');
    }
  });

  it('refuses a user name or password inside the address', () => {
    expect(refusal(checkServerUrl('https://me:secret@relay.example.org/v1'))).toBe('credentials');
    expect(refusal(checkServerUrl('http://me@localhost:11434/v1'))).toBe('credentials');
  });

  it('refuses a blank address', () => {
    expect(refusal(checkServerUrl(''))).toBe('empty');
    expect(refusal(checkServerUrl(' / '))).toBe('empty');
  });

  it('hints, without refusing, that an Ollama address usually ends in /v1 (R03.22)', () => {
    expect(checkServerUrl('http://localhost:11434/', 'ollama')).toEqual({
      ok: true,
      url: 'http://localhost:11434',
      hint: 'missingV1',
    });
    expect(checkServerUrl('https://ollama.home.example/api/v1', 'ollama')).toEqual({
      ok: true,
      url: 'https://ollama.home.example/api/v1',
    });
    // Only Ollama gets the hint: a Custom server may live at any path.
    expect(checkServerUrl('http://localhost:8080', 'custom')).toEqual({
      ok: true,
      url: 'http://localhost:8080',
    });
    expect(checkServerUrl('http://localhost:8080')).toEqual({
      ok: true,
      url: 'http://localhost:8080',
    });
  });
});

describe('sameServer', () => {
  it('matches addresses that differ only in scheme or host case, a default port or a slash', () => {
    expect(sameServer('http://localhost:11434/v1', 'HTTP://LOCALHOST:11434/v1/')).toBe(true);
    expect(sameServer('https://relay.example.org:443/v1', ' https://relay.example.org/v1')).toBe(
      true,
    );
  });

  it('tells different hosts, ports and paths apart', () => {
    expect(sameServer('http://localhost:11434/v1', 'http://127.0.0.1:11434/v1')).toBe(false);
    expect(sameServer('http://localhost:11434/v1', 'http://localhost:11435/v1')).toBe(false);
    expect(sameServer('https://relay.example.org/v1', 'https://relay.example.org/V1')).toBe(false);
    expect(sameServer('', 'https://relay.example.org/v1')).toBe(false);
    expect(sameServer('', '')).toBe(true);
  });
});
