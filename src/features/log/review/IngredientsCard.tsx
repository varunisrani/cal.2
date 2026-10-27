import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSheet } from '../../../app/useRoute';
import { useSettings } from '../../../data/hooks';
import type { IngredientLine } from '../../../domain/model';
import { draftAsLine } from '../../../domain/servings/ingredients';
import { canSplit, SPLIT_MAX, SPLIT_MIN, splitRecipe } from '../../../domain/servings/recipe';
import { scaleLine } from '../../../domain/servings/scale';
import { formatEnergy, type EnergyDisplayUnit } from '../../../domain/units/energy';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import type { IntakeOutcome, IntakeSession } from '../../../services/ingredientIntake';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/icons';
import { Stepper } from '../../../ui/Stepper';
import { AddIngredientMenu } from './AddIngredientMenu';
import styles from './ingredients.module.css';
import { LineEditor } from './LineEditor';
import { macroText } from './NutritionRows';
import type { IngredientsSlot, ReviewWorking } from './ReviewSheet';

/** The part editor's place on the sheet stack, above the review. */
export const LINE_EDITOR_SHEET = 'review-ingredient';

const SETTINGS = ['units.energy'] as const;

/**
 * The copy divided into `servings` (1–50): a serving unit first and one serving shown
 * (`splitRecipe`); unchanged when its weight is unknown.
 */
export function withSplit(working: ReviewWorking, servings: number): ReviewWorking {
  const split = splitRecipe(working.draft, servings);
  if (!split) return working;
  return { draft: split.draft, shown: split.shown, servings: split.servings };
}

/**
 * The copy of a meal without parts with the meal itself, as it stands, as its one part (energy
 * and macros, its weight or 0 g when unknown, its emoji; its photos stay the meal's). A first
 * part added next then adds to the meal, and the nutrients stretch from the meal's weight,
 * instead of the new part taking the meal's place.
 */
export function withMealAsPart(working: ReviewWorking): ReviewWorking {
  if (working.draft.lines.length > 0) return working;
  return { ...working, draft: { ...working.draft, lines: [draftAsLine(working.draft, [])] } };
}

/** Whether the split stepper shows: the domain's rule, the portion check on the opened draft. */
function splitOffered({ working, opened }: IngredientsSlot): boolean {
  const { basis, lines } = working.draft;
  return canSplit({ basis, lines, units: opened.units });
}

/** This sheet's intake session while the card is on screen; closed when it goes. */
function useIntakeSession(): IntakeSession | null {
  const { ingredientIntake } = useServices();
  const [session, setSession] = useState<IntakeSession | null>(null);
  useEffect(() => {
    if (!ingredientIntake) return undefined;
    const opened = ingredientIntake.open();
    setSession(opened);
    return () => {
      opened.close().catch((error: unknown) => {
        console.error('Letting go of ingredient photos failed', error);
      });
    };
  }, [ingredientIntake]);
  return session;
}

/** The card's state of an AI part request: idle, running, or the lines of its problem. */
type Request =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'problem'; readonly lines: readonly string[] };

const IDLE: Request = { kind: 'idle' };

/** What the person reads after an outcome; null when there is nothing to say. */
function problemOf(outcome: IntakeOutcome): readonly string[] | null {
  if (outcome.kind === 'failed') return outcome.messages.map(({ key, params }) => t(key, params));
  if (outcome.kind === 'refused') return [t(`ingredients.refused.${outcome.reason}`)];
  return null;
}

/**
 * The meal's parts on the review (02 §3.15): each with its photo or emoji, name, weight and
 * energy, and macros; a tap opens the part editor. "Add ingredient" offers the sources; an AI
 * part shows a busy line while it is worked out, and a problem with a dismiss when it fails.
 * Every change goes to the sheet as the parts it shows (`onLinesChange`), so the header becomes
 * their sums (R02.4, R02.5). With two parts or more, a known weight and a draft that is not
 * already one portion of a split dish, "Servings in recipe" divides the dish (R02.6).
 */
export function IngredientsCard(slot: IngredientsSlot) {
  const { working, lines } = slot;
  const settings = useSettings(SETTINGS);
  const session = useIntakeSession();
  const editorSheet = useSheet(LINE_EDITOR_SHEET);
  const [target, setTarget] = useState<{ readonly index: number | null } | null>(null);
  const [request, setRequest] = useState<Request>(IDLE);
  // The slot as last drawn: an answer that arrives later applies to the parts as they are then.
  const latest = useRef(slot);
  useLayoutEffect(() => {
    latest.current = slot;
  });

  if (settings.status !== 'ready') return null;
  const energyUnit = settings.value['units.energy'];

  const add = (line: IngredientLine): void => {
    const { working: now, lines: shown, scale, onLinesChange, onWorkingChange } = latest.current;
    if (shown.length > 0) {
      onLinesChange([...shown, line]);
      return;
    }
    const seeded = withMealAsPart(now);
    onWorkingChange(seeded);
    onLinesChange([...seeded.draft.lines.map((part) => scaleLine(part, scale)), line]);
  };
  const replace = (index: number, line: IngredientLine): void => {
    const { lines: shown, onLinesChange } = latest.current;
    onLinesChange(shown.map((part, at) => (at === index ? line : part)));
  };
  const remove = (index: number): void => {
    const { lines: shown, onLinesChange } = latest.current;
    onLinesChange(shown.filter((_, at) => at !== index));
  };

  const ask = (pending: Promise<IntakeOutcome>): void => {
    setRequest({ kind: 'busy' });
    pending.then(
      (outcome) => {
        if (outcome.kind === 'stopped') return;
        if (outcome.kind === 'line') add(outcome.line);
        const problem = problemOf(outcome);
        setRequest(problem ? { kind: 'problem', lines: problem } : IDLE);
      },
      (error: unknown) => {
        console.error('Working out an ingredient failed', error);
        setRequest(IDLE);
      },
    );
  };

  const edit = (index: number | null): void => {
    setTarget({ index });
    editorSheet.show();
  };
  const editIndex = target?.index ?? null;
  const editing = editIndex === null ? null : (lines[editIndex] ?? null);
  const servings = working.servings ?? SPLIT_MIN;

  return (
    <Card heading={t('ingredients.heading')} data-ui="ingredients">
      {lines.length === 0 ? (
        <p className={styles.empty} data-ui="ingredients.empty">
          {t('ingredients.empty')}
        </p>
      ) : (
        <ul className={styles.lines}>
          {lines.map((line, index) => (
            <li key={index}>
              <LineRow
                line={line}
                energyUnit={energyUnit}
                onOpen={() => edit(index)}
                data-ui={`ingredients.line.${index}`}
              />
            </li>
          ))}
        </ul>
      )}
      {request.kind === 'busy' ? (
        <p className={styles.busy} role="status" data-ui="ingredients.busy">
          <span className={styles.spinner} aria-hidden="true" />
          {t('ingredients.busy')}
        </p>
      ) : (
        <AddIngredientMenu
          canAnalyse={session !== null}
          onPhoto={(file) => session && ask(session.photo(file))}
          onDescribe={(text) => session && ask(session.describe(text))}
          onManual={() => edit(null)}
        />
      )}
      {request.kind === 'problem' ? (
        <div className={styles.problem} role="alert" data-ui="ingredients.problem">
          {request.lines.map((text) => (
            <p key={text}>{text}</p>
          ))}
          <Button
            variant="quiet"
            onClick={() => setRequest(IDLE)}
            data-ui="ingredients.problem.dismiss"
          >
            {t('ingredients.dismiss')}
          </Button>
        </div>
      ) : null}
      {splitOffered(slot) ? (
        <div className={styles.split}>
          <div className={styles.splitRow}>
            <span className={styles.splitLabel} aria-hidden="true">
              {t('ingredients.split.label')}
            </span>
            <Stepper
              label={t('ingredients.split.label')}
              value={servings}
              min={SPLIT_MIN}
              max={SPLIT_MAX}
              onChange={(next) => slot.onWorkingChange(withSplit(latest.current.working, next))}
              data-ui="ingredients.split"
            />
          </div>
          <p className={styles.note}>{t('ingredients.split.note')}</p>
        </div>
      ) : null}
      <LineEditor
        key={editIndex ?? 'new'}
        open={editorSheet.open && target !== null}
        line={editing}
        energyUnit={energyUnit}
        onSave={(line) => (editIndex === null ? add(line) : replace(editIndex, line))}
        onRemove={editIndex === null ? undefined : () => remove(editIndex)}
        onClose={editorSheet.close}
      />
    </Card>
  );
}

interface LineRowProps {
  readonly line: IngredientLine;
  readonly energyUnit: EnergyDisplayUnit;
  readonly onOpen: () => void;
  readonly 'data-ui': string;
}

/** One part: its picture, name, weight and energy, and macros; a tap opens its editor. */
function LineRow({ line, energyUnit, onOpen, 'data-ui': ui }: LineRowProps) {
  const locale = currentLocale();
  const energy = formatEnergy(line.kcal, energyUnit, locale);
  const energyWord = t(energyUnit === 'kJ' ? 'review.unit.kJ' : 'review.unit.kcal');
  const gramWord = t('review.unit.g');
  return (
    <button type="button" className={styles.lineRow} onClick={onOpen} data-ui={ui}>
      <LineThumb photoId={line.photoIds[0]} emoji={line.emoji} />
      <span className={styles.lineName}>{line.name}</span>
      <span className={styles.lineAmount} data-ui={`${ui}.amount`}>
        {line.grams > 0
          ? t('ingredients.amount', {
              grams: macroText(line.grams, locale),
              gramUnit: gramWord,
              energy,
              energyUnit: energyWord,
            })
          : t('ingredients.energy', { energy, energyUnit: energyWord })}
      </span>
      <span className={styles.lineMacros} data-ui={`${ui}.macros`}>
        <span>
          {t('ingredients.macro.protein', {
            grams: macroText(line.protein, locale),
            unit: gramWord,
          })}
        </span>
        <span>
          {t('ingredients.macro.carbs', { grams: macroText(line.carbs, locale), unit: gramWord })}
        </span>
        <span>
          {t('ingredients.macro.fat', { grams: macroText(line.fat, locale), unit: gramWord })}
        </span>
      </span>
    </button>
  );
}

/** A part's photo thumbnail, else its emoji, else a plate. */
function LineThumb({ photoId, emoji }: { readonly photoId?: string; readonly emoji?: string }) {
  const url = useThumbnail(photoId);
  if (url) return <img className={styles.thumb} src={url} alt="" />;
  return (
    <span className={styles.thumb} aria-hidden="true">
      {emoji ? <span className={styles.thumbEmoji}>{emoji}</span> : <Icon name="plate" size={22} />}
    </span>
  );
}

/** An object URL for a stored photo's thumbnail, or null without one (or while it loads). */
function useThumbnail(photoId: string | undefined): string | null {
  const { photos } = useServices();
  const [loaded, setLoaded] = useState<{ readonly for: string; readonly url: string | null }>();

  useEffect(() => {
    if (!photos || photoId === undefined) return undefined;
    let live = true;
    let url: string | null = null;
    photos.thumbnail(photoId).then(
      (blob) => {
        if (!live) return;
        url = blob ? URL.createObjectURL(blob) : null;
        setLoaded({ for: photoId, url });
      },
      (error: unknown) => {
        console.error('An ingredient photo could not be shown', error);
      },
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photos, photoId]);

  return loaded !== undefined && loaded.for === photoId ? loaded.url : null;
}
