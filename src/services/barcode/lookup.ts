/**
 * Looking a barcode up (02 §3.12, R02.15) and the label scan that may follow a miss (R02.20).
 *
 * The order is the same wherever a code comes from (Home's scanner, typed digits, an ingredient
 * scan): Open Food Facts first, and a product it has nutrition for always wins. Only when it does
 * not know the code, or knows it without nutrition, are the person's saved label (the newest entry
 * made from a photo of this product's label, codes compared by `barcodeKey`) and then FoodData
 * Central (only with a stored key) asked. When none of them has it, Open Food Facts' failure is
 * shown, except a FoodData Central key that was refused, which has its own message. Every other
 * Open Food Facts failure ends the lookup there.
 *
 * The service runs Home's lookups. A product found is stored as the analysis draft, so a reload
 * reopens it (D-16.46), and its review opens. After a miss the person may photograph the product's
 * label instead: the code is held once for the next photo analysis, and every other way out drops
 * it, so a stale code never ties an unrelated meal to a product.
 */
import type { DiaryRepo } from '../../data/repos/diaryRepo';
import type { DraftsRepo } from '../../data/repos/draftsRepo';
import type { PhotoRepo } from '../../data/repos/photoRepo';
import type { SecretsRepo } from '../../data/repos/secretsRepo';
import type { AnalysisDraft, DiaryEntry, NutritionDraft } from '../../domain/model';
import { systemClock, type Clock } from '../../lib/clock';
import { err, ok, type Result } from '../../lib/result';
import type { PhotoService } from '../photos';
import { createScanner, type Scanner } from './decoder';
import { lookupFdc, type FdcDeps } from './fdc';
import { downloadProductPhoto, lookupOff, type OffDeps, type OffFailureKind } from './off';
import type { BarcodeProduct } from './product';

/** Why a lookup found nothing, as the person is told; `generic` when storing the result failed. */
export type LookupFailureKind = Exclude<OffFailureKind, 'cancelled'> | 'keyRefused' | 'generic';

/** A lookup that found nothing: a failure to show, or the person's own Cancel (never shown). */
export interface LookupMiss {
  readonly kind: LookupFailureKind | 'cancelled';
}

/** What a lookup found: a database's product, or the newest entry of a label saved for the code. */
export type Found =
  | { readonly source: 'openFoodFacts' | 'foodDataCentral'; readonly product: BarcodeProduct }
  | { readonly source: 'savedLabel'; readonly entry: DiaryEntry };

export interface BarcodeLookupDeps extends OffDeps, FdcDeps {
  /** Where saved labels are found: the diary's newest label entry for a code. */
  readonly labels: Pick<DiaryRepo, 'latestLabelFor'>;
}

/** The Open Food Facts misses after which the saved label and FoodData Central are asked. */
const LOOK_FURTHER: ReadonlySet<OffFailureKind> = new Set(['notFound', 'noNutrition']);

/** Failures whose dialog offers "Scan label": the product is unknown, or its key was refused. */
export function offersLabelScan(kind: LookupFailureKind): boolean {
  return kind === 'notFound' || kind === 'noNutrition' || kind === 'keyRefused';
}

/** Looks `code` up in the fixed order (R02.15). Never rejects. */
export async function lookupBarcode(
  code: string,
  deps: BarcodeLookupDeps,
): Promise<Result<Found, LookupMiss>> {
  const off = await lookupOff(code, deps);
  if (off.ok) return ok({ source: 'openFoodFacts', product: off.value });
  const offMiss = off.error.kind;
  if (!LOOK_FURTHER.has(offMiss)) return err({ kind: offMiss });

  const label = await savedLabel(code, deps.labels);
  if (label) return ok({ source: 'savedLabel', entry: label });
  if (deps.signal?.aborted) return err({ kind: 'cancelled' });

  const fdc = await lookupFdc(code, deps);
  if (fdc.ok) return ok({ source: 'foodDataCentral', product: fdc.value });
  if (fdc.error.kind === 'keyRefused' || fdc.error.kind === 'cancelled') {
    return err({ kind: fdc.error.kind });
  }
  // No key, no exact match, an outage: Open Food Facts' own answer stands.
  return err({ kind: offMiss });
}

/** The newest label entry for the code; a diary that cannot be read counts as having none. */
async function savedLabel(
  code: string,
  labels: Pick<DiaryRepo, 'latestLabelFor'>,
): Promise<DiaryEntry | null> {
  try {
    return await labels.latestLabelFor(code);
  } catch {
    return null;
  }
}

// ---- The label-scan hand-off ------------------------------------------------------------------

/** One code held between "Scan label" and the next photo analysis. */
export interface LabelScanHold {
  /** Holds the code, trimmed, in place of any other; a blank code holds nothing. */
  arm(code: string): void;
  /** The held code, given once: it is gone afterwards. */
  take(): string | null;
  /** Drops the held code: every way out other than the label photo's analysis. */
  clear(): void;
  /** The held code, left held. */
  armed(): string | null;
}

export function createLabelScanHold(): LabelScanHold {
  let held: string | null = null;
  return {
    arm(code) {
      const trimmed = code.trim();
      held = trimmed === '' ? null : trimmed;
    },
    take() {
      const code = held;
      held = null;
      return code;
    },
    clear() {
      held = null;
    },
    armed: () => held,
  };
}

// ---- The service ------------------------------------------------------------------------------

export type BarcodeState =
  | { readonly phase: 'idle' }
  /** The layer over the app: a spinner and Cancel. */
  | { readonly phase: 'looking'; readonly code: string }
  /** The failure's message, with Scan label, Retry or Close, and Cancel. */
  | { readonly phase: 'failed'; readonly code: string; readonly failure: LookupFailureKind };

export interface BarcodeService {
  getSnapshot(): BarcodeState;
  subscribe(onChange: () => void): () => void;
  /**
   * Looks a scanned or typed code up, taking over from a lookup still running. A product found is
   * stored as the analysis draft and its review opens. Resolves once this lookup is over; never
   * rejects.
   */
  lookup(code: string): Promise<void>;
  /** Cancel while looking or on the failure: nothing opens and nothing stays stored. */
  cancel(): void;
  /** Retry on the failure: the same code again. */
  retry(): Promise<void>;
  /**
   * "Scan label" on a failure that offers it: holds the code for the next photo analysis and
   * closes the failure. Returns the code held, or null when this failure offers no label scan.
   */
  armLabelScan(): string | null;
  /** The held code for the photo analysis about to start, given once. */
  takeArmedLabel(): string | null;
  /** Drops the held code: another method was chosen or the label photo's sheet closed. */
  clearArmedLabel(): void;
  /** The camera and the frame reader of the scanner (P06-14). */
  readonly scanner: Scanner;
}

export interface BarcodeServiceDeps {
  readonly fetch: typeof fetch;
  /** The FoodData Central key (`fdc` slot). */
  readonly secretsRepo: Pick<SecretsRepo, 'get'>;
  readonly diaryRepo: Pick<DiaryRepo, 'latestLabelFor'>;
  readonly draftsRepo: Pick<DraftsRepo, 'begin' | 'saveResult' | 'clear'>;
  readonly photoRepo: Pick<PhotoRepo, 'releaseIfUnused'>;
  /** Stores the product photo like any new photo. */
  readonly photos: Pick<PhotoService, 'store'>;
  /** Opens the review of the stored draft: the analysis service's `restore`. */
  readonly openReview: () => Promise<void>;
  /** The name of a product no database names, e.g. "Barcode 0123" (a catalogue word). */
  readonly unnamed: (code: string) => string;
  /** The language Open Food Facts answers in; the browser's by default. */
  readonly language?: string;
  /** The browser's camera and readers by default. */
  readonly scanner?: Scanner;
  /** When a draft was made; the device clock by default. */
  readonly clock?: Clock;
}

/** One lookup, from its start until its review opens, it fails, or it is cancelled or replaced. */
interface Attempt {
  readonly code: string;
  readonly controller: AbortController;
  /** Cancelled or replaced: it never opens anything and cleans up after itself. */
  ended: boolean;
  /** The product photo it stored, if any. */
  storedPhotoIds: string[];
  /** The generation `begin` gave it, once its draft is on the way to the database. */
  generation?: number;
  /** Its draft reached the database. */
  saved: boolean;
}

const IDLE: BarcodeState = { phase: 'idle' };

/** A logged label entry as a review draft: its values, amount, units, details and note. */
function entryDraft(entry: DiaryEntry): NutritionDraft {
  const {
    id: _id,
    loggedAt: _loggedAt,
    dayKey: _dayKey,
    meal: _meal,
    source: _source,
    photoIds: _photoIds,
    ...draft
  } = entry;
  return draft;
}

export function createBarcodeService(deps: BarcodeServiceDeps): BarcodeService {
  const clock = deps.clock ?? systemClock;
  const scanner = deps.scanner ?? createScanner();
  const hold = createLabelScanHold();
  const listeners = new Set<() => void>();
  let state: BarcodeState = IDLE;
  /** The lookup behind the layer, until it opens a review or fails. */
  let current: Attempt | null = null;

  function show(next: BarcodeState): void {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  /** Stops an attempt for good; its run cleans up what it stored. */
  function retire(attempt: Attempt): void {
    attempt.ended = true;
    attempt.controller.abort();
    if (current === attempt) current = null;
  }

  async function release(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await deps.photoRepo.releaseIfUnused(ids);
    } catch {
      // Photos nothing names are pruned later.
    }
  }

  /** What an attempt that never opened leaves behind: its draft and the photo it stored. */
  async function cleanUp(attempt: Attempt): Promise<void> {
    try {
      if (attempt.saved && attempt.generation !== undefined) {
        // A newer analysis that already began owns the record: then this changes nothing.
        await release((await deps.draftsRepo.clear(attempt.generation)).photoIds);
      }
    } catch {
      // The record stays until the next analysis or review moves the generation on.
    }
    await release(attempt.storedPhotoIds);
  }

  /** Open Food Facts' product photo, stored like a new photo; none when it cannot be had. */
  async function productPhoto(product: BarcodeProduct, attempt: Attempt): Promise<string[]> {
    const blob = await downloadProductPhoto(product.draft.product?.imageUrl, {
      fetch: deps.fetch,
      signal: attempt.controller.signal,
    });
    if (!blob || attempt.ended) return [];
    try {
      const stored = await deps.photos.store(blob);
      if (stored.kind !== 'stored') return [];
      attempt.storedPhotoIds.push(stored.id);
      return [stored.id];
    } catch {
      return [];
    }
  }

  async function draftOf(found: Found, attempt: Attempt): Promise<AnalysisDraft> {
    if (found.source === 'savedLabel') {
      // The label's own photos and values; the review says where they came from.
      return {
        draft: entryDraft(found.entry),
        photoIds: found.entry.photoIds,
        source: 'label',
        createdAt: clock.now(),
        fromSavedLabel: true,
      };
    }
    const photoIds =
      found.source === 'openFoodFacts' ? await productPhoto(found.product, attempt) : [];
    return {
      draft: found.product.draft,
      photoIds,
      source: found.product.source,
      createdAt: clock.now(),
      fromSavedLabel: false,
    };
  }

  async function run(attempt: Attempt): Promise<void> {
    try {
      const found = await lookupBarcode(attempt.code, {
        fetch: deps.fetch,
        signal: attempt.controller.signal,
        unnamed: deps.unnamed,
        secrets: deps.secretsRepo,
        labels: deps.diaryRepo,
        ...(deps.language === undefined ? {} : { language: deps.language }),
      });
      if (attempt.ended) return;
      if (!found.ok) {
        const { kind } = found.error;
        if (kind === 'cancelled') {
          // Only our own abort cancels; treat a stray one as the person's Cancel.
          retire(attempt);
          show(IDLE);
          return;
        }
        current = null;
        show({ phase: 'failed', code: attempt.code, failure: kind });
        return;
      }

      const draft = await draftOf(found.value, attempt);
      if (attempt.ended) return;
      const begun = await deps.draftsRepo.begin();
      attempt.generation = begun.generation;
      await release(begun.previousPhotoIds);
      if (attempt.ended) return;
      attempt.saved = (await deps.draftsRepo.saveResult(begun.generation, draft)) === 'saved';
      if (attempt.ended) return;
      if (!attempt.saved) {
        // An analysis began meanwhile (in another tab): it owns the record now.
        retire(attempt);
        show(IDLE);
        return;
      }
      current = null;
      show(IDLE);
      await deps.openReview();
    } catch {
      if (!attempt.ended) {
        current = null;
        show({ phase: 'failed', code: attempt.code, failure: 'generic' });
      }
    } finally {
      if (attempt.ended) await cleanUp(attempt);
    }
  }

  function lookup(code: string): Promise<void> {
    if (current) retire(current);
    // A new scan is a way out of a label scan that was offered before.
    hold.clear();
    const attempt: Attempt = {
      code: code.trim(),
      controller: new AbortController(),
      ended: false,
      storedPhotoIds: [],
      saved: false,
    };
    current = attempt;
    show({ phase: 'looking', code: attempt.code });
    return run(attempt);
  }

  return {
    getSnapshot: () => state,

    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    lookup,

    cancel() {
      if (current) retire(current);
      if (state.phase !== 'idle') show(IDLE);
    },

    retry() {
      return state.phase === 'failed' ? lookup(state.code) : Promise.resolve();
    },

    armLabelScan() {
      if (state.phase !== 'failed' || !offersLabelScan(state.failure)) return null;
      hold.arm(state.code);
      show(IDLE);
      return hold.armed();
    },

    takeArmedLabel: () => hold.take(),
    clearArmedLabel: () => hold.clear(),
    scanner,
  };
}
