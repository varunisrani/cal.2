// What the export and import sheets call (P09-10, P09-11). The work itself lives in
// exportDiary.ts, exportFormats.ts and importDiary.ts, fetched the first time a sheet uses them, so
// none of it is in the start-up download.

import type { DayKey } from '../../domain/dates/dayKey';
import type { WeekStart } from '../../domain/dates/week';
import type { Targets } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import type { PhotoRepo } from '../../data/repos/photoRepo';
import type { TransferRepo } from '../../data/repos/transferRepo';
import { newId as randomId, type IdSource } from '../../lib/ids';
import type {
  DiaryFile,
  ExportFormat,
  FileHandOver,
  HandOverResult,
  RangeChoice,
} from './exportDiary';
import type { DiaryImport, ImportCounts, ImportMode, PickedFile, ReadResult } from './importDiary';

export interface ExportRequest {
  readonly range: RangeChoice;
  readonly format: ExportFormat;
  /** Today, the end of every preset range. */
  readonly today: DayKey;
  /** The app's week start (R06.17). */
  readonly weekStart: WeekStart;
  /** The reader's unit: the file stays kcal, a kJ reader is told so (R06.14). */
  readonly energyUnit: EnergyDisplayUnit;
  /** The targets in effect; null without a profile. */
  readonly targets: Targets | null;
}

export type ExportResult =
  | { readonly kind: 'file'; readonly file: DiaryFile }
  /** No day of the range has food or water: no file. */
  | { readonly kind: 'empty' };

export interface TransferService {
  /** The diary file of a range, or `empty`. Rejects when the diary cannot be read. */
  exportDiary(request: ExportRequest): Promise<ExportResult>;
  /** Shares the file when the browser can, else downloads it. */
  deliver(file: DiaryFile): Promise<HandOverResult>;
  /** Checks a picked file (its size before reading it); nothing is stored. */
  readImport(picked: PickedFile): Promise<ReadResult>;
  /** Applies a checked file in one transaction. Rejects when the write fails (nothing changed). */
  importDiary(file: DiaryImport, mode: ImportMode): Promise<ImportCounts>;
}

export interface TransferDeps {
  readonly transferRepo: TransferRepo;
  readonly photoRepo: Pick<PhotoRepo, 'releaseIfUnused'>;
  /** Ids for imported records that need new ones; random UUIDs by default. */
  readonly newId?: IdSource;
  /** The browser's share sheet and download link by default. */
  readonly handOver?: FileHandOver;
}

export function createTransferService(deps: TransferDeps): TransferService {
  const { transferRepo, photoRepo } = deps;
  const newId = deps.newId ?? randomId;

  return {
    async exportDiary(request) {
      const [{ buildDocument, resolveRange }, { diaryFile }] = await Promise.all([
        import('./exportDiary'),
        import('./exportFormats'),
      ]);
      const firstDay = request.range.kind === 'all' ? await transferRepo.firstDay() : null;
      const range = resolveRange(request.range, request.today, request.weekStart, firstDay);
      const { entries, water } = await transferRepo.read(range.start, range.end);
      const document = buildDocument({ range, entries, water, targets: request.targets });
      if (document.days.length === 0) return { kind: 'empty' };
      return { kind: 'file', file: diaryFile(document, request.format, request.energyUnit) };
    },

    async deliver(file) {
      const { browserHandOver, handOver } = await import('./exportDiary');
      return handOver(file, deps.handOver ?? browserHandOver());
    },

    async readImport(picked) {
      const { readPickedFile } = await import('./importDiary');
      return readPickedFile(picked);
    },

    async importDiary(file, mode) {
      const { importDiary } = await import('./importDiary');
      return importDiary({ transferRepo, photoRepo, newId }, file, mode);
    },
  };
}
