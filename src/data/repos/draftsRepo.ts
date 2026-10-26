// Drafts that must survive a reload (D-16.46): the analysis waiting for review and the photos and
// note gathered in the capture sheet before Analyze. Each is one record of the `drafts` table.
//
// Analysis results arrive late and race with Log, Cancel and a new analysis (R02.10), so the
// analysis record keeps a generation counter in the database: `begin` moves it on and drops the
// previous draft, a result is stored only under the generation it was started with, and `clear`
// moves it on too, so a save still running for a finished attempt turns stale. Photos are only
// named here; the caller hands the ids these calls give back to the photo repository, which
// deletes a photo only when nothing else uses it. Every call is one transaction on the `drafts`
// table, and IndexedDB runs transactions on the same table in the order they were opened, so calls
// take effect in call order, in this tab and across tabs.

import { systemClock, type Clock } from '../../lib/clock';
import { decodeAnalysisDraft, type Codec } from '../codecs';
import { GUARD_TABLES, readOne, removeRows, writeOne } from '../guard';
import type { AnalysisDraft } from '../../domain/model';
import type { PlatewiseDb } from '../schema';

/** Row keys of the `drafts` table. */
export const ANALYSIS_KEY = 'analysis';
export const CAPTURE_KEY = 'capture';

/** The analysis record: the counter, and the draft stored under it if any. */
export interface AnalysisRecord {
  id: typeof ANALYSIS_KEY;
  generation: number;
  draft?: AnalysisDraft;
}

/** What the capture sheet holds before Analyze. */
export interface CaptureDraft {
  photoIds: readonly string[];
  note: string;
  /** The photos show one plate built up in steps. */
  progressive: boolean;
}

export type CaptureRecord = CaptureDraft & { id: typeof CAPTURE_KEY };

export type DraftRow = AnalysisRecord | CaptureRecord;

// ---- Codecs ---------------------------------------------------------------------------------

type Fields = Record<string, unknown>;

function fieldsOf(raw: unknown): Fields | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Fields) : null;
}

/** A record whose counter is not a whole number ≥ 0 is unreadable, and so is a damaged draft. */
export const decodeAnalysisRecord: Codec<AnalysisRecord> = (raw) => {
  const fields = fieldsOf(raw);
  const generation = fields?.generation;
  if (
    fields?.id !== ANALYSIS_KEY ||
    typeof generation !== 'number' ||
    !Number.isInteger(generation) ||
    generation < 0
  ) {
    return null;
  }
  const record: AnalysisRecord = { id: ANALYSIS_KEY, generation };
  if (fields.draft !== undefined && fields.draft !== null) {
    const draft = decodeAnalysisDraft(fields.draft);
    if (!draft) return null;
    record.draft = draft;
  }
  return record;
};

/** A capture record needs its list of photo ids; the note and the switch have defaults. */
export const decodeCaptureRecord: Codec<CaptureRecord> = (raw) => {
  const fields = fieldsOf(raw);
  if (fields?.id !== CAPTURE_KEY || !Array.isArray(fields.photoIds)) return null;
  return {
    id: CAPTURE_KEY,
    photoIds: fields.photoIds.filter((id): id is string => typeof id === 'string' && id !== ''),
    note: typeof fields.note === 'string' ? fields.note : '',
    progressive: typeof fields.progressive === 'boolean' ? fields.progressive : false,
  };
};

/** Any row of the `drafts` table; a row under another key is unreadable. */
export const decodeDraftRow: Codec<DraftRow> = (raw) => {
  const key = fieldsOf(raw)?.id;
  if (key === ANALYSIS_KEY) return decodeAnalysisRecord(raw);
  if (key === CAPTURE_KEY) return decodeCaptureRecord(raw);
  return null;
};

function distinct(ids: Iterable<string>): string[] {
  return [...new Set(ids)];
}

/** An analysis draft's photos, then its parts' photos, without repeats. */
function analysisPhotoIds(draft: AnalysisDraft): string[] {
  return distinct([...draft.photoIds, ...draft.draft.lines.flatMap((line) => line.photoIds)]);
}

/** Every photo a drafts row names. */
export function draftRowPhotoIds(row: DraftRow): string[] {
  if (row.id === CAPTURE_KEY) return distinct(row.photoIds);
  return row.draft ? analysisPhotoIds(row.draft) : [];
}

// ---- Repository -------------------------------------------------------------------------------

export interface BeginResult {
  /** Pass it to `saveResult` and `clear` for this attempt. */
  generation: number;
  /** Photos of the draft this call dropped, for the caller to release. */
  previousPhotoIds: string[];
}

export interface LoadedDraft {
  generation: number;
  draft: AnalysisDraft;
}

export interface ClearResult {
  /** False when a newer attempt owns the record (or there was none). */
  cleared: boolean;
  /** Photos of the draft this call dropped, for the caller to release. */
  photoIds: string[];
}

export interface DraftsRepo {
  /** Starts an analysis attempt: moves the counter on and drops the previous draft. */
  begin(): Promise<BeginResult>;
  /** Stores a finished analysis when `generation` is still current; otherwise `stale`. */
  saveResult(generation: number, draft: AnalysisDraft): Promise<'saved' | 'stale'>;
  /** The stored analysis draft and its generation, or null. */
  load(): Promise<LoadedDraft | null>;
  /**
   * Ends an attempt: drops its draft and moves the counter on. With a generation, only when that
   * generation is still current, so a newer draft is never cleared by an older attempt.
   */
  clear(generation?: number): Promise<ClearResult>;
  /** Stores the capture sheet; returns the photos the previous capture held and this one does not. */
  saveCapture(capture: CaptureDraft): Promise<string[]>;
  loadCapture(): Promise<CaptureDraft | null>;
  /** Drops the capture draft; returns its photos for the caller to release. */
  clearCapture(): Promise<string[]>;
}

export interface DraftsRepoOptions {
  /** Time for quarantine copies; defaults to the device clock. */
  clock?: Clock;
}

export function createDraftsRepo(db: PlatewiseDb, options: DraftsRepoOptions = {}): DraftsRepo {
  const clock = options.clock ?? systemClock;

  /** One read-write transaction over the drafts and the guard's tables. */
  function change<T>(work: () => Promise<T>): Promise<T> {
    return db.transaction('rw', ['drafts', ...GUARD_TABLES], work);
  }

  async function storedAnalysis() {
    return readOne(db, 'drafts', ANALYSIS_KEY, decodeAnalysisRecord, clock);
  }

  async function storedCapture() {
    return readOne(db, 'drafts', CAPTURE_KEY, decodeCaptureRecord, clock);
  }

  function writeAnalysis(record: AnalysisRecord): Promise<void> {
    return writeOne(db, 'drafts', record, decodeAnalysisRecord, clock);
  }

  return {
    begin: () =>
      change(async () => {
        const stored = await storedAnalysis();
        const current = stored.kind === 'ok' ? stored.value : null;
        const generation = (current?.generation ?? 0) + 1;
        // An unreadable record is kept aside by the write; its photos stay referenced from there.
        await writeAnalysis({ id: ANALYSIS_KEY, generation });
        return {
          generation,
          previousPhotoIds: current?.draft ? analysisPhotoIds(current.draft) : [],
        };
      }),

    saveResult: (generation, draft) =>
      change(async () => {
        const stored = await storedAnalysis();
        if (stored.kind !== 'ok' || stored.value.generation !== generation) return 'stale';
        await writeAnalysis({ id: ANALYSIS_KEY, generation, draft });
        return 'saved';
      }),

    async load() {
      const stored = await storedAnalysis();
      if (stored.kind !== 'ok' || !stored.value.draft) return null;
      return { generation: stored.value.generation, draft: stored.value.draft };
    },

    clear: (generation) =>
      change(async () => {
        const stored = await storedAnalysis();
        if (stored.kind === 'missing') return { cleared: false, photoIds: [] };
        const current = stored.kind === 'ok' ? stored.value : null;
        // An unreadable record has no generation to compare with: only a plain clear replaces it.
        if (generation !== undefined && current?.generation !== generation) {
          return { cleared: false, photoIds: [] };
        }
        await writeAnalysis({ id: ANALYSIS_KEY, generation: (current?.generation ?? 0) + 1 });
        return { cleared: true, photoIds: current?.draft ? analysisPhotoIds(current.draft) : [] };
      }),

    saveCapture: (capture) =>
      change(async () => {
        const stored = await storedCapture();
        const photoIds = distinct(capture.photoIds);
        const record: CaptureRecord = {
          id: CAPTURE_KEY,
          photoIds,
          note: capture.note,
          progressive: capture.progressive,
        };
        await writeOne(db, 'drafts', record, decodeCaptureRecord, clock);
        const kept = new Set(photoIds);
        return stored.kind === 'ok' ? stored.value.photoIds.filter((id) => !kept.has(id)) : [];
      }),

    async loadCapture() {
      const stored = await storedCapture();
      if (stored.kind !== 'ok') return null;
      const { photoIds, note, progressive } = stored.value;
      return { photoIds, note, progressive };
    },

    clearCapture: () =>
      change(async () => {
        const stored = await storedCapture();
        if (stored.kind === 'missing') return [];
        await removeRows(db, 'drafts', [CAPTURE_KEY], decodeCaptureRecord, clock);
        return stored.kind === 'ok' ? distinct(stored.value.photoIds) : [];
      }),
  };
}
