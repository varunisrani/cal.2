// Security review (P10-09): a diary export never carries an API key. Every key slot holds a
// planted key next to a diary with foods, parts, notes and water; every format of All time is
// made through the real transfer service and handed over, and the files, the handed-over File
// and the console are searched for every planted key in every form.
import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '../../ai/settings';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { createTransferRepo } from '../../data/repos/transferRepo';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry, makeLine, makeWater } from '../../test/factories';
import {
  blobBytes,
  containsBytes,
  plantKeys,
  plantedIn,
  recordConsole,
  sealedKeys,
} from '../../test/plantedKeys';
import { EXPORT_FORMATS, type FileHandOver } from './exportDiary';
import { createTransferService, type ExportRequest } from './transfer';

const DAY = 86_400_000;

async function seeded() {
  const { db } = await openTestDb();
  await plantKeys(db);
  const settings = createSettingsRepo(db, { locale: 'en-US' });
  await settings.set('ai.settings', {
    ...DEFAULT_AI_SETTINGS,
    instructions: 'Count olive oil as one tablespoon.',
  });
  const diary = createDiaryRepo(db);
  await diary.add(
    makeEntry({
      name: 'Lentil soup, two parts',
      note: 'from the canteen',
      lines: [makeLine({ name: 'Red lentils' }), makeLine({ name: 'Stock' })],
    }),
  );
  await diary.add(makeEntry({ name: 'Rye toast', loggedAt: FACTORY_NOW - 3 * DAY }));
  await db.water.bulkPut([makeWater(), makeWater({ at: FACTORY_NOW - DAY, ml: 500 })]);
  return db;
}

function request(format: ExportRequest['format']): ExportRequest {
  return {
    range: { kind: 'all' },
    format,
    today: '2026-10-26',
    weekStart: 'mon',
    energyUnit: 'kcal',
    targets: null,
  };
}

/** A hand-over that keeps the File it was given, through the share sheet or the download. */
function keptHandOver(way: 'share' | 'download') {
  const kept: File[] = [];
  const handOver: FileHandOver =
    way === 'share'
      ? {
          canShare: () => true,
          share: async (data) => void kept.push(...(data.files ?? [])),
          download: (file) => void kept.push(file),
        }
      : { download: (file) => void kept.push(file) };
  return { handOver, kept };
}

describe('diary export: no key in any output (P10-09, D-16.7)', () => {
  it.each(EXPORT_FORMATS)(
    'holds no stored key, in any form, in the %s file or the File handed over',
    async (format) => {
      const logged = recordConsole();
      const db = await seeded();
      const sealed = await sealedKeys(db);
      expect(sealed.length).toBeGreaterThan(10);
      for (const way of ['share', 'download'] as const) {
        const { handOver, kept } = keptHandOver(way);
        const service = createTransferService({
          transferRepo: createTransferRepo(db),
          photoRepo: { releaseIfUnused: async () => [] },
          handOver,
        });

        const result = await service.exportDiary(request(format));
        if (result.kind !== 'file') throw new Error('nothing exported');
        // The diary did reach the file: the search looks at a real export.
        expect(result.file.text).toContain('Red lentils');
        expect(plantedIn(result.file.text)).toEqual([]);

        expect(await service.deliver(result.file)).toBe(way === 'share' ? 'shared' : 'downloaded');
        expect(kept).toHaveLength(1);
        const bytes = await blobBytes(kept[0]!);
        expect(plantedIn(bytes)).toEqual([]);
        for (const seal of sealed) expect(containsBytes(bytes, seal)).toBe(false);
      }
      expect(plantedIn(logged.calls().join('\n'))).toEqual([]);
      db.close();
    },
  );

  it('logs no key when the hand-over fails', async () => {
    const logged = recordConsole();
    const db = await seeded();
    const service = createTransferService({
      transferRepo: createTransferRepo(db),
      photoRepo: { releaseIfUnused: async () => [] },
      handOver: {
        download: () => {
          throw new Error('the download was refused');
        },
      },
    });

    const result = await service.exportDiary(request('csv'));
    if (result.kind !== 'file') throw new Error('nothing exported');
    await expect(service.deliver(result.file)).rejects.toThrow('refused');
    expect(plantedIn(logged.calls().join('\n'))).toEqual([]);
    db.close();
  });
});
