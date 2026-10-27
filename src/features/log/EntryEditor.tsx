import { useEffect, useId, useRef, useState } from 'react';
import { useAppState, viewedDay } from '../../app/appState';
import { useToday } from '../../app/TodayProvider';
import { useSheet } from '../../app/useRoute';
import { useDayEntries, useSavedMeals, useSettings } from '../../data/hooks';
import { dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import {
  MEAL_KINDS,
  type DiaryEntry,
  type MealKind,
  type NutritionDraft,
} from '../../domain/model';
import { draftAtAmount, initialAmount, scaleLine } from '../../domain/servings/scale';
import { pickerUnits } from '../../domain/servings/units';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import { withoutPhotos } from '../../services/diary';
import type { ReprocessRequest } from '../../services/reprocess';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/classes';
import { DateTimeField, type DateTimeValue } from '../../ui/DateTimeField';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Icon } from '../../ui/icons';
import { ListPicker } from '../../ui/ListPicker';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import styles from './editor.module.css';
import logStyles from './log.module.css';
import { MEAL_NAME_KEYS } from './meals';
import { AllergenLine } from './review/AllergenLine';
import { IngredientsCard } from './review/IngredientsCard';
import { MoreNutrition } from './review/MoreNutrition';
import { NutritionRows } from './review/NutritionRows';
import { PhotoStrip } from './review/PhotoStrip';
import { ProductBlock } from './review/ProductBlock';
import reviewStyles from './review/review.module.css';
import {
  dateTimeOf,
  instantOf,
  openingWorking,
  REVIEW_YEARS_BACK,
  withLines,
  withValue,
  workingScale,
  yearsBefore,
  type ReviewWorking,
} from './review/ReviewSheet';
import { ServingCard } from './review/ServingCard';

/** The editor's meal picker on the sheet stack, above the editor. */
export const EDITOR_MEAL_SHEET = 'editor-meal';

const SETTINGS = ['log.gramsFirst', 'units.energy'] as const;

// ---- The editor's copy of the entry ---------------------------------------------------------

/** Everything the editor changes before Save; nothing is written until then. */
export interface EditorForm {
  /** The values, the parts and the amount on the serving card (the review's working copy). */
  readonly working: ReviewWorking;
  /** The entry's own photos as edited, primary first (the parts' photos are on the parts). */
  readonly photoIds: readonly string[];
  readonly name: string;
  /** The note as typed. */
  readonly note: string;
  /** The note the values belong to: the stored one, or the one the last reprocess used. */
  readonly savedNote: string;
  readonly meal: MealKind;
  /** The picked local date and minute; null while untouched. */
  readonly when: DateTimeValue | null;
}

/** The food values of an entry, without its place in the diary. */
function draftOf(entry: DiaryEntry): NutritionDraft {
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

/**
 * The copy an editor opens with: the entry's own values and header (an edit made through the
 * unlock at review stays, even when the parts add up to something else), at scale 1 in the unit
 * the entry was logged in (grams first when that setting is on).
 */
export function openingForm(entry: DiaryEntry, gramsFirst: boolean): EditorForm {
  const draft = draftOf(entry);
  const note = entry.note ?? '';
  return {
    working: { draft, shown: initialAmount(draft, gramsFirst) },
    photoIds: entry.photoIds,
    name: entry.name,
    note,
    savedNote: note.trim(),
    meal: entry.meal,
    when: null,
  };
}

/** The name Save would store: the one typed, trimmed, or the copy's own when left blank. */
function nameOf(form: EditorForm): string {
  const typed = form.name.trim();
  return typed === '' ? form.working.draft.name : typed;
}

/**
 * The instant Save stores: the entry's own, to the millisecond, unless the person picked another
 * date or minute (R02.21); then the picked local date and minute.
 */
export function savedInstant(entry: DiaryEntry, when: DateTimeValue | null): number {
  if (when === null) return entry.loggedAt;
  const before = dateTimeOf(entry.loggedAt);
  return when.date === before.date && when.time === before.time ? entry.loggedAt : instantOf(when);
}

/**
 * The entry as Save writes it: every value at the shown amount with the parts and serving, the
 * name (blank keeps the copy's), the meal, the note trimmed (blank: none), the photos as edited
 * and the instant by `savedInstant`. Id, source and product stay the entry's.
 */
export function editedEntry(entry: DiaryEntry, form: EditorForm): DiaryEntry {
  const loggedAt = savedInstant(entry, form.when);
  const next: DiaryEntry = {
    ...draftAtAmount(form.working.draft, form.working.shown),
    name: nameOf(form),
    id: entry.id,
    loggedAt,
    dayKey: dayKeyOf(loggedAt),
    meal: form.meal,
    source: entry.source,
    photoIds: [...form.photoIds],
  };
  const note = form.note.trim();
  delete next.note;
  if (note !== '') next.note = note;
  return next;
}

/** The photos the strip shows: the entry's own, then its parts', without repeats. */
function galleryOf(form: EditorForm): string[] {
  const lines = form.working.draft.lines.flatMap((line) => line.photoIds);
  return [...new Set([...form.photoIds, ...lines])];
}

/** The copy without one photo, wherever it is named (`withoutPhotos`). */
export function withoutPhoto(form: EditorForm, photoId: string): EditorForm {
  const { draft } = form.working;
  const next = withoutPhotos({ photoIds: form.photoIds, lines: draft.lines }, [photoId]);
  return {
    ...form,
    photoIds: next.photoIds,
    working: { ...form.working, draft: { ...draft, lines: next.lines } },
  };
}

/**
 * The copy after a reprocess: the answer's name, emoji, values, serving and parts replace the
 * copy's (a recipe split ends); the plate-in-steps flag and the product stay the entry's; the note
 * it was asked with counts as saved, so the primary button reads Save again.
 */
export function afterReprocess(
  form: EditorForm,
  answer: NutritionDraft,
  noteUsed: string,
  gramsFirst: boolean,
): EditorForm {
  const { note: _note, ...values } = answer;
  const current = form.working.draft;
  const draft: NutritionDraft = { ...values, progressive: current.progressive };
  delete draft.product;
  if (current.product) draft.product = current.product;
  return {
    ...form,
    working: openingWorking(draft, gramsFirst),
    name: draft.name,
    savedNote: noteUsed.trim(),
  };
}

// ---- The sheet ------------------------------------------------------------------------------

export interface EntryEditorProps {
  /** The diary entry to edit. */
  readonly entryId: string;
  /** The day it is on; the day Home shows when left out. */
  readonly dayKey?: DayKey;
  /** After Save, Delete or Cancel. */
  readonly onClose: () => void;
}

type Busy = 'saving' | 'reprocessing' | null;

/**
 * Editing a logged entry (02 §3.7, D-16.19): the review's layout with Save as the primary action.
 * The editor changes its own copy; nothing is written until Save, and Cancel drops it. Nutrition
 * opens through the review's lock. Each photo has a remove button; removals are staged in the copy
 * (the next photo becomes the primary; with no meal photo left, the first part photo does). While
 * the note differs from the saved one the primary button reads Reprocess: the AI's answer replaces
 * the copy's values, and its failures show under the note. Save keeps the entry's instant to the
 * millisecond unless the date or minute changed (R02.21), then lets go of the photos the edit
 * dropped (a saved meal sharing one keeps it, R02.8). The Saved switch acts at once; Delete asks
 * first. Only Cancel, Save and Delete close it.
 */
export function EntryEditor({ entryId, dayKey, onClose }: EntryEditorProps) {
  const { diary, reprocess, clock } = useServices();
  const toast = useToast();
  const today = useToday();
  const { selectedDay } = useAppState();
  const day = dayKey ?? viewedDay(selectedDay, today);
  const read = useDayEntries(day);
  const savedRead = useSavedMeals();
  const settings = useSettings(SETTINGS);
  const mealPicker = useSheet(EDITOR_MEAL_SHEET);
  const noteId = useId();
  const problemId = useId();
  const inFlight = useRef(false);
  const running = useRef<AbortController | null>(null);
  const [opened, setOpened] = useState<DiaryEntry | null>(null);
  const [edited, setEdited] = useState<EditorForm | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<readonly string[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [toggling, setToggling] = useState(false);

  // A reprocess still running when the sheet goes is stopped; its answer is never shown.
  useEffect(() => () => running.current?.abort(), []);

  const stored =
    read.status === 'ready' ? (read.value.find((entry) => entry.id === entryId) ?? null) : null;
  // The entry as it opened: a later write elsewhere does not reset the edits.
  if (opened === null && stored !== null) setOpened(stored);
  const entry = opened ?? stored;
  const missing = entry === null && read.status !== 'loading';
  const loaded = settings.status === 'ready' ? settings.value : null;
  const form = edited ?? (entry && loaded ? openingForm(entry, loaded['log.gramsFirst']) : null);
  const saved =
    savedRead.status === 'ready' && savedRead.value.some((meal) => meal.originEntryId === entryId);

  const update = (change: (current: EditorForm) => EditorForm): void =>
    setEdited((previous) => {
      const current = previous ?? form;
      return current ? change(current) : previous;
    });
  const updateWorking = (change: (working: ReviewWorking) => ReviewWorking): void =>
    update((current) => ({ ...current, working: change(current.working) }));

  const noteChanged = form !== null && form.note.trim() !== form.savedNote;
  const reprocessing = busy === 'reprocessing';

  const cancel = (): void => {
    running.current?.abort();
    onClose();
  };

  const save = async (): Promise<void> => {
    if (!form || !entry || !diary.updateEntry || inFlight.current) return;
    inFlight.current = true;
    setBusy('saving');
    try {
      const result = await diary.updateEntry(editedEntry(entry, form));
      if (result.kind === 'updated') {
        // The sheet goes; the guard stays shut, so nothing more is written from it.
        onClose();
        return;
      }
      if (result.kind === 'missing') {
        toast.show(t('editor.missing'));
        onClose();
        return;
      }
      if (result.kind === 'fastActive') toast.show(t('review.paused'));
    } catch (error) {
      console.error('Saving the edited entry failed', error);
      toast.show(t('editor.failed'));
    }
    inFlight.current = false;
    setBusy(null);
  };

  const runReprocess = async (): Promise<void> => {
    if (!form || !loaded || inFlight.current) return;
    if (!reprocess) {
      setProblem([t('editor.note.unavailable')]);
      return;
    }
    const request: ReprocessRequest = {
      name: nameOf(form),
      amount: form.working.shown,
      note: form.note,
      photoIds: form.photoIds,
      progressive: form.working.draft.progressive,
    };
    const gramsFirst = loaded['log.gramsFirst'];
    const controller = new AbortController();
    running.current = controller;
    inFlight.current = true;
    setBusy('reprocessing');
    setProblem(null);
    const outcome = await reprocess.run(request, controller.signal);
    // Cancelled, or the sheet went: nothing to show.
    if (controller.signal.aborted) return;
    running.current = null;
    inFlight.current = false;
    setBusy(null);
    if (outcome.kind === 'draft') {
      update((current) => afterReprocess(current, outcome.draft, request.note, gramsFirst));
    } else if (outcome.kind === 'failed') {
      setProblem(outcome.messages.map(({ key, params }) => t(key, params)));
    }
  };

  const toggleSaved = async (): Promise<void> => {
    const current = stored ?? entry;
    if (!current || !diary.toggleSaved || toggling) return;
    setToggling(true);
    try {
      await diary.toggleSaved(current);
    } catch (error) {
      console.error('Changing the saved meals failed', error);
      toast.show(t('editor.saved.failed'));
    }
    setToggling(false);
  };

  const remove = async (): Promise<void> => {
    if (!entry) return;
    try {
      await diary.deleteEntry(entry.id);
      onClose();
    } catch (error) {
      console.error('Deleting the edited entry failed', error);
      toast.show(t('editor.delete.failed'));
      setAsking(false);
    }
  };

  const primaryLabel = reprocessing
    ? t('editor.reprocessing')
    : noteChanged
      ? t('editor.reprocess')
      : t('common.save');

  return (
    <Sheet
      open
      title={t('editor.title')}
      onClose={cancel}
      dismissable={false}
      data-ui="editor"
      leading={
        <Button
          variant="quiet"
          disabled={busy === 'saving'}
          onClick={cancel}
          data-ui="editor.cancel"
        >
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          busy={busy !== null}
          disabled={!form || (!noteChanged && !diary.updateEntry)}
          onClick={noteChanged ? runReprocess : save}
          data-ui="editor.save"
        >
          {primaryLabel}
        </Button>
      }
    >
      {missing ? (
        <p className={styles.missing} role="status" data-ui="editor.missing">
          {t('editor.missing')}
        </p>
      ) : null}
      {form && entry && loaded ? (
        <fieldset
          className={cx(reviewStyles.body, styles.form)}
          disabled={reprocessing}
          aria-busy={reprocessing || undefined}
        >
          <PhotoStrip
            photoIds={galleryOf(form)}
            emoji={form.working.draft.emoji}
            onRemove={(index) => {
              const photoId = galleryOf(form)[index];
              if (photoId !== undefined) update((current) => withoutPhoto(current, photoId));
            }}
            removeDisabled={reprocessing}
          />
          <Field
            label={t('review.name')}
            value={form.name}
            onChange={(name) => update((current) => ({ ...current, name }))}
            placeholder={form.working.draft.name}
            autoComplete="off"
            enterKeyHint="done"
            data-ui="editor.name"
          />
          <AllergenLine food={draftAtAmount(form.working.draft, form.working.shown)} />
          <ServingCard
            units={pickerUnits(form.working.draft.basis, form.working.draft.units)}
            shown={form.working.shown}
            onChange={(shown) => updateWorking((working) => ({ ...working, shown }))}
          />
          <NutritionRows
            values={form.working.draft}
            scale={workingScale(form.working)}
            energyUnit={loaded['units.energy']}
            unlocked={unlocked}
            onUnlockedChange={setUnlocked}
            hasLines={form.working.draft.lines.length > 0}
            onChange={(key, base) =>
              updateWorking((working) => ({ ...working, draft: { ...working.draft, [key]: base } }))
            }
          />
          <IngredientsCard
            working={form.working}
            opened={draftOf(entry)}
            scale={workingScale(form.working)}
            lines={form.working.draft.lines.map((line) =>
              scaleLine(line, workingScale(form.working)),
            )}
            onLinesChange={(lines) => updateWorking((working) => withLines(working, lines))}
            onWorkingChange={(next) => updateWorking(() => next)}
          />
          <MoreNutrition
            nutrients={form.working.draft.nutrients}
            extras={form.working.draft.extras}
            scale={workingScale(form.working)}
            unlocked={unlocked}
            onNutrientChange={(key, base) =>
              updateWorking((working) => ({
                ...working,
                draft: {
                  ...working.draft,
                  nutrients: withValue(working.draft.nutrients, key, base),
                },
              }))
            }
            onExtraChange={(key, base) =>
              updateWorking((working) => ({
                ...working,
                draft: { ...working.draft, extras: withValue(working.draft.extras, key, base) },
              }))
            }
          />
          <button
            type="button"
            className={logStyles.mealRow}
            aria-haspopup="dialog"
            onClick={mealPicker.show}
            data-ui="editor.meal"
          >
            <span className={logStyles.mealLabel}>{t('review.meal.label')}</span>{' '}
            <span className={logStyles.mealValue}>{t(MEAL_NAME_KEYS[form.meal])}</span>
            <Icon name="chevronRight" size={18} className={logStyles.mealChevron} />
          </button>
          <div className={styles.note}>
            <label htmlFor={noteId} className={styles.noteLabel}>
              {t('editor.note.label')}
            </label>
            <textarea
              id={noteId}
              className={styles.noteInput}
              rows={3}
              value={form.note}
              placeholder={t('editor.note.placeholder')}
              aria-describedby={problem ? problemId : undefined}
              onChange={(event) => {
                const note = event.target.value;
                update((current) => ({ ...current, note }));
              }}
              data-ui="editor.note"
            />
            {problem ? (
              <div id={problemId} className={styles.problem} role="alert" data-ui="editor.problem">
                {problem.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            ) : null}
          </div>
          <DateTimeField
            kind="datetime"
            label={t('review.when')}
            value={form.when ?? dateTimeOf(entry.loggedAt)}
            min={{ date: yearsBefore(today, REVIEW_YEARS_BACK), time: '00:00' }}
            max={dateTimeOf(clock.now())}
            onChange={(when) => update((current) => ({ ...current, when }))}
            data-ui="editor.when"
          />
          {form.working.draft.product ? (
            <ProductBlock product={form.working.draft.product} />
          ) : null}
          <Card className={styles.actions} data-ui="editor.actions">
            {diary.toggleSaved ? (
              <Switch
                label={t('editor.saved.label')}
                description={t('editor.saved.description')}
                checked={saved}
                disabled={savedRead.status !== 'ready' || toggling}
                onChange={() => void toggleSaved()}
                data-ui="editor.saved"
              />
            ) : null}
            <Button variant="danger" onClick={() => setAsking(true)} data-ui="editor.delete">
              {t('editor.delete.button')}
            </Button>
          </Card>
        </fieldset>
      ) : null}
      <ListPicker
        open={mealPicker.open}
        title={t('review.meal.picker')}
        options={MEAL_KINDS.map((kind) => ({ value: kind, label: t(MEAL_NAME_KEYS[kind]) }))}
        value={form?.meal ?? 'other'}
        onSelect={(meal) => update((current) => ({ ...current, meal }))}
        onClose={mealPicker.close}
        data-ui="editor.mealPicker"
      />
      <Dialog
        open={asking && entry !== null}
        title={t('editor.delete.title')}
        message={t('editor.delete.message', { name: entry?.name ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={remove}
        onCancel={() => setAsking(false)}
        data-ui="editor.deleteDialog"
      />
    </Sheet>
  );
}
