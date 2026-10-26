/**
 * The food analysis entry points (03 §3.5–3.7): photos of one meal, a typed description and a
 * label scan, each sent through the client with a reader that turns the answer into a draft, so
 * an answer without a name, kcal or macros sends the standby in (D-16.22, D-16.58). A draft whose
 * unit list was missing or mangled may get one more short request for the units alone: only when
 * its weight is known and it has no energy or macros at all (water, black coffee), where a unit
 * such as "1 cup" is what makes the entry usable (R03.17). That request shares the analysis's
 * deadline (D-16.60), and its failures leave the first analysis as it was.
 */
import type { NutritionDraft, ServingBasis, UnitChoice } from '../../domain/model';
import { isWeightKnown } from '../../domain/servings/units';
import { err, ok, type Result } from '../../lib/result';
import { complete, withDeadline, type AiDeps, type AiPurpose } from '../client';
import type { AiFailure, SingleFailure } from '../errors';
import { readFoodReply, type FoodReplyContext } from '../parse/foodReply';
import { parseModelJson } from '../parse/json';
import { readParts, withParts } from '../parse/parts';
import { readUnits, withUnits } from '../parse/units';
import {
  labelScanPrompt,
  photoMealPrompt,
  textMealPrompt,
  unitRepairPrompt,
  usesProgressive,
} from '../prompts/food';
import type { PromptText } from '../prompts/shared';

/** The most photos one analysis sends (03 §3.5). */
export const MAX_MEAL_PHOTOS = 10;

export interface PhotoMealRequest {
  /** In the order they were taken or picked. */
  readonly images: readonly Blob[];
  readonly note?: string;
  /** The photos show one plate built up in steps; meaningful with two photos or more. */
  readonly progressive?: boolean;
}

export interface LabelScanRequest {
  readonly images: readonly Blob[];
  readonly note?: string;
}

/** A food answer read into a draft, and whether its unit list asked for the repair request. */
export interface FoodReading {
  readonly draft: NutritionDraft;
  readonly needsRepair: boolean;
}

/** What the repair request sends besides the draft's name and weight. */
export interface RepairContext {
  readonly note?: string;
  /** The first photo of the analysis; none for a typed description. */
  readonly photo?: Blob;
}

/**
 * The client's reader for a food answer: the object in the text, the draft (name, kcal and macros
 * required), the parts breakdown when it adds up (its sums then become the totals), then the unit
 * choices, keeping whether the list asked for a repair.
 */
export function readFoodAnswer(
  text: string,
  context: FoodReplyContext,
): Result<FoodReading, SingleFailure> {
  const reply = parseModelJson(text);
  if (!reply.ok) return reply;
  const read = readFoodReply(reply.value, context);
  if (!read.ok) return read;
  const draft = withParts(read.value, readParts(reply.value, read.value));
  const { units, needsRepair } = readUnits(reply.value, draft.basis);
  return ok({ draft: withUnits(draft, units), needsRepair });
}

/**
 * Whether a reading is worth the repair request (R03.17): its unit list was missing or mangled,
 * its weight is known (an unknown weight is never repaired, R03.15), and kcal, protein, carbs and
 * fat are all 0 or less. Any energy or macro means the person can log it by weight right away.
 */
export function needsUnitRepair({ draft, needsRepair }: FoodReading): boolean {
  return (
    needsRepair &&
    isWeightKnown(draft.basis) &&
    draft.kcal <= 0 &&
    draft.protein <= 0 &&
    draft.carbs <= 0 &&
    draft.fat <= 0
  );
}

/**
 * The draft, with the unit list from one repair request when `needsUnitRepair` says so. The
 * request names the food and its weight, carries the note and the first photo, and goes through
 * the whole pipeline (retries, standby) under `deps.deadline`. Its units replace the draft's only
 * when it gives some; any failure keeps the draft as it was, except Cancel, which stops the
 * action.
 */
export async function repairUnitsIfNeeded(
  reading: FoodReading,
  context: RepairContext,
  deps: AiDeps,
): Promise<Result<NutritionDraft, AiFailure>> {
  const { draft } = reading;
  const basis = draft.basis;
  if (!needsUnitRepair(reading) || !isWeightKnown(basis)) return ok(draft);

  const { photo, note } = context;
  const repaired = await complete(
    {
      purpose: 'unitRepair',
      images: photo === undefined ? [] : [photo],
      ...unitRepairPrompt({
        name: draft.name,
        grams: basis.grams,
        note,
        withPhoto: photo !== undefined,
      }),
      json: true,
      validate: (text) => readRepairedUnits(text, basis),
    },
    deps,
  );
  if (!repaired.ok) return repaired.error.kind === 'cancelled' ? repaired : ok(draft);
  return ok(repaired.value.length > 0 ? withUnits(draft, repaired.value) : draft);
}

/**
 * The first ten photos that hold any bytes, in order (03 §3.5). Empty ones (a failed capture) are
 * skipped before counting.
 */
export function mealPhotos(images: readonly Blob[]): Blob[] {
  return images.filter((image) => image.size > 0).slice(0, MAX_MEAL_PHOTOS);
}

/** Photos of one meal: several views, or a plate built up in steps (03 §3.5). */
export function analyzePhotos(
  request: PhotoMealRequest,
  deps: AiDeps,
): Promise<Result<NutritionDraft, AiFailure>> {
  const images = mealPhotos(request.images);
  if (images.length === 0) return noPhoto();
  const progressive = usesProgressive({
    photoCount: images.length,
    progressive: request.progressive,
  });
  return analyze(
    {
      purpose: 'mealPhotos',
      prompt: photoMealPrompt({ photoCount: images.length, note: request.note, progressive }),
      images,
      reply: { note: request.note, progressive },
      repairNote: request.note,
    },
    deps,
  );
}

/** A meal the person described in words; the description is also the repair's note. */
export function analyzeText(
  text: string,
  deps: AiDeps,
): Promise<Result<NutritionDraft, AiFailure>> {
  return analyze(
    {
      purpose: 'mealText',
      prompt: textMealPrompt({ description: text }),
      images: [],
      reply: { progressive: false },
      repairNote: text,
    },
    deps,
  );
}

/**
 * "Scan label" after a barcode miss: the photo request with the label hint (Proposed D-16.62).
 * The caller stores the result with source label.
 */
export function analyzeLabelScan(
  request: LabelScanRequest,
  deps: AiDeps,
): Promise<Result<NutritionDraft, AiFailure>> {
  const images = mealPhotos(request.images);
  if (images.length === 0) return noPhoto();
  return analyze(
    {
      purpose: 'labelScan',
      prompt: labelScanPrompt({ photoCount: images.length, note: request.note }),
      images,
      reply: { note: request.note, progressive: false },
      repairNote: request.note,
    },
    deps,
  );
}

/** One food request, ready for the client. */
interface FoodJob {
  readonly purpose: AiPurpose;
  readonly prompt: PromptText;
  readonly images: readonly Blob[];
  /** What the draft keeps from the request. */
  readonly reply: FoodReplyContext;
  /** The note the repair request carries. */
  readonly repairNote: string | undefined;
}

/** One analysis under one deadline (D-16.60): the request, then the repair when it is worth it. */
function analyze(job: FoodJob, deps: AiDeps): Promise<Result<NutritionDraft, AiFailure>> {
  return withDeadline(deps, async (deadline) => {
    const shared: AiDeps = { ...deps, deadline };
    const first = await complete(
      {
        purpose: job.purpose,
        images: job.images,
        ...job.prompt,
        json: true,
        validate: (text) => readFoodAnswer(text, job.reply),
      },
      shared,
    );
    if (!first.ok) return first;
    return repairUnitsIfNeeded(first.value, { note: job.repairNote, photo: job.images[0] }, shared);
  });
}

/** A photo entry point with no usable photo: nothing to send (03 §3.5). */
function noPhoto(): Promise<Result<never, AiFailure>> {
  return Promise.resolve(err({ kind: 'imageConversion' }));
}

/** The repair answer's unit list; a missing or mangled list is an unusable answer. */
function readRepairedUnits(
  text: string,
  basis: ServingBasis,
): Result<readonly UnitChoice[], SingleFailure> {
  const reply = parseModelJson(text);
  if (!reply.ok) return reply;
  const { units, needsRepair } = readUnits(reply.value, basis);
  return needsRepair ? err({ kind: 'invalidResponse' }) : ok(units);
}
