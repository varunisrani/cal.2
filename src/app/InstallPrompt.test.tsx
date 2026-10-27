import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { shell } from '../i18n/en/shell';
import { systemClock } from '../lib/clock';
import { advance, useFakeTime } from '../test/time';
import { PAGE_COLOURS } from '../ui/tokens';
import { createInstallOffer, type InstallOffer, type InstallPromptEvent } from './installOffer';
import {
  INSTALL_SHOWN_KEY,
  InstallPrompt,
  type DeviceInfo,
  type KeyValueStorage,
} from './InstallPrompt';

const words = shell.shell.install;
const DAY_MS = 24 * 60 * 60 * 1000;

const ANDROID_CHROME: DeviceInfo = {
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  maxTouchPoints: 5,
  standalone: false,
};
const IPHONE_SAFARI: DeviceInfo = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5,
  standalone: false,
};
const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
/** iPadOS Safari asks for desktop pages and reports a Mac; it has touch points. */
const IPAD_SAFARI: DeviceInfo = { userAgent: MAC_SAFARI_UA, maxTouchPoints: 5, standalone: false };
const MAC_SAFARI: DeviceInfo = { userAgent: MAC_SAFARI_UA, maxTouchPoints: 0, standalone: false };
const IPHONE_CHROME: DeviceInfo = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5,
  standalone: false,
};

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
  return { storage, items };
}

/** An offer listening on its own target, and a way to fire the browser's events at it. */
function browserOffer() {
  const offer = createInstallOffer();
  const target = new EventTarget();
  offer.listen(target);
  const offerInstall = () => {
    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    }) satisfies InstallPromptEvent;
    act(() => {
      target.dispatchEvent(event);
    });
    return { event, prompt };
  };
  const installed = () =>
    act(() => {
      target.dispatchEvent(new Event('appinstalled'));
    });
  return { offer, offerInstall, installed };
}

function renderPrompt(device: DeviceInfo, offer: InstallOffer, storage: KeyValueStorage | null) {
  return render(
    <InstallPrompt offer={offer} clock={systemClock} storage={storage} device={device} />,
  );
}

const card = () => screen.queryByRole('group', { name: words.title });

describe('InstallPrompt', () => {
  it('shows the kept install offer once, then not again within seven days (ACC-L1-1)', () => {
    const start = useFakeTime('2026-10-27T10:00:00-04:00');
    const { storage, items } = memoryStorage();
    const first = browserOffer();
    const { event } = first.offerInstall();
    expect(event.defaultPrevented).toBe(true);

    const view = renderPrompt(ANDROID_CHROME, first.offer, storage);
    expect(card()).toHaveTextContent(words.body);
    expect(items.get(INSTALL_SHOWN_KEY)).toBe(String(start));
    fireEvent.click(screen.getByRole('button', { name: words.later }));
    expect(card()).not.toBeInTheDocument();
    // The browser offers again during the same visit: the card stays away.
    first.offerInstall();
    expect(card()).not.toBeInTheDocument();
    view.unmount();

    advance(7 * DAY_MS - 60_000);
    const later = browserOffer();
    later.offerInstall();
    const second = renderPrompt(ANDROID_CHROME, later.offer, storage);
    expect(card()).not.toBeInTheDocument();
    second.unmount();

    advance(60_000);
    const weekOn = browserOffer();
    weekOn.offerInstall();
    renderPrompt(ANDROID_CHROME, weekOn.offer, storage);
    expect(card()).toBeInTheDocument();
  });

  it('opens the browser prompt once when Install is pressed, and the card goes', () => {
    useFakeTime('2026-10-27T10:00:00-04:00');
    const { offer, offerInstall } = browserOffer();
    const { prompt } = offerInstall();
    renderPrompt(ANDROID_CHROME, offer, memoryStorage().storage);

    fireEvent.click(screen.getByRole('button', { name: words.install }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(card()).not.toBeInTheDocument();
    expect(offer.getSnapshot().event).toBeNull();
  });

  it('waits for an offer that comes after the app is drawn', () => {
    const { offer, offerInstall } = browserOffer();
    renderPrompt(ANDROID_CHROME, offer, memoryStorage().storage);
    expect(card()).not.toBeInTheDocument();

    offerInstall();
    expect(card()).toBeInTheDocument();
  });

  it('goes away once the app is installed', () => {
    const { offer, offerInstall, installed } = browserOffer();
    offerInstall();
    renderPrompt(ANDROID_CHROME, offer, memoryStorage().storage);
    expect(card()).toBeInTheDocument();

    installed();
    expect(card()).not.toBeInTheDocument();
  });

  it.each([
    ['an iPhone', IPHONE_SAFARI],
    ['an iPad that reports a Mac', IPAD_SAFARI],
  ])('explains Add to Home Screen in Safari on %s (ACC-L1-2)', (_name, device) => {
    const { storage } = memoryStorage();
    renderPrompt(device, createInstallOffer(), storage);

    expect(card()).toHaveTextContent(words.iosBody);
    expect(screen.queryByRole('button', { name: words.install })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: words.gotIt }));
    expect(card()).not.toBeInTheDocument();
  });

  it('shows the iOS steps at most once in seven days', () => {
    const now = useFakeTime('2026-10-27T10:00:00-04:00');
    const { storage } = memoryStorage({ [INSTALL_SHOWN_KEY]: String(now - 3 * DAY_MS) });
    renderPrompt(IPHONE_SAFARI, createInstallOffer(), storage);

    expect(card()).not.toBeInTheDocument();
  });

  it.each([
    ['the installed app', { ...IPHONE_SAFARI, standalone: true }],
    ['Chrome on an iPhone', IPHONE_CHROME],
    ['Safari on a Mac', MAC_SAFARI],
    ['a browser that offers no install', ANDROID_CHROME],
  ])('shows nothing in %s', (_name, device) => {
    const { storage, items } = memoryStorage();
    const view = renderPrompt(device, createInstallOffer(), storage);

    expect(view.container).toBeEmptyDOMElement();
    expect(items.size).toBe(0);
  });

  it('shows nothing in the installed app even when an offer is kept', () => {
    const { offer, offerInstall } = browserOffer();
    offerInstall();
    renderPrompt({ ...ANDROID_CHROME, standalone: true }, offer, memoryStorage().storage);

    expect(card()).not.toBeInTheDocument();
  });

  it('still shows once in the visit when storage cannot be used', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const { offer, offerInstall } = browserOffer();
    offerInstall();
    renderPrompt(ANDROID_CHROME, offer, broken);
    expect(card()).toBeInTheDocument();

    // Install uses the kept offer up; the browser offering again later in the visit, after a
    // dismissed prompt, still brings no second card.
    fireEvent.click(screen.getByRole('button', { name: words.install }));
    expect(card()).not.toBeInTheDocument();
    offerInstall();
    expect(card()).not.toBeInTheDocument();
  });

  it('counts the week from now when the clock was moved back', () => {
    const now = useFakeTime('2026-10-27T10:00:00-04:00');
    const { storage, items } = memoryStorage({ [INSTALL_SHOWN_KEY]: String(now + 30 * DAY_MS) });
    renderPrompt(IPHONE_SAFARI, createInstallOffer(), storage);

    expect(card()).not.toBeInTheDocument();
    expect(items.get(INSTALL_SHOWN_KEY)).toBe(String(now));
  });
});

// Tests run in Node, but the app's tsconfig has no Node types: this is all we use of node:fs.
interface FileSystem {
  readFileSync(path: string): Uint8Array;
  readFileSync(path: string, encoding: 'utf8'): string;
  existsSync(path: string): boolean;
}
// A variable specifier keeps the compiler from looking for Node's type declarations.
const NODE_FS = 'node:fs';
let fs: FileSystem;
/** The worktree root: this file is src/app/InstallPrompt.test.tsx. */
const ROOT = decodeURIComponent(new URL(import.meta.url).pathname).replace(
  /\/src\/app\/[^/]+$/,
  '',
);

beforeAll(async () => {
  fs = (await import(/* @vite-ignore */ NODE_FS)) as FileSystem;
});

const readText = (path: string): string => fs.readFileSync(`${ROOT}/${path}`, 'utf8');

function indexDocument(): Document {
  return new DOMParser().parseFromString(readText('index.html'), 'text/html');
}

/** Directive name → its sources, in order. */
function parsePolicy(policy: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (!name) continue;
    expect(directives, `directive ${name} given twice`).not.toHaveProperty(name);
    directives[name.toLowerCase()] = sources;
  }
  return directives;
}

describe('index.html', () => {
  it('carries the CSP with exactly these directives, before anything loads (ACC-L6-1)', () => {
    const doc = indexDocument();
    const metas = doc.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
    expect(metas).toHaveLength(1);
    const meta = metas[0]!;

    expect(parsePolicy(meta.getAttribute('content') ?? '')).toEqual({
      'default-src': ["'self'"],
      'script-src': ["'self'", "'wasm-unsafe-eval'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'blob:', 'data:', 'https://images.openfoodfacts.org'],
      'connect-src': [
        "'self'",
        'https:',
        'http://localhost:*',
        'http://127.0.0.1:*',
        'http://[::1]:*',
      ],
      'worker-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'none'"],
    });
    // Only the charset comes before it, so the policy covers every link and script.
    expect(meta.previousElementSibling?.getAttribute('charset')).toBe('UTF-8');
  });

  it('loads no inline or third-party script, style or font (L6)', () => {
    const doc = indexDocument();
    const scripts = [...doc.querySelectorAll('script')];
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script.textContent?.trim()).toBe('');
      expect(script.getAttribute('src')).toMatch(/^\/(?!\/)/);
    }
    expect(doc.querySelectorAll('style, [style]')).toHaveLength(0);
    for (const link of doc.querySelectorAll('link[href]')) {
      expect(link.getAttribute('href')).toMatch(/^\/(?!\/)/);
    }
  });

  it('links the manifest and keeps the dark page colour as the theme colour', () => {
    const doc = indexDocument();
    const href = doc.querySelector('link[rel="manifest"]')?.getAttribute('href');

    expect(href).toBe('/manifest.webmanifest');
    expect(fs.existsSync(`${ROOT}/public${href}`)).toBe(true);
    expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      PAGE_COLOURS.dark,
    );
  });
});

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

/** Width and height from a PNG's IHDR chunk, after checking the signature. */
function pngSize(bytes: Uint8Array): string {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...bytes.subarray(0, 8)]).toEqual(signature);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return `${view.getUint32(16)}x${view.getUint32(20)}`;
}

describe('manifest.webmanifest', () => {
  const manifest = () =>
    JSON.parse(readText('public/manifest.webmanifest')) as Record<string, unknown>;

  it('describes the installed app: name, id, scope, window and dark colours', () => {
    expect(manifest()).toMatchObject({
      name: 'Platewise',
      short_name: 'Platewise',
      id: 'platewise',
      start_url: './',
      scope: './',
      display: 'standalone',
      theme_color: PAGE_COLOURS.dark,
      background_color: PAGE_COLOURS.dark,
    });
  });

  it('lists our icons, a maskable one included, each present with the size it claims (ACC-L1-1)', () => {
    const icons = manifest().icons as ManifestIcon[];
    const png = icons.filter((icon) => icon.type === 'image/png');
    expect(png.map((icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`).sort()).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
    for (const icon of icons) {
      expect(icon.src).toMatch(/^icons\/[\w.-]+$/);
      const path = `${ROOT}/public/${icon.src}`;
      expect(fs.existsSync(path), icon.src).toBe(true);
      if (icon.type === 'image/png') expect(pngSize(fs.readFileSync(path))).toBe(icon.sizes);
    }
  });

  it('offers launcher shortcuts for Camera, Describe and Scan', () => {
    const shortcuts = manifest().shortcuts as Array<{ name: string; url: string }>;
    expect(shortcuts.map(({ name, url }) => [name, url])).toEqual([
      ['Camera', './#/log/camera'],
      ['Describe', './#/log/describe'],
      ['Scan', './#/log/scan'],
    ]);
  });
});
