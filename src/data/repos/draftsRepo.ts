// Drafts that must outlive a reload (D-16.46): the finished analysis waiting for review, and the
// photos picked for the next analysis (the capture draft).
//
// Analysis results arrive late and out of order, so the analysis row carries a generation: a new
// analysis takes the next one, and a result is kept only while its generation is still current
// (R02.10). Clearing also moves the generation on, so a save still in flight for a cleared flow is
// refused. Nothing here deletes photos: every call that lets go of photos returns their ids, and
// the caller releases them through the photo store, which checks every owner first (P02-07).

import { decodeAnalysisDraft } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { guardKey, readOne, type Codec } from '../guard';
import type { AnalysisDraft } from '../../domain/model';

/** Key of the analysis draft row. */
export const ANALYSIS_DRAFT_ID = 'analysis';
/** Key of the capture draft row. */
export const CAPTURE_DRAFT_ID = 'capture';

/** Photos picked before Analyze, with the note and the "plate built in steps" switch. */
export interface CaptureDraft {
  photoIds: readonly string[];
  note: string;
  progressive: boolean;
}

// The rows are type literals rather than interfaces, so they fit the table's loose row type.

/** The stored analysis row: its generation and, once one was saved, the finished result. */
export type AnalysisDraftRow = {
  id: typeof ANALYSIS_DRAFT_ID;
  gen: number;
  result?: AnalysisDraft;
};

/** The stored capture row. */
export type CaptureDraftRow = {
  id: typeof CAPTURE_DRAFT_ID;
  photoIds: readonly string[];
  note: string;
  progressive: boolean;
};

/** Every row the `drafts` table holds. */
export type DraftRow = AnalysisDraftRow | CaptureDraftRow;

/** The start of an analysis: its generation, and the photos the replaced draft held. */
export interface AnalysisStart {
  gen: number;
  previousPhotoIds: string[];
}

/** A finished analysis waiting for review. */
export interface PendingAnalysis {
  gen: number;
  result: AnalysisDraft;
}

// ---- Rows -------------------------------------------------------------------------------------

type Fields = Record<string, unknown>;

function fieldsOf(raw: unknown): Fields | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Fields) : null;
}

function isGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function readAnalysisRow(fields: Fields): AnalysisDraftRow | null {
  if (!isGeneration(fields.gen)) return null;
  if (fields.result === undefined) return { id: ANALYSIS_DRAFT_ID, gen: fields.gen };
  const result = decodeAnalysisDraft(fields.result);
  return result ? { id: ANALYSIS_DRAFT_ID, gen: fields.gen, result } : null;
}

// Strict on purpose: a capture row whose photo list is damaged must stop photo cleanup (an
// unreadable owner) rather than read as "no photos" and let its photos be deleted.
function readCaptureRow(fields: Fields): CaptureDraftRow | null {
  const { photoIds, note, progressive } = fields;
  if (!Array.isArray(photoIds) || !photoIds.every((id) => typeof id === 'string')) return null;
  return {
    id: CAPTURE_DRAFT_ID,
    photoIds: photoIds as string[],
    note: typeof note === 'string' ? note : '',
    progressive: progressive === true,
  };
}

/** A row of the `drafts` table; a row this build does not know cannot be read. */
export const decodeDraftRow: Codec<DraftRow> = (raw) => {
  const fields = fieldsOf(raw);
  if (fields?.id === ANALYSIS_DRAFT_ID) return readAnalysisRow(fields);
  if (fields?.id === CAPTURE_DRAFT_ID) return readCaptureRow(fields);
  return null;
};

/** The photos a result uses: its own, then its lines', without repeats. */
function resultPhotoIds(result: AnalysisDraft | undefined): string[] {
  if (!result) return [];
  return [...new Set([...result.photoIds, ...result.draft.lines.flatMap((line) => line.photoIds)])];
}

/** Every photo id a draft row holds. */
export function draftPhotoIds(row: DraftRow): string[] {
  return row.id === ANALYSIS_DRAFT_ID ? resultPhotoIds(row.result) : [...new Set(row.photoIds)];
}

// ---- Call order -------------------------------------------------------------------------------

/** Per database: the last queued operation, so the next one starts after it settles. */
const queues = new WeakMap<PlatewiseDb, Promise<unknown>>();

/** Runs `op` after every draft operation this tab issued earlier on `db` has settled. */
function inTurn<T>(db: PlatewiseDb, op: () => Promise<T>): Promise<T> {
  const before = queues.get(db) ?? Promise.resolve();
  const run = before.then(op, op);
  const settled = run.catch(() => undefined);
  queues.set(db, settled);
  return run;
}

/** One draft operation: in call order, in one read-write transaction over `drafts`. */
function change<T>(db: PlatewiseDb, body: () => Promise<T>): Promise<T> {
  return inTurn(db, () => transact(db, 'rw', ['drafts'], body));
}

/** The analysis row only: the key decides the kind, so any other kind there cannot be read. */
const decodeAnalysisRow: Codec<AnalysisDraftRow> = (raw) => {
  const row = decodeDraftRow(raw);
  return row?.id === ANALYSIS_DRAFT_ID ? row : null;
};

const decodeCaptureRow: Codec<CaptureDraftRow> = (raw) => {
  const row = decodeDraftRow(raw);
  return row?.id === CAPTURE_DRAFT_ID ? row : null;
};

function storedAnalysis(db: PlatewiseDb) {
  return readOne(db, 'drafts', ANALYSIS_DRAFT_ID, decodeAnalysisRow);
}

async function storedCapture(db: PlatewiseDb): Promise<CaptureDraftRow | null> {
  const read = await readOne(db, 'drafts', CAPTURE_DRAFT_ID, decodeCaptureRow);
  return read.kind === 'ok' ? read.value : null;
}

/** Replaces the row at `key`, keeping an unreadable stored value aside first. */
async function replace(db: PlatewiseDb, row: DraftRow): Promise<void> {
  await guardKey(db, 'drafts', row.id, decodeDraftRow);
  await db.drafts.put(row);
}

// ---- Analysis draft ---------------------------------------------------------------------------

/**
 * Starts a new analysis: takes the next generation and drops the previous draft. Returns the
 * photos that draft held, for the caller to release.
 */
export function begin(db: PlatewiseDb): Promise<AnalysisStart> {
  return change(db, async () => {
    const stored = await storedAnalysis(db);
    const previous = stored.kind === 'ok' ? stored.value : undefined;
    const gen = (previous?.gen ?? 0) + 1;
    await replace(db, { id: ANALYSIS_DRAFT_ID, gen });
    return { gen, previousPhotoIds: resultPhotoIds(previous?.result) };
  });
}

/**
 * Keeps a finished result for review, only while `gen` is still the current generation. On
 * `stale` nothing is stored: the caller releases the photos it wrote for this result.
 */
export function saveResult(
  db: PlatewiseDb,
  gen: number,
  result: AnalysisDraft,
): Promise<'saved' | 'stale'> {
  if (decodeAnalysisDraft(result) === null) {
    return Promise.reject(
      new TypeError('Refusing to store an analysis draft that would not read back'),
    );
  }
  return change(db, async () => {
    const stored = await storedAnalysis(db);
    if (stored.kind !== 'ok' || stored.value.gen !== gen) return 'stale';
    await db.drafts.put({ id: ANALYSIS_DRAFT_ID, gen, result });
    return 'saved';
  });
}

/** The finished analysis waiting for review, with its generation, or null when there is none. */
export function load(db: PlatewiseDb): Promise<PendingAnalysis | null> {
  return inTurn(db, async () => {
    const stored = await storedAnalysis(db);
    if (stored.kind !== 'ok' || !stored.value.result) return null;
    return { gen: stored.value.gen, result: stored.value.result };
  });
}

/**
 * Drops the analysis draft and moves the generation on, so a save still in flight for it is
 * refused. With `gen`, only when that is still the current generation: an older flow never clears
 * a newer one. Returns the photos the cleared draft held ([] when nothing was cleared).
 */
export function clear(db: PlatewiseDb, gen?: number): Promise<string[]> {
  return change(db, async () => {
    const stored = await storedAnalysis(db);
    if (stored.kind === 'missing') return [];
    if (stored.kind === 'corrupt') {
      // Its generation cannot be read, so only an unconditional clear may reset it.
      if (gen !== undefined) return [];
      await replace(db, { id: ANALYSIS_DRAFT_ID, gen: 1 });
      return [];
    }
    if (gen !== undefined && stored.value.gen !== gen) return [];
    await replace(db, { id: ANALYSIS_DRAFT_ID, gen: stored.value.gen + 1 });
    return resultPhotoIds(stored.value.result);
  });
}

// ---- Capture draft ----------------------------------------------------------------------------

function isCaptureDraft(capture: CaptureDraft): boolean {
  return (
    Array.isArray(capture.photoIds) &&
    capture.photoIds.every((id) => typeof id === 'string') &&
    typeof capture.note === 'string' &&
    typeof capture.progressive === 'boolean'
  );
}

/** Stores the capture draft. Returns the photos the previous one held that this one does not. */
export function saveCapture(db: PlatewiseDb, capture: CaptureDraft): Promise<string[]> {
  if (!isCaptureDraft(capture)) {
    return Promise.reject(
      new TypeError('Refusing to store a capture draft that would not read back'),
    );
  }
  return change(db, async () => {
    const previous = await storedCapture(db);
    await replace(db, {
      id: CAPTURE_DRAFT_ID,
      photoIds: [...capture.photoIds],
      note: capture.note,
      progressive: capture.progressive,
    });
    const kept = new Set(capture.photoIds);
    return previous ? draftPhotoIds(previous).filter((id) => !kept.has(id)) : [];
  });
}

/** The capture draft, or null when there is none (or it cannot be read). */
export function loadCapture(db: PlatewiseDb): Promise<CaptureDraft | null> {
  return inTurn(db, async () => {
    const stored = await storedCapture(db);
    if (!stored) return null;
    return { photoIds: stored.photoIds, note: stored.note, progressive: stored.progressive };
  });
}

/** Drops the capture draft. Returns the photos it held. */
export function clearCapture(db: PlatewiseDb): Promise<string[]> {
  return change(db, async () => {
    const previous = await storedCapture(db);
    await guardKey(db, 'drafts', CAPTURE_DRAFT_ID, decodeDraftRow);
    await db.drafts.delete(CAPTURE_DRAFT_ID);
    return previous ? draftPhotoIds(previous) : [];
  });
}
