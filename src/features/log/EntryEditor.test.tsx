import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhotoRepo } from '../../data/repos/photoRepo';
import type { DiaryEntry, NutritionDraft } from '../../domain/model';
import { mergePartitions } from '../../i18n/catalogue';
import { enPartitions } from '../../i18n/en';
import { ai as aiWords } from '../../i18n/en/ai';
import { common } from '../../i18n/en/common';
import { editor } from '../../i18n/en/editor';
import { log as logWords } from '../../i18n/en/log';
import { review } from '../../i18n/en/review';
import { lintCatalogue } from '../../i18n/lint';
import { ServicesProvider, type Services } from '../../services/context';
import {
  createDiaryService,
  type DiaryService,
  type UpdateEntryResult,
} from '../../services/diary';
import type {
  ReprocessOutcome,
  ReprocessRequest,
  ReprocessService,
} from '../../services/reprocess';
import { withIdSequence } from '../../lib/ids';
import { storableBlob } from '../../test/blobs';
import { makeDraft, makeEntry, makeFast, makeLine } from '../../test/factories';
import { closeHarnesses, openHarness, until, untilShown } from '../../test/screenHarness';
import { EntryEditor } from './EntryEditor';

afterEach(closeHarnesses);

const words = editor.editor;
const reviewWords = review.review;
const meals = logWords.log.meal;

/** A soup logged this morning at 09:30:41.250, eaten as one bowl. */
const MORNING = Date.parse('2026-10-26T09:30:41.250-04:00');
const soup = (overrides: Partial<DiaryEntry> = {}) =>
  makeEntry({
    id: 'entry-soup',
    loggedAt: MORNING,
    chosenUnit: 'bowl',
    chosenCount: 1,
    note: 'Homemade',
    ...overrides,
  });

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

/** A reprocess service that answers with `answer` (a draft, or a promise of an outcome). */
function standInReprocess(answer: NutritionDraft | Promise<ReprocessOutcome>) {
  const run = vi.fn<ReprocessService['run']>(async () =>
    answer instanceof Promise ? answer : { kind: 'draft', draft: answer },
  );
  return { run };
}

interface Setup {
  readonly entry?: DiaryEntry;
  readonly entryId?: string;
  /** Photos stored before the entry (their ids are `photo-1`, `photo-2`, …). */
  readonly photos?: number;
  readonly reprocess?: ReprocessService;
  /** Replaces parts of the real diary service. */
  readonly diary?: Partial<DiaryService>;
}

/** The editor open on a stored entry, over the real diary service with the saved meals. */
async function openEditor(setup: Setup = {}) {
  const h = await openHarness();
  const photoRepo = createPhotoRepo(h.db, { newId: withIdSequence('photo') });
  const photoIds: string[] = [];
  for (let index = 0; index < (setup.photos ?? 0); index++) {
    photoIds.push(await photoRepo.put(await storableBlob(16, index), { width: 4, height: 3 }));
  }
  const entry = setup.entry ?? soup();
  await h.repos.diaryRepo.add(entry);
  const diary: DiaryService = {
    ...createDiaryService({
      diaryRepo: h.repos.diaryRepo,
      photoRepo,
      savedMealsRepo: h.repos.savedMealsRepo,
    }),
    ...setup.diary,
  };
  const services: Services = {
    ...h.services,
    diary,
    ...(setup.reprocess ? { reprocess: setup.reprocess } : {}),
  };
  const onClose = vi.fn();
  h.mount(
    <ServicesProvider services={services}>
      <EntryEditor entryId={setup.entryId ?? entry.id} onClose={onClose} />
    </ServicesProvider>,
  );
  if (setup.entryId === undefined) await untilShown('[data-ui="review.amount"]');
  const sheet = within(screen.getByRole('dialog', { name: words.title }));
  return { ...h, photoRepo, photoIds, onClose, sheet, diary };
}

type Sheet = Awaited<ReturnType<typeof openEditor>>['sheet'];

const hooked = (hook: string) => document.querySelector<HTMLElement>(`[data-ui="${hook}"]`);
const primary = () => hooked('editor.save') as HTMLElement;

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

function type(element: HTMLElement, value: string): void {
  fireEvent.change(element, { target: { value } });
}

/** Lets one round of queued tasks run (IndexedDB callbacks), inside act. No timer is involved. */
function nextTask(): Promise<void> {
  return act(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          resolve();
        };
        channel.port2.postMessage(null);
      }),
  );
}

/** Runs tasks until `check()` holds; fails after a generous number of rounds. */
async function settle(check: () => boolean | Promise<boolean>): Promise<void> {
  for (let round = 0; round < 500; round++) {
    if (await check()) return;
    await nextTask();
  }
  throw new Error('The editor never reached the expected state');
}

/** Presses Save and waits until the editor has closed. */
async function saveAndClose(onClose: ReturnType<typeof vi.fn>): Promise<void> {
  await press(primary());
  await settle(() => onClose.mock.calls.length > 0);
}

async function storedEntry(h: {
  repos: { diaryRepo: { since(ms: number): Promise<DiaryEntry[]> } };
}) {
  const [entry, ...others] = await h.repos.diaryRepo.since(0);
  expect(others).toEqual([]);
  return entry;
}

const removeButton = (sheet: Sheet, number: number, count: number) =>
  sheet.getByRole('button', { name: `Remove photo ${number} of ${count}` });
const openButtons = (sheet: Sheet) => sheet.queryAllByRole('button', { name: /^Open photo/ });

describe('EntryEditor: Save', () => {
  it('is titled Edit entry with Cancel and Save, and Escape does not close it', async () => {
    const { sheet, onClose } = await openEditor();
    expect(sheet.getByRole('button', { name: common.common.cancel })).toBeEnabled();
    expect(primary()).toHaveTextContent(common.common.save);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.getByRole('textbox', { name: reviewWords.name })).toHaveValue('Lentil soup');
  });

  it('keeps loggedAt to the millisecond and every value when an untouched entry is saved (ACC-D12-1, R02.21)', async () => {
    const entry = soup({
      // The header was edited through the unlock at review: it is not the parts' sum (R02.5).
      kcal: 450,
      lines: [
        makeLine({ name: 'Lentils', grams: 300, kcal: 330 }),
        makeLine({ name: 'Broth', grams: 120, kcal: 60 }),
      ],
    });
    const h = await openEditor({ entry });
    expect(hooked('editor.when.time')).toHaveValue('09:30');
    expect(hooked('review.kcal')).toHaveTextContent('450');

    await saveAndClose(h.onClose);

    expect(await storedEntry(h)).toEqual(entry);
  });

  it('keeps the instant when the time is changed and changed back (R02.21)', async () => {
    const h = await openEditor();
    type(hooked('editor.when.time') as HTMLElement, '10:15');
    type(hooked('editor.when.time') as HTMLElement, '09:30');
    await saveAndClose(h.onClose);
    expect((await storedEntry(h))?.loggedAt).toBe(MORNING);
  });

  it('stores the picked date and minute when they change, and keeps the meal', async () => {
    const h = await openEditor();
    type(hooked('editor.when.date') as HTMLElement, '2026-10-25');
    type(hooked('editor.when.time') as HTMLElement, '19:45');
    await saveAndClose(h.onClose);

    const stored = await storedEntry(h);
    expect(stored?.loggedAt).toBe(Date.parse('2026-10-25T19:45:00-04:00'));
    expect(stored?.dayKey).toBe('2026-10-25');
    expect(stored?.meal).toBe('lunch');
  });

  it('saves calories edited through the unlock (ACC-D12-2, D-16.19), at the amount shown', async () => {
    const h = await openEditor();
    fireEvent.change(h.sheet.getByRole('textbox', { name: reviewWords.serving.amount }), {
      target: { value: '2' },
    });
    expect(hooked('review.kcal')).toHaveTextContent('820');

    await press(h.sheet.getByRole('button', { name: reviewWords.nutrition.unlock }));
    type(h.sheet.getByRole('textbox', { name: reviewWords.nutrition.energy.kcal }), '1000');
    type(h.sheet.getByRole('textbox', { name: reviewWords.nutrition.protein }), '50');
    await saveAndClose(h.onClose);

    expect(await storedEntry(h)).toMatchObject({
      kcal: 1000,
      protein: 50,
      basis: { kind: 'grams', grams: 840 },
      chosenUnit: 'bowl',
      chosenCount: 2,
      nutrients: { fibre: 28, sodium: 1640 },
    });
  });

  it('keeps the name when it is left blank, and stores the note trimmed', async () => {
    const h = await openEditor();
    type(h.sheet.getByRole('textbox', { name: reviewWords.name }), '   ');
    type(h.sheet.getByRole('textbox', { name: words.note.label }), '   ');
    // An emptied note differs from the saved one: the primary asks to reprocess, not to save.
    expect(primary()).toHaveTextContent(words.reprocess);
    type(h.sheet.getByRole('textbox', { name: words.note.label }), 'Homemade  ');
    expect(primary()).toHaveTextContent(common.common.save);
    await saveAndClose(h.onClose);
    expect(await storedEntry(h)).toMatchObject({ name: 'Lentil soup', note: 'Homemade' });
  });

  it('stores a typed name trimmed and the meal picked', async () => {
    const h = await openEditor();
    type(h.sheet.getByRole('textbox', { name: reviewWords.name }), '  Red lentil soup ');
    fireEvent.click(hooked('editor.meal') as HTMLElement);
    const picker = within(screen.getByRole('dialog', { name: reviewWords.meal.picker }));
    fireEvent.click(picker.getByRole('option', { name: meals.dinner }));
    expect(hooked('editor.meal')).toHaveTextContent(meals.dinner);
    await saveAndClose(h.onClose);
    expect(await storedEntry(h)).toMatchObject({ name: 'Red lentil soup', meal: 'dinner' });
  });

  it('writes nothing on Cancel', async () => {
    const h = await openEditor();
    type(h.sheet.getByRole('textbox', { name: reviewWords.name }), 'Pea soup');
    await press(h.sheet.getByRole('button', { name: common.common.cancel }));
    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(await storedEntry(h)).toEqual(soup());
  });

  it('keeps the edits with the paused message while a fast refuses the write', async () => {
    const fast = makeFast({ end: null });
    const refused: UpdateEntryResult = { kind: 'fastActive', fast };
    const updateEntry = vi.fn(async () => refused);
    const h = await openEditor({ diary: { updateEntry } });
    type(h.sheet.getByRole('textbox', { name: reviewWords.name }), 'Pea soup');

    await press(primary());
    await settle(() => hooked('toast.message') !== null);
    expect(hooked('toast.message')).toHaveTextContent(reviewWords.paused);
    expect(h.onClose).not.toHaveBeenCalled();
    expect(h.sheet.getByRole('textbox', { name: reviewWords.name })).toHaveValue('Pea soup');
    expect(primary()).not.toHaveAttribute('aria-busy');
    expect(updateEntry).toHaveBeenCalledTimes(1);
  });

  it('says so when the entry is no longer in the diary, and offers no Save', async () => {
    await openEditor({ entryId: 'entry-gone' });
    await untilShown('[data-ui="editor.missing"]');
    expect(hooked('editor.missing')).toHaveTextContent(words.missing);
    expect(primary()).toBeDisabled();
  });
});

describe('EntryEditor: photos', () => {
  it('stages a removal until Save: the next photo becomes the primary, then the file goes', async () => {
    const h = await openEditor({
      photos: 3,
      entry: soup({ photoIds: ['photo-1', 'photo-2', 'photo-3'] }),
    });
    expect(openButtons(h.sheet)).toHaveLength(3);

    await press(removeButton(h.sheet, 1, 3));
    expect(openButtons(h.sheet).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Open photo 1 of 2',
      'Open photo 2 of 2',
    ]);
    // Nothing is written yet.
    expect((await storedEntry(h))?.photoIds).toEqual(['photo-1', 'photo-2', 'photo-3']);
    expect(await h.photoRepo.get('photo-1')).not.toBeNull();

    await saveAndClose(h.onClose);
    expect((await storedEntry(h))?.photoIds).toEqual(['photo-2', 'photo-3']);
    expect(await h.photoRepo.get('photo-1')).toBeNull();
    expect(await h.photoRepo.get('photo-2')).not.toBeNull();
  });

  it('makes the first part photo the primary when no meal photo is left', async () => {
    const part = makeLine({ name: 'Croutons', photoIds: ['photo-2'] });
    const h = await openEditor({
      photos: 2,
      entry: soup({ photoIds: ['photo-1'], lines: [part] }),
    });
    expect(openButtons(h.sheet)).toHaveLength(2);

    await press(removeButton(h.sheet, 1, 2));
    expect(openButtons(h.sheet)).toHaveLength(1);
    await saveAndClose(h.onClose);

    const stored = await storedEntry(h);
    expect(stored?.photoIds).toEqual(['photo-2']);
    expect(stored?.lines).toEqual([part]);
    expect(await h.photoRepo.get('photo-1')).toBeNull();
  });

  it('leaves a photo shared with a saved meal in the saved meal (R02.8)', async () => {
    const entry = soup({ photoIds: ['photo-1'] });
    const h = await openEditor({ photos: 1, entry });
    await h.repos.savedMealsRepo.toggleFromEntry(entry);

    await press(removeButton(h.sheet, 1, 1));
    expect(hooked('review.photos.none')).not.toBeNull();
    await saveAndClose(h.onClose);

    expect((await storedEntry(h))?.photoIds).toEqual([]);
    expect((await h.repos.savedMealsRepo.list()).map((meal) => meal.photoIds)).toEqual([
      ['photo-1'],
    ]);
    expect(await h.photoRepo.get('photo-1')).not.toBeNull();
  });
});

describe('EntryEditor: Reprocess', () => {
  const answer = makeDraft({
    name: 'Lentil soup with feta',
    kcal: 520,
    protein: 29,
    carbs: 60,
    fat: 18,
    nutrients: { sodium: 990 },
    basis: { kind: 'grams', grams: 450 },
    units: [],
    emoji: '🥣',
    note: 'Lentil soup, 1 bowl. Homemade, with feta',
  });

  it('turns Save into Reprocess while the note differs, and changes values only on Save', async () => {
    const reprocess = standInReprocess(answer);
    const h = await openEditor({ photos: 1, entry: soup({ photoIds: ['photo-1'] }), reprocess });
    const note = h.sheet.getByRole('textbox', { name: words.note.label });
    expect(primary()).toHaveTextContent(common.common.save);
    type(note, 'Homemade, with feta ');
    expect(primary()).toHaveTextContent(words.reprocess);

    await press(primary());
    await settle(() => hooked('review.kcal')?.textContent === '520');
    const request: ReprocessRequest = {
      name: 'Lentil soup',
      amount: expect.objectContaining({ count: 1, amount: 420 }) as ReprocessRequest['amount'],
      note: 'Homemade, with feta ',
      photoIds: ['photo-1'],
      progressive: false,
    };
    expect(reprocess.run).toHaveBeenCalledWith(request, expect.any(AbortSignal));
    expect(h.sheet.getByRole('textbox', { name: reviewWords.name })).toHaveValue(
      'Lentil soup with feta',
    );
    expect(primary()).toHaveTextContent(common.common.save);
    // Nothing was written by the reprocess.
    expect(await storedEntry(h)).toEqual(soup({ photoIds: ['photo-1'] }));

    await saveAndClose(h.onClose);
    const stored = await storedEntry(h);
    expect(stored).toMatchObject({
      name: 'Lentil soup with feta',
      kcal: 520,
      protein: 29,
      nutrients: { sodium: 990 },
      basis: { kind: 'grams', grams: 450 },
      emoji: '🥣',
      note: 'Homemade, with feta',
      loggedAt: MORNING,
      photoIds: ['photo-1'],
    });
    expect(stored?.chosenUnit).toBeUndefined();
  });

  it('turns the editor off while it runs, and sends a photo-less entry as text', async () => {
    const pending = deferred<ReprocessOutcome>();
    const reprocess = standInReprocess(pending.promise);
    const h = await openEditor({ reprocess });
    type(h.sheet.getByRole('textbox', { name: words.note.label }), 'Two bowls');

    await press(primary());
    expect(primary()).toHaveTextContent(words.reprocessing);
    expect(h.sheet.getByRole('textbox', { name: words.note.label })).toBeDisabled();
    expect(h.sheet.getByRole('textbox', { name: reviewWords.name })).toBeDisabled();
    expect(reprocess.run.mock.calls[0]?.[0].photoIds).toEqual([]);

    await act(async () => pending.resolve({ kind: 'draft', draft: answer }));
    await settle(() => hooked('review.kcal')?.textContent === '520');
    expect(h.sheet.getByRole('textbox', { name: words.note.label })).toBeEnabled();
  });

  it('ends a recipe split with the answer', async () => {
    const pot = soup({
      basis: { kind: 'grams', grams: 400 },
      units: [],
      chosenUnit: undefined,
      chosenCount: undefined,
      lines: [
        makeLine({ name: 'Lentils', grams: 300, kcal: 330 }),
        makeLine({ name: 'Broth', grams: 100, kcal: 80 }),
      ],
    });
    const h = await openEditor({ entry: pot, reprocess: standInReprocess(answer) });
    await untilShown('[data-ui="ingredients.split.increase"]');
    fireEvent.click(hooked('ingredients.split.increase') as HTMLElement);
    await until(() => hooked('ingredients.split')?.getAttribute('aria-valuenow') === '2');
    expect(h.sheet.getByRole('combobox', { name: reviewWords.serving.unit })).toHaveValue(
      'serving',
    );

    type(h.sheet.getByRole('textbox', { name: words.note.label }), 'Less broth');
    await press(primary());
    await settle(() => hooked('review.kcal')?.textContent === '520');
    expect(hooked('ingredients.split')).toBeNull();
    expect(hooked('review.unit')).toHaveTextContent(reviewWords.unit.g);
  });

  it('shows a failure under the note and changes nothing', async () => {
    const reprocess = standInReprocess(
      Promise.resolve({ kind: 'failed', messages: [{ key: 'ai.failure.keyRejected' }] }),
    );
    const h = await openEditor({ reprocess });
    type(h.sheet.getByRole('textbox', { name: words.note.label }), 'With feta');
    await press(primary());

    await settle(() => hooked('editor.problem') !== null);
    expect(hooked('editor.problem')).toHaveTextContent(aiWords.ai.failure.keyRejected);
    expect(hooked('review.kcal')).toHaveTextContent('410');
    expect(primary()).toHaveTextContent(words.reprocess);
    expect(h.onClose).not.toHaveBeenCalled();
  });
});

describe('EntryEditor: Saved and Delete', () => {
  it('asks before deleting, and deletes on Delete (ACC-D12-3)', async () => {
    const h = await openEditor();
    await press(h.sheet.getByRole('button', { name: words.delete.button }));
    const dialog = within(screen.getByRole('alertdialog', { name: words.delete.title }));
    await press(dialog.getByRole('button', { name: common.common.cancel }));
    expect(screen.queryByRole('alertdialog', { name: words.delete.title })).toBeNull();
    expect(await h.repos.diaryRepo.count()).toBe(1);

    await press(h.sheet.getByRole('button', { name: words.delete.button }));
    const again = within(screen.getByRole('alertdialog', { name: words.delete.title }));
    await press(again.getByRole('button', { name: common.common.delete }));
    await settle(() => h.onClose.mock.calls.length > 0);
    expect(await h.repos.diaryRepo.count()).toBe(0);
  });

  it('saves the entry to the saved meals at once with the switch, and takes it out again', async () => {
    const h = await openEditor();
    const toggle = () => h.sheet.getByRole('switch', { name: words.saved.label });
    await until(() => !toggle().hasAttribute('disabled'));
    expect(toggle()).toHaveAttribute('aria-checked', 'false');

    await press(toggle());
    await until(() => toggle().getAttribute('aria-checked') === 'true');
    expect((await h.repos.savedMealsRepo.list()).map((meal) => meal.originEntryId)).toEqual([
      'entry-soup',
    ]);

    await press(toggle());
    await until(() => toggle().getAttribute('aria-checked') === 'false');
    expect(await h.repos.savedMealsRepo.list()).toEqual([]);
    expect(h.onClose).not.toHaveBeenCalled();
  });
});

describe('the editor partition', () => {
  it('passes the catalogue lint merged with the other partitions', () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
    expect(Object.keys(mergePartitions(enPartitions))).toContain('editor');
  });
});
