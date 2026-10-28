import { useRef, useState, type ReactNode } from 'react';
import { useAppState } from '../../../app/appState';
import { useToday } from '../../../app/TodayProvider';
import { useSheet } from '../../../app/useRoute';
import { useSettings } from '../../../data/hooks';
import { dayKeyOf, splitDayKey, startOfDay, type DayKey } from '../../../domain/dates/dayKey';
import { stampForDay } from '../../../domain/dates/ranges';
import { mealAtInstant } from '../../../domain/meals/times';
import {
  MEAL_KINDS,
  type AnalysisDraft,
  type EntrySource,
  type IngredientLine,
  type MealKind,
  type NutritionDraft,
  type ProductInfo,
  type ServingBasis,
} from '../../../domain/model';
import { DEFAULT_CURRENCY } from '../../../domain/money/price';
import { priceInputText } from '../../../domain/money/priceText';
import { applyLineChange, lineTotals, stretchFactor } from '../../../domain/servings/ingredients';
import { keepSplit, SPLIT_MIN } from '../../../domain/servings/recipe';
import {
  draftAtAmount,
  initialAmount,
  reviewBase,
  scaleFor,
  scaleLine,
  scaleValues,
} from '../../../domain/servings/scale';
import { GRAMS_UNIT, pickerUnits, type ShownAmount } from '../../../domain/servings/units';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import { Button } from '../../../ui/Button';
import { DateTimeField, type DateTimeValue } from '../../../ui/DateTimeField';
import { Field } from '../../../ui/Field';
import { Icon } from '../../../ui/icons';
import { ListPicker } from '../../../ui/ListPicker';
import { Sheet } from '../../../ui/Sheet';
import { useToast } from '../../../ui/Toast';
import { PausedDialog, useLogPause } from '../../fasting/PausedDialog';
import { useAnalysis } from '../AnalysisOverlay';
import { FitCheckSheet } from '../FitCheckSheet';
import logStyles from '../log.module.css';
import { MEAL_NAME_KEYS } from '../meals';
import { SavedLabelNotice } from '../scan/SavedLabelNotice';
import { AllergenLine } from './AllergenLine';
import { IngredientsCard } from './IngredientsCard';
import { MoreNutrition } from './MoreNutrition';
import { NutritionRows } from './NutritionRows';
import { PhotoStrip } from './PhotoStrip';
import { PriceField, priceTextInvalid, withTypedPrice } from './PriceField';
import { ProductBlock } from './ProductBlock';
import styles from './review.module.css';
import { ServingCard } from './ServingCard';

/** The meal picker's place on the sheet stack, above the review. */
export const REVIEW_MEAL_SHEET = 'review-meal';

/** How far back a meal may be dated. */
export const REVIEW_YEARS_BACK = 10;

const SETTINGS = ['log.gramsFirst', 'units.energy', 'meals.times', 'money.currency'] as const;

// ---- The sheet's copy of the draft ----------------------------------------------------------

/** What the sheet edits: its own copy of the draft and the amount on the serving card. */
export interface ReviewWorking {
  /** Values describe the draft's own basis; the shown amount scales them. */
  readonly draft: NutritionDraft;
  readonly shown: ShownAmount;
  /** The servings a recipe split divides the dish into (P06-09); absent while there is none. */
  readonly servings?: number;
}

/** The draft with energy and macros as its lines' sums when it has lines (R02.4). */
function withLineSums(draft: NutritionDraft): NutritionDraft {
  if (draft.lines.length === 0) return draft;
  const sums = lineTotals(draft.lines);
  return { ...draft, kcal: sums.kcal, protein: sums.protein, carbs: sums.carbs, fat: sums.fat };
}

/** The copy a review opens with: the lines' sums as header, the amount by the domain's rules. */
export function openingWorking(draft: NutritionDraft, gramsFirst: boolean): ReviewWorking {
  const opened = withLineSums(draft);
  return { draft: opened, shown: initialAmount(opened, gramsFirst) };
}

/** Shown amount ÷ the copy's own amount. */
export function workingScale(working: ReviewWorking): number {
  return scaleFor(working.shown.amount, reviewBase(working.draft));
}

/** The draft with its nutrients and extras multiplied by `factor`. */
function withNutrientsAt(draft: NutritionDraft, factor: number): NutritionDraft {
  return {
    ...draft,
    nutrients: scaleValues(draft.nutrients, factor),
    extras: scaleValues(draft.extras, factor),
  };
}

/**
 * The copy after its lines change to `lines`, the lines as the sheet shows them. The header
 * becomes their sums and replaces values edited through the unlock (R02.5); nutrients stretch by
 * the lines' weight (R02.4), or keep the values on screen when the old lines had no weight to
 * compare with. While a recipe split is active the change is to one portion: the dish is rebuilt
 * from it and divided into the same servings, the unit kept (`keepSplit`, R02.6). Otherwise, with
 * a weight, the copy becomes the new whole, shown in grams, and any split ends. Without one, the
 * sums describe the amount on screen, which becomes the copy's own amount; under a split they are
 * scaled back to the whole dish instead, so the split stays.
 */
export function withLines(working: ReviewWorking, lines: readonly IngredientLine[]): ReviewWorking {
  const scale = workingScale(working);
  const servings = working.servings ?? SPLIT_MIN;
  const split = servings > SPLIT_MIN;
  if (split) {
    const kept = keepSplit(working.draft, lines, scale, servings, working.shown.unit);
    if (kept) return { draft: kept.draft, shown: kept.shown, servings: kept.servings };
  }

  const before = lineTotals(working.draft.lines).grams;
  const after = lineTotals(lines).grams;
  if (Number.isFinite(after) && after > 0) {
    const next = applyLineChange(working.draft, lines);
    const draft = stretchFactor(before, after) === null ? withNutrientsAt(next, scale) : next;
    const grams = reviewBase(draft);
    return { draft, shown: { unit: GRAMS_UNIT, count: grams, amount: grams } };
  }

  const { amount } = working.shown;
  // Nothing on screen to describe: the sums are taken as they are.
  if (!(amount > 0)) return { ...working, draft: applyLineChange(working.draft, lines) };
  if (split) {
    const whole = lines.map((line) => scaleLine(line, 1 / scale));
    return { ...working, draft: applyLineChange(working.draft, whole) };
  }
  const basis: ServingBasis =
    working.draft.basis.kind === 'grams'
      ? { kind: 'grams', grams: amount }
      : { kind: 'servings', count: amount };
  return {
    draft: withNutrientsAt({ ...applyLineChange(working.draft, lines), basis }, scale),
    shown: working.shown,
  };
}

/** The value with `key` set to `base`, or without it when `base` is unknown. */
export function withValue<K extends string>(
  values: Partial<Record<K, number>>,
  key: K,
  base: number | undefined,
): Partial<Record<K, number>> {
  const next = { ...values };
  if (base === undefined) delete next[key];
  else next[key] = base;
  return next;
}

// ---- Date and time --------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0');

/** The local date and minute of an instant, as the date and time inputs write them. */
export function dateTimeOf(ms: number): DateTimeValue {
  const local = new Date(ms);
  return { date: dayKeyOf(ms), time: `${pad(local.getHours())}:${pad(local.getMinutes())}` };
}

/** The instant of a local date and minute (a time the day skips moves forward). */
export function instantOf(value: DateTimeValue): number {
  const [hours = 0, minutes = 0] = value.time.split(':').map(Number);
  const local = new Date(startOfDay(value.date));
  local.setHours(hours, minutes, 0, 0);
  return local.getTime();
}

/** The same calendar day `years` years earlier (29 February becomes 1 March). */
export function yearsBefore(day: DayKey, years: number): DayKey {
  const { year, month, day: date } = splitDayKey(day);
  return dayKeyOf(new Date(year - years, month - 1, date).getTime());
}

// ---- Slots for later slices -----------------------------------------------------------------

/** The food as Log would store it now. */
export interface ReviewFood {
  /** Every value at the shown amount, the name as typed (blank: the analysed name). */
  readonly draft: NutritionDraft;
  readonly loggedAt: number;
  readonly meal: MealKind;
  readonly source: EntrySource;
  readonly photoIds: readonly string[];
}

/** What the ingredients card (P06-09) gets. */
export interface IngredientsSlot {
  readonly working: ReviewWorking;
  /** The draft as it opened: whether a recipe split is allowed is read from it (R02.6). */
  readonly opened: NutritionDraft;
  readonly scale: number;
  /** The lines as the sheet shows them, at the shown amount. */
  readonly lines: readonly IngredientLine[];
  /** A change of the lines as shown (`withLines`). */
  readonly onLinesChange: (lines: readonly IngredientLine[]) => void;
  /** Replaces the copy (a recipe split). */
  readonly onWorkingChange: (next: ReviewWorking) => void;
}

/** What the fit check (P06-10) gets while it is open. */
export interface FitCheckSlot {
  readonly food: ReviewFood;
  readonly onClose: () => void;
}

/** The parts of the sheet later slices add; each one is left out until it is given. */
export interface ReviewSlots {
  /** P06-17: the notice over a review filled from a saved label (shown only then). */
  readonly savedLabelNotice?: ReactNode;
  /** P06-18: the allergen line under the name. */
  readonly allergenLine?: (food: ReviewFood) => ReactNode;
  /** P06-09: the ingredients card under the nutrition rows. */
  readonly ingredients?: (slot: IngredientsSlot) => ReactNode;
  /** P06-18: the product block at the end, for a draft with product details. */
  readonly productBlock?: (product: ProductInfo) => ReactNode;
  /** P06-10: the fit check; the toolbar offers Fit check only when it is given. */
  readonly fitCheck?: (slot: FitCheckSlot) => ReactNode;
}

const NO_SLOTS: ReviewSlots = {};

// ---- The sheet ------------------------------------------------------------------------------

export interface ReviewSheetProps {
  /** The finished analysis. */
  readonly review: AnalysisDraft;
  /** After Log wrote the entry, and on Cancel: the caller lets the draft go. */
  readonly onClose: () => void;
  readonly slots?: ReviewSlots;
}

/**
 * Review before logging (02 §3.5): photos, name, serving, nutrition with its unlock,
 * micronutrients, meal, price and time, and the places later slices fill. Only Cancel and Log
 * close it. The sheet edits its own copy of the draft; Log stores every value at the shown amount,
 * the weight when it is known, the draft's note, plate-in-steps flag and photos, once (R02.11).
 * The meal follows the picked date and time until the person picks one (D-16.16). The price opens
 * with the draft's (one the person's words stated, or a saved meal's) in its currency, else empty
 * in the person's currency (D-16.107); text that is not an amount holds Log back. A fast in
 * progress keeps the sheet open behind the paused dialog, whose "End fast and log" logs it
 * (D-16.35).
 */
export function ReviewSheet({ review, onClose, slots = NO_SLOTS }: ReviewSheetProps) {
  const { diary, clock } = useServices();
  const toast = useToast();
  const settings = useSettings(SETTINGS);
  const today = useToday();
  const { selectedDay } = useAppState();
  const mealPicker = useSheet(REVIEW_MEAL_SHEET);
  const inFlight = useRef(false);
  const [openedAt] = useState(() => stampForDay(selectedDay ?? today, clock.now()));
  const [edits, setEdits] = useState<ReviewWorking | null>(null);
  const [name, setName] = useState(review.draft.name);
  const [pickedMeal, setPickedMeal] = useState<MealKind | null>(null);
  const [when, setWhen] = useState<DateTimeValue | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [fitCheckOpen, setFitCheckOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [priceText, setPriceText] = useState(() =>
    review.draft.price ? priceInputText(review.draft.price.amount) : '',
  );
  const paused = useLogPause(onClose);

  const loaded = settings.status === 'ready' ? settings.value : null;
  // Until the first edit the copy follows the settings, so grams-first applies once they are read.
  const working = edits ?? (loaded ? openingWorking(review.draft, loaded['log.gramsFirst']) : null);
  const loggedAt = when === null ? openedAt : instantOf(when);
  const meal: MealKind =
    pickedMeal ?? (loaded ? mealAtInstant(loggedAt, loaded['meals.times']) : 'other');
  const source: EntrySource = review.source ?? (review.photoIds.length > 0 ? 'photo' : 'text');
  const currency = review.draft.price?.currency ?? loaded?.['money.currency'] ?? DEFAULT_CURRENCY;
  const priceInvalid = priceTextInvalid(priceText);

  const update = (change: (current: ReviewWorking) => ReviewWorking): void =>
    setEdits((previous) => {
      const current = previous ?? working;
      return current ? change(current) : previous;
    });

  const foodOf = (current: ReviewWorking): ReviewFood => ({
    draft: withTypedPrice(
      {
        ...draftAtAmount(current.draft, current.shown),
        name: name.trim() === '' ? review.draft.name : name.trim(),
      },
      priceText,
      currency,
    ),
    loggedAt,
    meal,
    source,
    photoIds: review.photoIds,
  });

  const log = async (): Promise<void> => {
    if (!working || priceInvalid || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    const food = foodOf(working);
    const ctx = {
      loggedAt: food.loggedAt,
      meal: food.meal,
      source: food.source,
      photoIds: food.photoIds,
    };
    try {
      const result = await diary.logEntry(food.draft, ctx);
      if (result.kind === 'logged') {
        // The sheet goes; the guard stays shut, so nothing more is logged from it.
        onClose();
        return;
      }
      if (result.kind === 'fastActive') paused.pause(food.draft, ctx);
    } catch (error) {
      console.error('Logging the reviewed food failed', error);
      toast.show(t('review.failed'));
    }
    inFlight.current = false;
    setSaving(false);
  };

  return (
    <Sheet
      open
      title={t('review.title')}
      onClose={onClose}
      dismissable={false}
      data-ui="review"
      leading={
        <Button variant="quiet" disabled={saving} onClick={onClose} data-ui="review.cancel">
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <div className={styles.actions}>
          {slots.fitCheck ? (
            <Button
              variant="quiet"
              disabled={!working}
              onClick={() => setFitCheckOpen(true)}
              data-ui="review.fitCheck"
            >
              {t('review.fitCheck')}
            </Button>
          ) : null}
          <Button
            variant="primary"
            busy={saving}
            disabled={!working || priceInvalid}
            onClick={log}
            data-ui="review.log"
          >
            {t('review.log')}
          </Button>
        </div>
      }
    >
      {working && loaded ? (
        <div className={styles.body}>
          <PhotoStrip photoIds={review.photoIds} emoji={working.draft.emoji} />
          {review.fromSavedLabel ? slots.savedLabelNotice : null}
          <Field
            label={t('review.name')}
            value={name}
            onChange={setName}
            placeholder={review.draft.name}
            autoComplete="off"
            enterKeyHint="done"
            data-ui="review.name"
          />
          {slots.allergenLine?.(foodOf(working))}
          <ServingCard
            units={pickerUnits(working.draft.basis, working.draft.units)}
            shown={working.shown}
            onChange={(shown) => update((current) => ({ ...current, shown }))}
          />
          <NutritionRows
            values={working.draft}
            scale={workingScale(working)}
            energyUnit={loaded['units.energy']}
            unlocked={unlocked}
            onUnlockedChange={setUnlocked}
            hasLines={working.draft.lines.length > 0}
            onChange={(key, base) =>
              update((current) => ({ ...current, draft: { ...current.draft, [key]: base } }))
            }
          />
          {slots.ingredients?.({
            working,
            opened: review.draft,
            scale: workingScale(working),
            lines: working.draft.lines.map((line) => scaleLine(line, workingScale(working))),
            onLinesChange: (lines) => update((current) => withLines(current, lines)),
            onWorkingChange: (next) => update(() => next),
          })}
          <MoreNutrition
            nutrients={working.draft.nutrients}
            extras={working.draft.extras}
            scale={workingScale(working)}
            unlocked={unlocked}
            onNutrientChange={(key, base) =>
              update((current) => ({
                ...current,
                draft: {
                  ...current.draft,
                  nutrients: withValue(current.draft.nutrients, key, base),
                },
              }))
            }
            onExtraChange={(key, base) =>
              update((current) => ({
                ...current,
                draft: { ...current.draft, extras: withValue(current.draft.extras, key, base) },
              }))
            }
          />
          <button
            type="button"
            className={logStyles.mealRow}
            aria-haspopup="dialog"
            onClick={mealPicker.show}
            data-ui="review.meal"
          >
            <span className={logStyles.mealLabel}>{t('review.meal.label')}</span>{' '}
            <span className={logStyles.mealValue}>{t(MEAL_NAME_KEYS[meal])}</span>
            <Icon name="chevronRight" size={18} className={logStyles.mealChevron} />
          </button>
          <PriceField
            value={priceText}
            currency={currency}
            onChange={setPriceText}
            data-ui="price.review"
          />
          <DateTimeField
            kind="datetime"
            label={t('review.when')}
            value={when ?? dateTimeOf(openedAt)}
            min={{ date: yearsBefore(today, REVIEW_YEARS_BACK), time: '00:00' }}
            max={dateTimeOf(clock.now())}
            onChange={setWhen}
            data-ui="review.when"
          />
          {working.draft.product ? slots.productBlock?.(working.draft.product) : null}
        </div>
      ) : null}
      <ListPicker
        open={mealPicker.open}
        title={t('review.meal.picker')}
        options={MEAL_KINDS.map((kind) => ({ value: kind, label: t(MEAL_NAME_KEYS[kind]) }))}
        value={meal}
        onSelect={setPickedMeal}
        onClose={mealPicker.close}
        data-ui="review.mealPicker"
      />
      {fitCheckOpen && working && slots.fitCheck
        ? slots.fitCheck({ food: foodOf(working), onClose: () => setFitCheckOpen(false) })
        : null}
      <PausedDialog {...paused.dialog} />
    </Sheet>
  );
}

/**
 * The parts the analysis review fills itself: the saved-label notice, the allergen line, the
 * ingredients card, the product block and the fit check.
 */
const ANALYSIS_SLOTS: ReviewSlots = {
  savedLabelNotice: <SavedLabelNotice />,
  allergenLine: (food) => <AllergenLine food={food.draft} />,
  ingredients: (slot) => <IngredientsCard {...slot} />,
  productBlock: (product) => <ProductBlock product={product} />,
  fitCheck: (slot) => <FitCheckSheet {...slot} />,
};

/**
 * The review of the app's food analysis: open while the analysis has a draft waiting
 * (`reviewReady`); Log and Cancel hand the draft back to the analysis, which lets it go. A new
 * draft starts a fresh sheet. Mounted once in the tab frame; it fills the slots it serves
 * itself (`ANALYSIS_SLOTS`) and takes any others it is given.
 */
export function AnalysisReview({ slots }: { readonly slots?: ReviewSlots }) {
  const { service, state } = useAnalysis();
  if (state.phase !== 'reviewReady') return null;
  const close = (): void => {
    service.closeReview().catch((error: unknown) => {
      console.error('The reviewed draft could not be let go', error);
    });
  };
  return (
    <ReviewSheet
      key={state.generation}
      review={state.draft}
      onClose={close}
      slots={{ ...ANALYSIS_SLOTS, ...slots }}
    />
  );
}
