import { describe, expect, it } from 'vitest';
import { CryptoUnavailableError } from '../../data/crypto';
import { storableBlob } from '../../test/blobs';
import {
  LOCAL_SETTINGS,
  LOCAL_TABLES,
  canonicalText,
  contentHash,
  type BackupContent,
} from './hash';

type Row = Record<string, unknown>;

const LENTILS: Row = {
  id: '7d1f0c2e-4b8a-4c51-9e3d-2a6b8f0e1c47',
  name: 'Lentil soup',
  kcal: 310,
  nutrients: { fibreG: 8.5, sodiumMg: 640 },
  photoIds: ['3f9a6c1e-8d2b-4f7a-a1c3-9e5b7d2f4a68'],
};
const PEAR: Row = { id: 'c0a8e3b4-1f2d-4e6a-8b9c-5d7e3f1a2b60', name: 'Pear', kcal: 95 };

interface Parts {
  settings?: Row[];
  entries?: Row[];
  coachMessages?: Row[];
  extra?: Record<string, Row[]>;
  photos?: { name: string; size: number }[];
}

function content(parts: Parts = {}): BackupContent {
  return {
    tables: {
      settings: parts.settings ?? [
        { key: 'display.accent', value: 'basil' },
        { key: 'backup.lastAt', value: Date.UTC(2026, 9, 20) },
        { key: 'storage.persistAsked', value: true },
      ],
      entries: parts.entries ?? [LENTILS, PEAR],
      coachMessages: parts.coachMessages ?? [],
      ...parts.extra,
    },
    photos: parts.photos ?? [
      { name: '3f9a6c1e-8d2b-4f7a-a1c3-9e5b7d2f4a68.jpg', size: 182_004 },
      { name: '0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9.png', size: 51_220 },
    ],
  };
}

describe('contentHash', () => {
  it('gives one 64-character hash for the same content, whatever the order', async () => {
    const first = await contentHash(content());
    expect(first).toMatch(/^[0-9a-f]{64}$/);

    const reordered: BackupContent = {
      tables: {
        coachMessages: [],
        entries: [{ kcal: 95, name: 'Pear', id: PEAR.id }, LENTILS],
        settings: [
          { value: true, key: 'storage.persistAsked' },
          { value: 'basil', key: 'display.accent' },
          { key: 'backup.lastAt', value: Date.UTC(2026, 9, 20) },
        ],
      },
      photos: [...content().photos].reverse(),
    };
    expect(await contentHash(reordered)).toBe(first);
  });

  it('does not change when backup.lastAt changes, appears or goes (R06.7)', async () => {
    const before = await contentHash(content());
    const later = content({
      settings: [
        { key: 'display.accent', value: 'basil' },
        { key: 'backup.lastAt', value: Date.UTC(2026, 9, 27, 9, 30) },
        { key: 'storage.persistAsked', value: true },
      ],
    });
    expect(await contentHash(later)).toBe(before);
    const never = content({
      settings: [
        { key: 'display.accent', value: 'basil' },
        { key: 'storage.persistAsked', value: true },
      ],
    });
    expect(await contentHash(never)).toBe(before);
  });

  it('leaves out every device-local setting and table (R06.7)', async () => {
    const before = await contentHash(content());
    const deviceState = content({
      settings: [
        { key: 'display.accent', value: 'basil' },
        ...LOCAL_SETTINGS.map((key) => ({ key, value: `changed on this device: ${key}` })),
      ],
      extra: {
        ...Object.fromEntries(
          LOCAL_TABLES.map((table) => [table, [{ key: 'restoring', value: true }]]),
        ),
        // Photos count through the photo list, never through their rows.
        photos: [{ id: '3f9a6c1e-8d2b-4f7a-a1c3-9e5b7d2f4a68', width: 640, thumb: null }],
      },
    });
    expect(await contentHash(deviceState)).toBe(before);
  });

  it('changes when an entry, a setting or a photo changes', async () => {
    const before = await contentHash(content());
    const changed = [
      content({ entries: [{ ...LENTILS, kcal: 311 }, PEAR] }),
      content({ entries: [{ ...LENTILS, nutrients: { fibreG: 8.5, sodiumMg: 641 } }, PEAR] }),
      content({ entries: [LENTILS] }),
      content({ settings: [{ key: 'display.accent', value: 'ember' }] }),
      content({
        photos: content().photos.map((photo, index) =>
          index === 0 ? { ...photo, size: photo.size + 1 } : photo,
        ),
      }),
      content({
        photos: [
          ...content().photos,
          { name: '9e8d7c6b-5a49-4382-b716-0f1e2d3c4b5a.webp', size: 9_000 },
        ],
      }),
    ];
    const hashes = await Promise.all(changed.map((item) => contentHash(item)));
    expect(hashes.filter((hash) => hash === before)).toEqual([]);
    expect(new Set(hashes).size).toBe(changed.length);
  });

  it('counts a Blob inside a row by its type and size, never its bytes', async () => {
    const message = async (blob: Blob): Promise<BackupContent> =>
      content({ coachMessages: [{ id: 'm1', role: 'user', text: 'Lunch?', at: 1, thumb: blob }] });
    const thumb = await contentHash(await message(await storableBlob(900, 1)));
    expect(await contentHash(await message(await storableBlob(900, 77)))).toBe(thumb);
    expect(await contentHash(await message(await storableBlob(901, 1)))).not.toBe(thumb);
    expect(await contentHash(await message(await storableBlob(900, 1, 'image/png')))).not.toBe(
      thumb,
    );
  });

  it('is the SHA-256 of the canonical text', async () => {
    expect(await contentHash({ tables: {}, photos: [] })).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    const small: BackupContent = {
      tables: { settings: [{ key: 'display.accent', value: 'basil' }] },
      photos: [{ name: 'a.jpg', size: 12 }],
    };
    expect(await contentHash(small)).toBe(
      '140065b1d405f714bb3f35ba8b2b1559951023cc874ba57dfd60ba0e17316420',
    );
  });

  it('needs WebCrypto', async () => {
    await expect(contentHash(content(), null)).rejects.toBeInstanceOf(CryptoUnavailableError);
  });
});

describe('canonicalText', () => {
  it('lists kept rows as sorted lines with sorted keys, then photo lines sorted by name', () => {
    const text = canonicalText(
      content({
        entries: [PEAR, { b: [2, { z: 1, y: 'two\nlines' }], a: null, id: 'x' }],
        photos: [
          { name: 'b.png', size: 2 },
          { name: 'a.jpg', size: 1 },
        ],
      }),
    );
    expect(text.split('\n')).toEqual([
      'entries={"a":null,"b":[2,{"y":"two\\nlines","z":1}],"id":"x"}',
      `entries={"id":"${PEAR.id}","kcal":95,"name":"Pear"}`,
      'settings={"key":"display.accent","value":"basil"}',
      'photo:a.jpg:1',
      'photo:b.png:2',
      '',
    ]);
  });

  it('treats fields JSON would leave out as absent', () => {
    const plain = canonicalText(content({ entries: [PEAR] }));
    const withGaps = canonicalText(
      content({ entries: [{ ...PEAR, note: undefined, compute: () => 1 }] }),
    );
    expect(withGaps).toBe(plain);
  });
});
