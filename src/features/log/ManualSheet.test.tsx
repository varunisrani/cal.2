import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../../domain/dates/dayKey';
import type { NutritionDraft } from '../../domain/model';
import { mergePartitions } from '../../i18n/catalogue';
import { enPartitions } from '../../i18n/en';
import { common } from '../../i18n/en/common';
import { fasting } from '../../i18n/en/fasting';
import { home } from '../../i18n/en/home';
import { log } from '../../i18n/en/log';
import { settings } from '../../i18n/en/settings';
import { lintCatalogue } from '../../i18n/lint';
import { fixedClock } from '../../lib/clock';
import type { DiaryService, LogContext, LogResult } from '../../services/diary';
import { FACTORY_NOW, makeEntry, makeFast } from '../../test/factories';
import {
  closeHarnesses,
  openHarness,
  untilShown,
  type HarnessOptions,
} from '../../test/screenHarness';
import { openFasting } from '../fasting/testing/openFasting';
import { settle } from '../water/testing/openWater';
import { ManualSheet, MEAL_PICKER_SHEET } from './ManualSheet';

afterEach(closeHarnesses);

const words = log.log.manual;
const TODAY: DayKey = '2026-10-26';
const LOGGED: LogResult = { kind: 'logged', entry: makeEntry() };

interface Setup {
  readonly unit?: 'kcal' | 'kJ';
  readonly dayKey?: DayKey;
  readonly logEntry?: DiaryService['logEntry'];
  readonly clock?: HarnessOptions['clock'];
}

/** The open sheet over a test database, with a diary service that records its calls. */
async function openSheet({ unit, dayKey = TODAY, logEntry, clock }: Setup = {}) {
  const diary = {
    logEntry: vi.fn<DiaryService['logEntry']>(logEntry ?? (async () => LOGGED)),
    deleteEntry: vi.fn<DiaryService['deleteEntry']>(),
  };
  const h = await openHarness({ diary, clock });
  if (unit) await h.repos.settingsRepo.set('units.energy', unit);
  const onClose = vi.fn();
  const view = h.mount(<ManualSheet open onClose={onClose} dayKey={dayKey} />);
  await untilShown('[data-ui="manual.name"]');
  const sheet = within(screen.getByRole('dialog', { name: words.title }));
  return { ...h, diary, onClose, sheet, unmount: view.unmount };
}

type Sheet = Awaited<ReturnType<typeof openSheet>>['sheet'];

/** Types into the fields named by their labels. */
function fill(sheet: Sheet, values: Readonly<Record<string, string>>) {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(sheet.getByLabelText(label), { target: { value } });
  }
}

const saveButton = (sheet: Sheet) => sheet.getByRole('button', { name: common.common.save });

async function save(sheet: Sheet) {
  await act(async () => {
    fireEvent.click(saveButton(sheet));
  });
}

/** The draft and context of the one logEntry call. */
function logged(diary: { logEntry: ReturnType<typeof vi.fn<DiaryService['logEntry']>> }) {
  expect(diary.logEntry).toHaveBeenCalledTimes(1);
  const [draft, ctx] = diary.logEntry.mock.calls[0] as [NutritionDraft, LogContext];
  return { draft, ctx };
}

describe('ManualSheet', () => {
  it('keeps Save off until there is a name and a whole energy', async () => {
    const { sheet } = await openSheet();
    expect(saveButton(sheet)).toBeDisabled();

    fill(sheet, { [words.name]: '   ', [words.energy.kcal]: '250' });
    expect(saveButton(sheet)).toBeDisabled();
    fill(sheet, { [words.name]: 'Toast', [words.energy.kcal]: '' });
    expect(saveButton(sheet)).toBeDisabled();
    fill(sheet, { [words.energy.kcal]: '250' });
    expect(saveButton(sheet)).toBeEnabled();
  });

  it('logs the trimmed name and energy at now, as a manual entry with no serving data or photo', async () => {
    const { sheet, diary, onClose } = await openSheet();
    fill(sheet, { [words.name]: '  Toast  ', [words.energy.kcal]: '250' });
    await save(sheet);

    expect(logged(diary)).toEqual({
      draft: {
        name: 'Toast',
        kcal: 250,
        protein: 0,
        carbs: 0,
        fat: 0,
        nutrients: {},
        extras: {},
        basis: { kind: 'servings', count: 1 },
        units: [],
        lines: [],
        progressive: false,
      },
      ctx: { loggedAt: FACTORY_NOW, meal: 'lunch', source: 'manual' },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('saves 2 093 kJ as 500 kcal (ACC-D2-2)', async () => {
    const { sheet, diary } = await openSheet({ unit: 'kJ' });
    const energy = sheet.getByLabelText(words.energy.kJ);
    expect(energy).toHaveAccessibleDescription(home.home.unit.kJ);
    expect(sheet.queryByLabelText(words.energy.kcal)).toBeNull();

    fill(sheet, { [words.name]: 'Pasta', [words.energy.kJ]: '2,093' });
    await save(sheet);
    expect(logged(diary).draft.kcal).toBe(500);
  });

  it('saves blank protein, carbs and fat as 0 and reads a decimal comma', async () => {
    const { sheet, diary } = await openSheet();
    fill(sheet, {
      [words.name]: 'Skyr',
      [words.energy.kcal]: '130',
      [words.protein]: '12,5',
    });
    await save(sheet);
    const { draft } = logged(diary);
    expect([draft.protein, draft.carbs, draft.fat]).toEqual([12.5, 0, 0]);
  });

  it.each([
    ['', {}],
    ['-1', {}],
    ['4.5', { fibre: 4.5 }],
    ['0', { fibre: 0 }],
  ])('saves fibre %j as %j (blank or negative is unknown)', async (typed, nutrients) => {
    const { sheet, diary } = await openSheet();
    fill(sheet, { [words.name]: 'Apple', [words.energy.kcal]: '95', [words.fibre]: typed });
    await save(sheet);
    expect(logged(diary).draft.nutrients).toEqual(nutrients);
  });

  it('refuses an energy that is not a whole number, and a macro that is not a number', async () => {
    const { sheet, diary } = await openSheet();
    fill(sheet, { [words.name]: 'Toast', [words.energy.kcal]: '250.5' });
    expect(sheet.getByLabelText(words.energy.kcal)).toHaveAccessibleDescription(
      `${home.home.unit.kcal} ${words.wholeNumber}`,
    );
    expect(saveButton(sheet)).toBeDisabled();

    fill(sheet, { [words.energy.kcal]: '250', [words.carbs]: 'lots' });
    expect(sheet.getByLabelText(words.carbs)).toBeInvalid();
    expect(saveButton(sheet)).toBeDisabled();
    fill(sheet, { [words.carbs]: '-3' });
    expect(saveButton(sheet)).toBeDisabled();
    fill(sheet, { [words.carbs]: '30' });
    expect(sheet.getByLabelText(words.carbs)).toBeValid();

    await save(sheet);
    expect(logged(diary).draft.carbs).toBe(30);
  });

  it('defaults the meal to lunch at 12:30 and to dinner at 19:00', async () => {
    const first = await openSheet();
    expect(
      first.sheet.getByRole('button', { name: `${words.meal} ${log.log.meal.lunch}` }),
    ).toBeVisible();
    first.unmount();

    const evening = fixedClock(Date.parse('2026-10-26T19:00:00-04:00'), 'America/New_York');
    const second = await openSheet({ clock: evening });
    fill(second.sheet, { [words.name]: 'Curry', [words.energy.kcal]: '700' });
    await save(second.sheet);
    expect(logged(second.diary).ctx.meal).toBe('dinner');
  });

  it('logs the meal picked from the list', async () => {
    const { sheet, diary, router } = await openSheet();
    fireEvent.click(sheet.getByRole('button', { name: `${words.meal} ${log.log.meal.lunch}` }));
    expect(router.current().sheets).toEqual([MEAL_PICKER_SHEET]);
    const picker = within(screen.getByRole('dialog', { name: words.mealPicker }));
    expect(picker.getAllByRole('option').map((option) => option.textContent)).toEqual([
      log.log.meal.breakfast,
      log.log.meal.lunch,
      log.log.meal.dinner,
      log.log.meal.snack,
      log.log.meal.other,
    ]);
    fireEvent.click(picker.getByRole('option', { name: log.log.meal.breakfast }));
    expect(router.current().sheets).toEqual([]);

    fill(sheet, { [words.name]: 'Eggs', [words.energy.kcal]: '180' });
    await save(sheet);
    expect(logged(diary).ctx.meal).toBe('breakfast');
  });

  it('logs on another day at the current clock time', async () => {
    const { sheet, diary } = await openSheet({ dayKey: '2026-10-24' });
    fill(sheet, { [words.name]: 'Toast', [words.energy.kcal]: '250' });
    await save(sheet);
    expect(logged(diary).ctx.loggedAt).toBe(Date.parse('2026-10-24T12:30:00-04:00'));
  });

  it('saves once for a double tap (R02.11)', async () => {
    let finish = (): void => undefined;
    const { sheet, diary } = await openSheet({
      logEntry: () =>
        new Promise<LogResult>((resolve) => {
          finish = () => resolve(LOGGED);
        }),
    });
    fill(sheet, { [words.name]: 'Toast', [words.energy.kcal]: '250' });
    const button = saveButton(sheet);

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.submit(sheet.getByLabelText(words.name).closest('form') as HTMLFormElement);
    await act(async () => finish());

    expect(diary.logEntry).toHaveBeenCalledTimes(1);
  });

  it('stays open behind the paused dialog while a fast is running; Cancel keeps what was typed', async () => {
    const { sheet, diary, onClose } = await openSheet({
      logEntry: async () => ({ kind: 'fastActive', fast: makeFast({ end: null }) }),
    });
    fill(sheet, { [words.name]: 'Toast', [words.energy.kcal]: '250' });
    await save(sheet);

    const paused = screen.getByRole('alertdialog', { name: fasting.fasting.paused.title });
    fireEvent.click(within(paused).getByRole('button', { name: common.common.cancel }));
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.getByLabelText(words.name)).toHaveValue('Toast');
    expect(saveButton(sheet)).not.toHaveAttribute('aria-busy');
    await save(sheet);
    expect(diary.logEntry).toHaveBeenCalledTimes(2);
  });

  it('ends the fast and stores the entry with End fast and log (ACC-D27-1, D-16.35)', async () => {
    const running = makeFast({ id: 'running', start: FACTORY_NOW - 10 * 3_600_000, end: null });
    const h = await openFasting({ on: true, fasts: [running] });
    const onClose = vi.fn();
    h.mount(<ManualSheet open onClose={onClose} dayKey={TODAY} />);
    await untilShown('[data-ui="manual.name"]');
    const sheet = within(screen.getByRole('dialog', { name: words.title }));
    fill(sheet, { [words.name]: 'Toast', [words.energy.kcal]: '250' });
    await save(sheet);
    await settle(() => document.querySelector('[data-ui="fasting.paused"]') !== null);
    expect(await h.db.entries.count()).toBe(0);

    const paused = screen.getByRole('alertdialog', { name: fasting.fasting.paused.title });
    fireEvent.click(within(paused).getByRole('button', { name: fasting.fasting.paused.endAndLog }));

    await settle(() => onClose.mock.calls.length > 0);
    expect(await h.storedFasts()).toEqual([{ ...running, end: FACTORY_NOW }]);
    const stored = await h.repos.diaryRepo.byDay(TODAY);
    expect(stored.map((entry) => [entry.name, entry.kcal, entry.source])).toEqual([
      ['Toast', 250, 'manual'],
    ]);
  });

  it('stays open and says so when the save fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sheet, onClose } = await openSheet({
      logEntry: async () => {
        throw new Error('disk');
      },
    });
    fill(sheet, { [words.name]: 'Toast', [words.energy.kcal]: '250' });
    await save(sheet);

    expect(screen.getByRole('status')).toHaveTextContent(words.failed);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.getByLabelText(words.name)).toHaveValue('Toast');
  });

  it('closes only through Cancel or Save: Escape and the scrim do nothing', async () => {
    const { sheet, diary, onClose } = await openSheet();
    fill(sheet, { [words.name]: 'Toast' });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(document.querySelector('[data-ui="manual.scrim"]') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(sheet.getByRole('button', { name: common.common.cancel }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(diary.logEntry).not.toHaveBeenCalled();
  });

  it('opens with the name field focused and every control hooked for tests', async () => {
    const { sheet } = await openSheet();
    expect(sheet.getByLabelText(words.name)).toHaveFocus();
    for (const hook of [
      'manual.name',
      'manual.energy',
      'manual.protein',
      'manual.carbs',
      'manual.fat',
      'manual.fibre',
      'manual.meal',
      'manual.save',
      'manual.cancel',
    ]) {
      expect(document.querySelector(`[data-ui="${hook}"]`)).not.toBeNull();
    }
  });
});

describe('the home, log and settings partitions', () => {
  it('pass the catalogue lint merged with the other partitions', () => {
    expect(lintCatalogue({ ...enPartitions, home, log, settings })).toEqual([]);
    expect(Object.keys(mergePartitions({ ...enPartitions, home, log, settings }))).toEqual(
      expect.arrayContaining(['home', 'log', 'settings']),
    );
  });
});
