/**
 * Home and Progress end to end (P07-17, Demo 4). Each test starts from an empty browser, walks the
 * wizard on its defaults with the AI set up later (the formula plan: 2,452 kcal and 112 g protein;
 * 70 kg as the first weigh-in, in kg, the only weight unit) and lands on Home on Tuesday 2026-10-27
 * at 08:30 UTC, in a week that starts on Monday. Home: water logged on days picked in the week
 * bar, the day swipe over the summary, the pillar picker, both sort orders, fasts from the + menu
 * and food paused while one runs. Progress: a back-dated weigh-in on the chart, a delete from the
 * history, and last week's recap seeded through the week bar. Nothing here asks the AI; every
 * request off loopback goes through the logging spec's routes, which abort any other host and
 * fail the test.
 */
import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import type { MealKind } from '../src/domain/model';
import { formatWeight } from '../src/domain/units/body';
import { formatDay, formatDuration, formatInt, formatPeriod } from '../src/i18n/format';
import {
  LOCALE,
  hooksSeen,
  recordHooks,
  routeFoodDatabases,
  ui,
  words,
  type FoodDatabaseLog,
} from './support';

test.use({ ...devices['Pixel 7'], locale: LOCALE, timezoneId: 'UTC', reducedMotion: 'reduce' });

/** 08:30 in the browser's zone (UTC) on a Tuesday: breakfast by the default meal times. */
const START = new Date('2026-10-27T08:30:00Z');
const TODAY = '2026-10-27';
const TOMORROW = '2026-10-28';
const YESTERDAY = '2026-10-26';
/** Last week, Monday to Sunday: the week the recap shows. */
const LAST_MONDAY = '2026-10-19';
const LAST_TUESDAY = '2026-10-20';
const LAST_WEDNESDAY = '2026-10-21';
const LAST_SUNDAY = '2026-10-25';

/** Longer than a row's long-press (500 ms in EntryRow.tsx), run on the page clock. */
const HOLD_MS = 1_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Sideways travel of a day swipe: well over the 80 px it needs (DaySwipe.tsx). */
const SWIPE_PX = 120;
/** A sideways drag too short to change the day. */
const SHORT_SWIPE_PX = 60;

/** The formula plan of the wizard's defaults. */
const PLAN = { kcal: 2_452, protein: 112 } as const;

/** The steps Continue walks through on their defaults, Sex to Reminders. */
const BODY_STEPS = [
  'sex',
  'birthday',
  'body',
  'bodyFat',
  'activity',
  'goal',
  'target',
  'pace',
  'reminders',
] as const;

let pageErrors: string[] = [];
let net: FoodDatabaseLog;

test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  net = await routeFoodDatabases(context);
  await page.clock.install({ time: START });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(net.strays).toEqual([]);
});

// ---- Words as the app writes them -------------------------------------------------------------

/** "2,300 kcal". */
function kcalText(kcal: number): string {
  return words('home.energy.kcal', { amount: formatInt(kcal, LOCALE) });
}

/** "72.4 kg": a weight with one decimal, as the cards and the history write it. */
function weightText(kg: number): string {
  return words('onboarding.wizard.weight.shownKg', { value: formatWeight(kg, 'kg', LOCALE) });
}

/** "250 ml". */
function mlText(ml: number): string {
  return words('home.amount.ml', { amount: formatInt(ml, LOCALE) });
}

/** "Oct 20, 2026". */
function mediumDay(day: string): string {
  return formatDay(day, 'medium', LOCALE);
}

/** "16h", "1h", "0m": a length given in minutes. */
function lengthText(minutes: number): string {
  return formatDuration(minutes, LOCALE);
}

// ---- Getting there ----------------------------------------------------------------------------

/** A fresh load → the wizard on its defaults, AI set up later → Home with nothing logged. */
async function onboard(page: Page): Promise<void> {
  await test.step('onboard on the defaults, the AI set up later', async () => {
    await page.goto('/');
    const wizard = ui(page, 'screen.onboarding');
    await ui(wizard, 'wizard.start').click();
    const next = ui(wizard, 'wizard.continue');
    for (const step of BODY_STEPS) {
      await expect(wizard).toHaveAttribute('data-step', step);
      await next.click();
    }
    await expect(wizard).toHaveAttribute('data-step', 'aiAccess');
    await wizard.getByRole('button', { name: words('aiSetup.access.later'), exact: true }).click();
    await expect(wizard).toHaveAttribute('data-step', 'planReady');
    await expect(ui(wizard, 'wizard.plan.kcal')).toContainText(formatInt(PLAN.kcal, LOCALE));
    await ui(wizard, 'wizard.plan.finish').click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(ui(page, 'home.diary.empty')).toBeVisible();
  });
}

type Tracker = 'water' | 'fasting';

const TRACKER_SWITCH = {
  water: 'trackers.water.settings.tracking',
  fasting: 'fasting.settings.tracking',
} as const;

/**
 * Settings › Tracking & reminders → the tracker's switch to `on` → up to the Settings list (the
 * tab keeps the page it was left on) → Home.
 */
async function switchTracker(page: Page, tracker: Tracker, on: boolean): Promise<void> {
  await test.step(`Settings › Tracking & reminders: ${tracker} ${on ? 'on' : 'off'}`, async () => {
    await ui(page, 'shell.tabbar.settings').click();
    await ui(page, 'settings.category.tracking').click();
    const screen = ui(page, 'screen.settings.tracking');
    const toggle = screen.getByRole('switch', { name: words(TRACKER_SWITCH[tracker]) });
    await expect(toggle).toHaveAttribute('data-ui', `${tracker}.tracking`);
    await expect(toggle).toHaveAttribute('aria-checked', String(!on));
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', String(on));
    await ui(screen, 'settings.back').click();
    await expect(ui(page, 'screen.settings')).toBeVisible();
    await ui(page, 'shell.tabbar.home').click();
    await expect(ui(page, 'home.add')).toBeVisible();
  });
}

/** The "+" menu, open. */
async function openAddMenu(page: Page): Promise<Locator> {
  await ui(page, 'home.add').click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

/** A row of the "+" menu's top page or of the page open, by its words and hook. */
async function menuItem(menu: Locator, name: string, hook: string): Promise<Locator> {
  const item = menu.getByRole('menuitem', { name, exact: true });
  await expect(item).toHaveAttribute('data-ui', hook);
  return item;
}

interface Food {
  readonly name: string;
  readonly kcal: number;
  readonly protein?: number;
  /** Picked in the sheet; otherwise the meal of the time. */
  readonly meal?: MealKind;
}

/** "+" → Describe → Enter manually → the food → Save, on the day Home shows. */
async function enterManually(page: Page, food: Food): Promise<void> {
  const menu = await openAddMenu(page);
  await (await menuItem(menu, words('menu.group.describe'), 'home.add.group.describe')).click();
  await (await menuItem(menu, words('menu.method.manual'), 'home.add.manual')).click();
  const sheet = page.getByRole('dialog', { name: words('log.manual.title') });
  await ui(sheet, 'manual.name').fill(food.name);
  await ui(sheet, 'manual.energy').fill(String(food.kcal));
  if (food.protein !== undefined) await ui(sheet, 'manual.protein').fill(String(food.protein));
  if (food.meal !== undefined) {
    await ui(sheet, 'manual.meal').click();
    await ui(page, `manual.mealPicker.${food.meal}`).click();
    await expect(ui(sheet, 'manual.meal')).toContainText(words(`log.meal.${food.meal}`));
  }
  await ui(sheet, 'manual.save').click();
  await expect(sheet).toBeHidden();
}

/** "+" → Start fast → Start on the default goal: the running fast's row shows. */
async function startFast(page: Page): Promise<void> {
  const menu = await openAddMenu(page);
  await (await menuItem(menu, words('menu.tracker.startFast'), 'home.add.startFast')).click();
  const sheet = page.getByRole('dialog', { name: words('fasting.start.title') });
  await expect(sheet).toHaveAttribute('data-ui', 'fast.start');
  await expect(
    sheet.getByRole('spinbutton', { name: words('fasting.start.goal') }),
  ).toHaveAttribute('aria-valuetext', words('fasting.hours', { hours: 16 }));
  await ui(sheet, 'fast.start.go').click();
  await expect(sheet).toBeHidden();
  await expect(ui(ui(page, 'home.diary'), 'fast.row')).toHaveAttribute('data-running', '');
}

// ---- What the screens show --------------------------------------------------------------------

/** A day of the week bar. */
function weekDay(page: Page, day: string): Locator {
  return ui(page, 'home.week').locator(`[data-day="${day}"]`);
}

/** Picks `day` in the week bar: it is the one checked, and the bar shows its week. */
async function pickDay(page: Page, day: string): Promise<void> {
  const tile = weekDay(page, day);
  await tile.click();
  await expect(tile).toHaveAttribute('aria-checked', 'true');
  await expect(tile).toBeInViewport();
}

/** The diary's heading: "Today" for today, "Diary" for another day. */
async function expectDiaryOf(page: Page, today: boolean): Promise<void> {
  const name = words(today ? 'home.diary.today' : 'home.diary.day');
  await expect(ui(page, 'home.diary').getByRole('heading', { name, exact: true })).toBeVisible();
}

/** The diary row of `name` at `kcal` under `meal`. */
function diaryRow(page: Page, meal: MealKind, name: string, kcal: number): Locator {
  return ui(ui(page, 'home.diary'), `home.meal.${meal}`).getByRole('group', {
    name: `${name} ${kcalText(kcal)}`,
    exact: true,
  });
}

/** The gauge has `kcal` eaten on the day shown. */
async function expectEaten(page: Page, kcal: number): Promise<void> {
  await expect(ui(page, 'home.gauge')).toHaveAccessibleDescription(
    new RegExp(`^${formatInt(kcal, LOCALE)} `),
  );
}

/** The `data-ui` hooks of `items`, in page order, are `hooks`. */
async function expectHooks(items: Locator, hooks: readonly string[]): Promise<void> {
  await expect
    .poll(() => items.evaluateAll((all) => all.map((item) => item.getAttribute('data-ui'))))
    .toEqual(hooks);
}

/** A badge or tile whose spans read `texts` in order. */
async function expectSpans(item: Locator, texts: readonly string[]): Promise<void> {
  await expect(item.locator(':scope > span')).toHaveText(texts);
}

// ---- Pointer gestures -------------------------------------------------------------------------

/** Presses the middle of `target`, moves `dx`, `dy` px in steps, and lets go. */
async function drag(page: Page, target: Locator, dx: number, dy = 0): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) throw new Error('The element to drag on is not on screen');
  // Centred on the travel, so both ends stay over the element.
  const x = box.x + box.width / 2 - dx / 2;
  const y = box.y + box.height / 2 - dy / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

/**
 * The box of `target` once it is scrolled to the middle of the screen, clear of the floating tab
 * bar and the "+" button over the bottom of the page.
 */
async function centredBox(
  target: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = await target.boundingBox();
  if (box === null) throw new Error('The element is not on screen');
  return box;
}

/** Drags a diary row from near its trailing edge to its leading edge, then lets go. */
async function swipeToDelete(page: Page, row: Locator): Promise<void> {
  const box = await centredBox(row);
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 4, y, { steps: 12 });
  await page.mouse.up();
}

/** Holds a press on `target` for longer than a long-press, on the page clock. */
async function longPress(page: Page, target: Locator): Promise<void> {
  const box = await centredBox(target);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(HOLD_MS);
  await page.mouse.up();
}

// ---- Home -------------------------------------------------------------------------------------

test.describe('Home: days, pillars and the diary (Demo 4)', () => {
  test('logs water on last Tuesday and on yesterday from the week bar, never on today (ACC-H3-2, ACC-H1-1, ACC-H4-1, ACC-F1-1, ACC-F1-2, ACC-F9-1, ACC-F11-1, R05.4, R05.9)', async ({
    page,
  }) => {
    await onboard(page);
    const diary = ui(page, 'home.diary');
    const waterPillar = ui(page, 'home.pillar.water');
    const waterRows = ui(diary, 'water.row');
    const toast = ui(page, 'toast.message');
    const waterLeft = (ml: number): string =>
      words('home.pillar.leftMl', { amount: formatInt(2_000 - ml, LOCALE) });
    const water = (ml: number): string => `${words('home.water.title')} ${mlText(ml)}`;

    await switchTracker(page, 'water', true);

    await test.step('the water pillar follows the four chosen ones, empty today', async () => {
      await expectHooks(ui(page, 'home.pillars').locator('[role="group"]'), [
        'home.pillar.protein',
        'home.pillar.carbs',
        'home.pillar.fat',
        'home.pillar.fibre',
        'home.pillar.water',
      ]);
      await expect(waterPillar).toHaveAccessibleName(words('home.pillar.water'));
      await expect(waterPillar).toHaveAccessibleDescription(`0 ${waterLeft(0)}`);
    });

    await test.step('tomorrow is drawn but cannot be picked; last Tuesday moves the bar to its week', async () => {
      await expect(weekDay(page, TOMORROW)).toBeDisabled();
      await expect(weekDay(page, TODAY)).toHaveAttribute('aria-current', 'date');
      await pickDay(page, LAST_TUESDAY);
      await expect(weekDay(page, TODAY)).not.toBeInViewport();
      await expectDiaryOf(page, false);
      await expect(ui(diary, 'home.diary.empty')).toBeVisible();
    });

    await test.step('"+" → Water → 250 ml logs at once on last Tuesday', async () => {
      const menu = await openAddMenu(page);
      await (await menuItem(menu, words('menu.tracker.water'), 'home.add.water')).click();
      const waterPage = menu.getByRole('group', { name: words('trackers.water.heading') });
      await expect(waterPage).toHaveAttribute('data-ui', 'water.menu');
      const glass = ui(waterPage, 'water.menu.amount.0');
      await expect(glass).toHaveText(mlText(250));
      await glass.click();
      await expect(menu).toBeHidden();
      await expect(toast).toHaveText(words('trackers.water.menu.logged', { amount: mlText(250) }));
      await expect(
        ui(diary, 'home.meal.breakfast').getByRole('group', { name: water(250), exact: true }),
      ).toBeVisible();
      await expect(waterPillar).toHaveAccessibleDescription(`250 ${waterLeft(250)}`);
      // Water is never food: the day's gauge stays at nothing eaten (R05.4).
      await expectEaten(page, 0);
    });

    await test.step('yesterday: "+" → Water → Custom amount → 330 ml', async () => {
      await pickDay(page, YESTERDAY);
      await expect(waterRows).toHaveCount(0);
      const menu = await openAddMenu(page);
      await (await menuItem(menu, words('menu.tracker.water'), 'home.add.water')).click();
      await ui(menu, 'water.menu.custom').click();
      await expect(menu).toBeHidden();
      const sheet = page.getByRole('dialog', { name: words('trackers.water.custom.title') });
      await expect(sheet).toHaveAttribute('data-ui', 'water.custom');
      await ui(sheet, 'water.custom.amount').fill('330');
      await ui(sheet, 'water.custom.add').click();
      await expect(sheet).toBeHidden();
      await expect(waterRows).toHaveCount(1);
      await expect(waterRows.getByRole('group')).toHaveAccessibleName(water(330));
      await expect(waterPillar).toHaveAccessibleDescription(`330 ${waterLeft(330)}`);
    });

    await test.step('today has no water; last Tuesday keeps only its own', async () => {
      await pickDay(page, TODAY);
      await expectDiaryOf(page, true);
      await expect(waterRows).toHaveCount(0);
      await expect(waterPillar).toHaveAccessibleDescription(`0 ${waterLeft(0)}`);
      await pickDay(page, LAST_TUESDAY);
      await expect(waterRows).toHaveCount(1);
      await expect(waterRows.getByRole('group')).toHaveAccessibleName(water(250));
    });

    await test.step("yesterday's row: a swipe asks first; Cancel keeps it, Delete removes it", async () => {
      await pickDay(page, YESTERDAY);
      const confirm = page.getByRole('alertdialog', { name: words('home.water.deleteTitle') });
      await swipeToDelete(page, waterRows);
      await expect(confirm).toHaveAttribute('data-ui', 'water.delete');
      await expect(confirm).toHaveAccessibleDescription(
        words('home.water.deleteMessage', { amount: mlText(330) }),
      );
      await ui(confirm, 'water.delete.cancel').click();
      await expect(confirm).toBeHidden();
      await expect(waterRows).toHaveCount(1);
      await swipeToDelete(page, waterRows);
      await ui(confirm, 'water.delete.confirm').click();
      await expect(confirm).toBeHidden();
      await expect(waterRows).toHaveCount(0);
      await expect(ui(diary, 'home.diary.empty')).toBeVisible();
    });

    await switchTracker(page, 'water', false);

    await test.step('water off: no pillar and no Water in "+", but the logged row stays (R05.9)', async () => {
      await pickDay(page, LAST_TUESDAY);
      await expect(waterRows).toHaveCount(1);
      await expect(waterPillar).toHaveCount(0);
      const menu = await openAddMenu(page);
      await expect(ui(menu, 'home.add.group.describe')).toBeVisible();
      await expect(ui(menu, 'home.add.water')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    });
  });

  test('swipes the summary to yesterday and back, never past today (ACC-F2-1)', async ({
    page,
  }) => {
    await onboard(page);
    const gauge = ui(page, 'home.gauge');
    // The swipe covers the summary: the gauge and the pillars, not the diary.
    await expect(ui(ui(page, 'home.swipe'), 'home.gauge')).toBeVisible();
    await expect(ui(ui(page, 'home.swipe'), 'home.diary')).toHaveCount(0);

    await enterManually(page, { name: 'Toast', kcal: 250 });
    await expect(diaryRow(page, 'breakfast', 'Toast', 250)).toBeVisible();
    await expectEaten(page, 250);

    await test.step('a drag of 120 px toward the right shows yesterday', async () => {
      await drag(page, gauge, SWIPE_PX);
      await expect(weekDay(page, YESTERDAY)).toHaveAttribute('aria-checked', 'true');
      await expectDiaryOf(page, false);
      await expect(ui(page, 'home.diary.empty')).toBeVisible();
      await expectEaten(page, 0);
    });

    await test.step('toward the left comes back to today', async () => {
      await drag(page, gauge, -SWIPE_PX);
      await expect(weekDay(page, TODAY)).toHaveAttribute('aria-checked', 'true');
      await expectDiaryOf(page, true);
      await expect(diaryRow(page, 'breakfast', 'Toast', 250)).toBeVisible();
      await expectEaten(page, 250);
    });

    await test.step('toward the left on today, or only 60 px, changes nothing', async () => {
      await drag(page, gauge, -SWIPE_PX);
      await drag(page, gauge, SHORT_SWIPE_PX);
      await expect(weekDay(page, TODAY)).toHaveAttribute('aria-checked', 'true');
      await expect(weekDay(page, YESTERDAY)).toHaveAttribute('aria-checked', 'false');
      await expectDiaryOf(page, true);
      await expectEaten(page, 250);
    });
  });

  test('chooses pillars from All nutrients: a fifth pick takes the latest place, and Done keeps it (ACC-F4-1, ACC-F5-1, ACC-F6-1)', async ({
    page,
  }) => {
    await onboard(page);
    const pillars = ui(page, 'home.pillars').locator('[role="group"]');
    const nutrients = page.getByRole('dialog', { name: words('home.nutrients.title') });
    const picker = page.getByRole('dialog', { name: words('home.picker.title') });
    const order = ui(picker, 'home.picker.order').locator('li');
    const option = (key: string): Locator => ui(picker, `home.picker.option.${key}`);

    await enterManually(page, { name: 'Lentil soup', kcal: 410, protein: 22 });

    await test.step('Home opens on protein, carbs, fat and fibre', async () => {
      await expectHooks(pillars, [
        'home.pillar.protein',
        'home.pillar.carbs',
        'home.pillar.fat',
        'home.pillar.fibre',
      ]);
      await expect(ui(page, 'home.pillar.protein')).toHaveAccessibleDescription(
        `22 ${words('home.pillar.left', { amount: formatInt(PLAN.protein - 22, LOCALE) })}`,
      );
    });

    await test.step("All nutrients lists today's amounts against their goals", async () => {
      await ui(page, 'home.allNutrients').click();
      await expect(nutrients).toHaveAttribute('data-ui', 'home.nutrients');
      await expect(ui(nutrients, 'home.nutrients.day')).toHaveText(words('home.nutrients.today'));
      const goal = (amount: string): string => words('home.nutrients.goal', { amount });
      await expect(ui(nutrients, 'home.nutrients.row.protein')).toHaveText(
        `${words('home.pillar.protein')} 22 g ${goal(`${PLAN.protein} g`)}`,
      );
      await expect(ui(nutrients, 'home.nutrients.row.sodium')).toHaveText(
        `${words('home.pillar.sodium')} ${words('home.nutrients.none')} ${goal('2,300 mg')}`,
      );
      // Monounsaturated fat is tracked but never has a goal.
      await expect(ui(nutrients, 'home.nutrients.row.monounsaturatedFat')).toHaveText(
        `${words('home.nutrients.monounsaturatedFat')} ${words('home.nutrients.none')}`,
      );
    });

    await test.step('the picker: sodium as a fifth pick takes the place of fibre; Cancel keeps the four', async () => {
      await ui(nutrients, 'home.nutrients.choose').click();
      await expect(picker).toHaveAttribute('data-ui', 'home.picker');
      await expectHooks(order, [
        'home.picker.order.protein',
        'home.picker.order.carbs',
        'home.picker.order.fat',
        'home.picker.order.fibre',
      ]);
      await option('sodium').check();
      await expectHooks(order, [
        'home.picker.order.protein',
        'home.picker.order.carbs',
        'home.picker.order.fat',
        'home.picker.order.sodium',
      ]);
      await expect(option('fibre')).not.toBeChecked();
      await ui(picker, 'home.picker.cancel').click();
      await expect(picker).toBeHidden();
      await expect(nutrients).toBeVisible();
      await ui(nutrients, 'home.nutrients.done').click();
      await expect(nutrients).toBeHidden();
      await expectHooks(pillars, [
        'home.pillar.protein',
        'home.pillar.carbs',
        'home.pillar.fat',
        'home.pillar.fibre',
      ]);
    });

    await test.step('protein, fat and sodium → Done: Home shows them in that order', async () => {
      await ui(page, 'home.allNutrients').click();
      await ui(nutrients, 'home.nutrients.choose').click();
      await option('sodium').check();
      await option('carbs').uncheck();
      await expectHooks(order, [
        'home.picker.order.protein',
        'home.picker.order.fat',
        'home.picker.order.sodium',
      ]);
      await ui(picker, 'home.picker.done').click();
      await expect(picker).toBeHidden();
      await expect(ui(nutrients, 'home.nutrients.choose')).toContainText(
        [words('home.pillar.protein'), words('home.pillar.fat'), words('home.pillar.sodium')].join(
          ', ',
        ),
      );
      await ui(nutrients, 'home.nutrients.done').click();
      const shown = ['home.pillar.protein', 'home.pillar.fat', 'home.pillar.sodium'];
      await expectHooks(pillars, shown);
      await expect(ui(page, 'home.pillar.sodium')).toHaveAccessibleDescription(
        `0 ${words('home.pillar.leftMg', { amount: '2,300' })}`,
      );
      await page.reload();
      await expect(ui(page, 'home.gauge')).toBeVisible();
      await expectHooks(pillars, shown);
    });
  });

  test('sorts the diary newest first, where breakfast comes back, and by meal again (ACC-F7-1, ACC-F7-2)', async ({
    page,
  }) => {
    await onboard(page);
    const diary = ui(page, 'home.diary');
    const sections = diary.locator('section[data-ui^="home.meal."]');

    await enterManually(page, { name: 'Toast', kcal: 250 });
    await enterManually(page, { name: 'Salad', kcal: 420, meal: 'lunch' });
    await enterManually(page, { name: 'Yoghurt', kcal: 150 });

    await test.step('by meal: one breakfast with both rows and its total, then lunch', async () => {
      await expectHooks(sections, ['home.meal.breakfast', 'home.meal.lunch']);
      await expect(ui(diary, 'home.meal.breakfast.totals')).toContainText(kcalText(400));
      await expect(ui(diary, 'home.meal.lunch.totals')).toContainText(kcalText(420));
      await expect(diaryRow(page, 'breakfast', 'Yoghurt', 150)).toBeVisible();
      await expect(diaryRow(page, 'breakfast', 'Toast', 250)).toBeVisible();
      // The Sort control sits in the first header only.
      await expect(ui(diary, 'home.sort')).toHaveCount(1);
      await expect(ui(sections.first(), 'home.sort')).toBeVisible();
    });

    await test.step('Sort → Newest first: breakfast, lunch, breakfast again', async () => {
      await ui(diary, 'home.sort').click();
      const newest = page.getByRole('menuitemradio', { name: words('home.sort.newestFirst') });
      await expect(newest).toHaveAttribute('data-ui', 'home.sort.newestFirst');
      await expect(newest).toHaveAttribute('aria-checked', 'false');
      await newest.click();
      await expectHooks(sections, [
        'home.meal.breakfast',
        'home.meal.lunch',
        'home.meal.breakfast',
      ]);
      await expect(sections.first().getByRole('group')).toHaveAccessibleName(
        `Yoghurt ${kcalText(150)}`,
      );
      await expect(sections.last().getByRole('group')).toHaveAccessibleName(
        `Toast ${kcalText(250)}`,
      );
    });

    await test.step('the order is kept after a reload; By meal joins breakfast again', async () => {
      await page.reload();
      await expectHooks(sections, [
        'home.meal.breakfast',
        'home.meal.lunch',
        'home.meal.breakfast',
      ]);
      await ui(diary, 'home.sort').click();
      const byMeal = page.getByRole('menuitemradio', { name: words('home.sort.byMeal') });
      await expect(byMeal).toHaveAttribute('data-ui', 'home.sort.byMeal');
      await byMeal.click();
      await expectHooks(sections, ['home.meal.breakfast', 'home.meal.lunch']);
    });
  });
});

// ---- Fasting ----------------------------------------------------------------------------------

test.describe('Fasting on Home (Demo 4)', () => {
  test('starts, cancels and ends fasts from the + menu, which holds only Fasting while one runs (ACC-H6-1, ACC-H7-1, ACC-F11-2, ACC-F8-2, R05.21)', async ({
    page,
  }) => {
    await onboard(page);
    const diary = ui(page, 'home.diary');
    const fastRow = ui(diary, 'fast.row');
    const elapsed = ui(fastRow, 'fast.row.elapsed');

    await test.step('without fasting on, "+" has no Start fast', async () => {
      const menu = await openAddMenu(page);
      await expect(ui(menu, 'home.add.startFast')).toHaveCount(0);
      await page.keyboard.press('Escape');
    });

    await switchTracker(page, 'fasting', true);

    await test.step('"+" → Start fast → Start on 16 hours: a running row', async () => {
      await startFast(page);
      await expect(fastRow).toContainText(words('home.fast.running'));
      await expect(elapsed).toHaveText(lengthText(0));
      await expect(fastRow).toContainText(words('home.fast.goal', { length: lengthText(960) }));
    });

    await test.step('while it runs, "+" holds only Fasting; Cancel fast leaves no row', async () => {
      const menu = await openAddMenu(page);
      await expect(menu.getByRole('menuitem')).toHaveText([words('menu.tracker.fasting')]);
      await (await menuItem(menu, words('menu.tracker.fasting'), 'home.add.fasting')).click();
      await (await menuItem(menu, words('menu.tracker.cancelFast'), 'home.add.cancelFast')).click();
      await expect(menu).toBeHidden();
      await expect(fastRow).toHaveCount(0);
      await expect(ui(diary, 'home.diary.empty')).toBeVisible();
    });

    await test.step('a new fast counts up: a minute, then an hour of page clock', async () => {
      await startFast(page);
      await expect(elapsed).toHaveText(lengthText(0));
      await page.clock.runFor(MINUTE_MS);
      await expect(elapsed).toHaveText(lengthText(1));
      await page.clock.fastForward(HOUR_MS - MINUTE_MS);
      await expect(elapsed).toHaveText(lengthText(60));
      await expect(ui(fastRow, 'fast.row.progress')).toHaveAttribute(
        'aria-valuetext',
        words('home.fast.progressValue', { elapsed: lengthText(60), goal: lengthText(960) }),
      );
    });

    await test.step('the running fast shows on today only', async () => {
      await pickDay(page, YESTERDAY);
      await expect(fastRow).toHaveCount(0);
      await pickDay(page, TODAY);
      await expect(fastRow).toHaveCount(1);
    });

    await test.step('"+" → Fasting → End fast: a finished 1h fast', async () => {
      const menu = await openAddMenu(page);
      await (await menuItem(menu, words('menu.tracker.fasting'), 'home.add.fasting')).click();
      await (await menuItem(menu, words('menu.tracker.endFast'), 'home.add.endFast')).click();
      await expect(menu).toBeHidden();
      await expect(fastRow).not.toHaveAttribute('data-running');
      await expect(fastRow).toContainText(words('home.fast.done', { length: lengthText(60) }));
      const again = await openAddMenu(page);
      await expect(ui(again, 'home.add.startFast')).toBeVisible();
      await expect(ui(again, 'home.add.group.describe')).toBeVisible();
      await page.keyboard.press('Escape');
    });

    await test.step('its delete button asks first; Delete removes it', async () => {
      await ui(fastRow, 'fast.row.delete').press('Enter');
      const confirm = page.getByRole('alertdialog', { name: words('home.fast.deleteTitle') });
      await expect(confirm).toHaveAttribute('data-ui', 'fast.delete');
      await expect(confirm).toHaveAccessibleDescription(
        words('home.fast.deleteMessage', { length: lengthText(60) }),
      );
      await ui(confirm, 'fast.delete.confirm').click();
      await expect(confirm).toBeHidden();
      await expect(fastRow).toHaveCount(0);
      await expect(ui(diary, 'home.diary.empty')).toBeVisible();
    });
  });

  test('pauses a combine during a fast; End fast and log ends it and combines (ACC-F12-1, R05.1, D-16.35)', async ({
    page,
  }) => {
    await onboard(page);
    const diary = ui(page, 'home.diary');
    const fastRow = ui(diary, 'fast.row');
    const bar = ui(page, 'home.selection');
    const paused = page.getByRole('alertdialog', { name: words('fasting.paused.title') });

    await enterManually(page, { name: 'Toast', kcal: 250 });
    await enterManually(page, { name: 'Coffee with milk', kcal: 60 });
    await switchTracker(page, 'fasting', true);
    await startFast(page);

    await test.step('a long-press picks Toast, a tap the coffee; Combine is paused', async () => {
      await longPress(
        page,
        page.getByRole('button', { name: words('home.entry.open', { name: 'Toast' }) }),
      );
      await expect(bar).toBeVisible();
      await page
        .getByRole('button', { name: words('home.entry.select', { name: 'Coffee with milk' }) })
        .click();
      await expect(ui(bar, 'home.selection.count')).toHaveText(
        words('home.selection.count', { count: 2 }),
      );
      await ui(bar, 'home.selection.combine').click();
      await expect(paused).toHaveAttribute('data-ui', 'fasting.paused');
      await expect(paused).toHaveAccessibleDescription(words('fasting.paused.message'));
    });

    await test.step('Cancel: the fast runs on, nothing is combined, both stay picked', async () => {
      await ui(paused, 'fasting.paused.cancel').click();
      await expect(paused).toBeHidden();
      await expect(fastRow).toHaveAttribute('data-running', '');
      await expect(ui(diary, 'entry.row')).toHaveCount(2);
      await expect(ui(bar, 'home.selection.count')).toHaveText(
        words('home.selection.count', { count: 2 }),
      );
    });

    await test.step('Combine again → End fast and log: one row, and the fast finished', async () => {
      await ui(bar, 'home.selection.combine').click();
      const endAndLog = ui(paused, 'fasting.paused.confirm');
      await expect(endAndLog).toHaveAccessibleName(words('fasting.paused.endAndLog'));
      await endAndLog.click();
      await expect(paused).toBeHidden();
      await expect(bar).toBeHidden();
      await expect(ui(diary, 'entry.row')).toHaveCount(1);
      await expect(diaryRow(page, 'breakfast', 'Toast + Coffee with milk', 310)).toBeVisible();
      await expectEaten(page, 310);
      await expect(fastRow).toHaveCount(1);
      await expect(fastRow).not.toHaveAttribute('data-running');
      const menu = await openAddMenu(page);
      await expect(ui(menu, 'home.add.startFast')).toBeVisible();
      await page.keyboard.press('Escape');
    });
  });

  test('pauses a manual entry when a fast starts in another tab; End fast and log does both (ACC-D27-1, R05.1, D-16.35)', async ({
    page,
    context,
  }) => {
    await onboard(page);
    await switchTracker(page, 'fasting', true);
    const sheet = page.getByRole('dialog', { name: words('log.manual.title') });
    const paused = page.getByRole('alertdialog', { name: words('fasting.paused.title') });
    const fastRow = ui(ui(page, 'home.diary'), 'fast.row');

    await test.step('this tab: "+" → Describe → Enter manually → porridge, 310 kcal, not saved yet', async () => {
      const menu = await openAddMenu(page);
      await (await menuItem(menu, words('menu.group.describe'), 'home.add.group.describe')).click();
      await (await menuItem(menu, words('menu.method.manual'), 'home.add.manual')).click();
      await ui(sheet, 'manual.name').fill('Porridge');
      await ui(sheet, 'manual.energy').fill('310');
    });

    await test.step('another tab starts a fast; two hours pass', async () => {
      const other = await context.newPage();
      other.on('pageerror', (error) => pageErrors.push(error.message));
      await other.goto('/');
      await expect(ui(other, 'home.add')).toBeVisible();
      await startFast(other);
      await other.close();
      await page.bringToFront();
      await page.clock.fastForward(2 * HOUR_MS);
    });

    await test.step('Save is paused; Cancel keeps the sheet and what was typed', async () => {
      await ui(sheet, 'manual.save').click();
      await expect(paused).toHaveAttribute('data-ui', 'fasting.paused');
      await ui(paused, 'fasting.paused.cancel').click();
      await expect(paused).toBeHidden();
      await expect(ui(sheet, 'manual.name')).toHaveValue('Porridge');
      await expect(ui(page, 'entry.row')).toHaveCount(0);
    });

    await test.step('Save → End fast and log: the porridge is logged and the fast ended', async () => {
      await ui(sheet, 'manual.save').click();
      await ui(paused, 'fasting.paused.confirm').click();
      await expect(paused).toBeHidden();
      await expect(sheet).toBeHidden();
      await expect(diaryRow(page, 'breakfast', 'Porridge', 310)).toBeVisible();
      await expectEaten(page, 310);
      await expect(fastRow).toHaveCount(1);
      await expect(fastRow).not.toHaveAttribute('data-running');
      await expect(fastRow).toContainText(words('home.fast.done', { length: lengthText(120) }));
    });
  });
});

// ---- Progress ---------------------------------------------------------------------------------

/** The Progress tab, read. */
async function openProgress(page: Page): Promise<void> {
  await ui(page, 'shell.tabbar.progress').click();
  await expect(ui(page, 'progress.weight')).toBeVisible();
}

/** The Log weight sheet, opened from the weight card. */
async function openLogWeight(page: Page): Promise<Locator> {
  await ui(page, 'progress.weight.log').click();
  const sheet = page.getByRole('dialog', { name: words('progress.logWeight.title') });
  await expect(sheet).toHaveAttribute('data-ui', 'progress.logWeight');
  return sheet;
}

/** The open Log weight sheet's wheels to `kg` and its date to `day`; Save. */
async function saveWeight(sheet: Locator, kg: number, day: string): Promise<void> {
  const whole = Math.floor(kg);
  const tenth = Math.round((kg - whole) * 10);
  await ui(sheet, 'progress.logWeight.wheel.whole').selectOption(String(whole));
  await ui(sheet, 'progress.logWeight.wheel.tenth').selectOption(String(tenth));
  await ui(sheet, 'progress.logWeight.date').fill(day);
  await expect(ui(sheet, 'progress.logWeight.date')).toHaveValue(day);
  await ui(sheet, 'progress.logWeight.save').click();
  await expect(sheet).toBeHidden();
}

/** The range control's choice, e.g. `month` for 1M. */
async function chooseRange(page: Page, range: 'week' | 'month'): Promise<void> {
  const choice = ui(page, `progress.range.${range}`);
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
}

test.describe('Progress (Demo 4)', () => {
  test("logs a weight for last Tuesday in kg and shows it on the 1M chart, keeping today's as Current (ACC-G4-1, ACC-G4-2, ACC-G3-1, R05.5, R05.11, R05.16)", async ({
    page,
  }) => {
    // Every appearance of the chart's tooltip is recorded, so "never shown" is real.
    await recordHooks(page, ['progress.weight.chart.tooltip']);
    await onboard(page);
    await openProgress(page);
    const card = ui(page, 'progress.weight');
    const chart = ui(card, 'progress.weight.chart');
    const dots = ui(chart, 'progress.weight.chart.plot').locator('[data-part="dot"]');
    const badge = (key: string): Locator => ui(card, `progress.weight.${key}`);

    await test.step("the wizard's weigh-in is today's, inside 1W, in kg though en-US", async () => {
      await expectSpans(badge('current'), [weightText(70), words('progress.weight.current')]);
      await expect(dots).toHaveCount(1);
    });

    await test.step('Log weight: the wheels open on 70.0 kg, with no unit toggle; a future day is held to today', async () => {
      const sheet = await openLogWeight(page);
      const whole = ui(sheet, 'progress.logWeight.wheel.whole');
      const tenth = ui(sheet, 'progress.logWeight.wheel.tenth');
      await expect(whole).toHaveValue('70');
      await expect(tenth).toHaveValue('0');
      await expect(sheet.getByRole('radiogroup')).toHaveCount(0);
      await expect(sheet).not.toContainText(/\blb\b/);
      const date = ui(sheet, 'progress.logWeight.date');
      await expect(date).toHaveValue(TODAY);
      await date.fill(TOMORROW);
      await expect(date).toHaveValue(TODAY);
      await saveWeight(sheet, 72.4, LAST_TUESDAY);
    });

    await test.step('1W still holds only today, Current 70.0 kg', async () => {
      await expectSpans(badge('current'), [weightText(70), words('progress.weight.current')]);
      await expect(dots).toHaveCount(1);
      await expectSpans(badge('change'), [weightText(0), words('progress.weight.change')]);
    });

    await test.step('1M: both weigh-ins on the chart, −2.4 kg net, 71.2 kg on average', async () => {
      await chooseRange(page, 'month');
      await expect(ui(page, 'progress.period.label')).toHaveText(
        formatPeriod('2026-09-28', TODAY, TODAY, LOCALE),
      );
      await expect(dots).toHaveCount(2);
      await expect(ui(chart, 'progress.weight.chart.table').locator('tbody tr')).toHaveText([
        `${mediumDay(LAST_TUESDAY)}${weightText(72.4)}`,
        `${mediumDay(TODAY)}${weightText(70)}`,
      ]);
      await expectSpans(badge('current'), [weightText(70), words('progress.weight.current')]);
      await expectSpans(badge('change'), [
        words('onboarding.wizard.weight.shownKg', { value: '-2.4' }),
        words('progress.weight.change'),
      ]);
      await expectSpans(badge('average'), [weightText(71.2), words('progress.weight.average')]);
    });

    await test.step('a vertical drag on the plot shows nothing; a sideways one inspects last Tuesday', async () => {
      const plot = ui(chart, 'progress.weight.chart.plot');
      const tooltip = ui(chart, 'progress.weight.chart.tooltip');
      const box = await centredBox(plot);
      const y = box.y + box.height / 3;
      await page.mouse.move(box.x + box.width * 0.3, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.3, y + 60, { steps: 8 });
      await page.mouse.up();
      expect(await hooksSeen(page)).toEqual([]);
      await page.mouse.move(box.x + box.width * 0.5, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.05, y, { steps: 10 });
      await expect(tooltip).toContainText(mediumDay(LAST_TUESDAY));
      await expect(tooltip).toContainText(weightText(72.4));
      expect(await hooksSeen(page)).toEqual(['progress.weight.chart.tooltip']);
      await page.mouse.up();
      await expect(tooltip).toHaveCount(0);
    });
  });

  test('deletes a weigh-in from the history only after confirming, and Current follows (ACC-G6-1, ACC-G7-1, R05.8, R05.22)', async ({
    page,
  }) => {
    await onboard(page);
    await openProgress(page);
    const logSheet = await openLogWeight(page);
    await saveWeight(logSheet, 72.4, LAST_TUESDAY);
    await chooseRange(page, 'month');
    const current = ui(page, 'progress.weight.current');
    const link = ui(page, 'progress.history');
    const sheet = page.getByRole('dialog', { name: words('progress.history.weight.title') });
    const deletes = ui(sheet, 'progress.history.delete');
    const deleteName = (kg: number, day: string): string =>
      words('progress.history.delete', { value: weightText(kg), date: mediumDay(day) });

    await test.step('the link counts two weigh-ins; the sheet lists them newest first', async () => {
      await expect(link).toHaveAccessibleName(words('progress.history.weight.title'));
      await expect(link).toHaveAccessibleDescription(
        words('progress.history.weight.count', { count: 2 }),
      );
      await link.click();
      await expect(sheet).toHaveAttribute('data-ui', 'progress.history.sheet');
      await expect(ui(sheet, 'progress.history.row')).toHaveCount(2);
      await expect(deletes.nth(0)).toHaveAccessibleName(deleteName(70, TODAY));
      await expect(deletes.nth(1)).toHaveAccessibleName(deleteName(72.4, LAST_TUESDAY));
    });

    const confirm = page.getByRole('alertdialog', {
      name: words('progress.history.weight.deleteTitle'),
    });

    await test.step("deleting today's asks first, naming it; Cancel keeps it", async () => {
      await deletes.nth(0).click();
      await expect(confirm).toHaveAttribute('data-ui', 'progress.history.confirm');
      await expect(confirm).toHaveAccessibleDescription(
        words('progress.history.deleteMessage', { value: weightText(70), date: mediumDay(TODAY) }),
      );
      await ui(confirm, 'progress.history.confirm.cancel').click();
      await expect(confirm).toBeHidden();
      await expect(ui(sheet, 'progress.history.row')).toHaveCount(2);
    });

    await test.step('Delete takes the row out at once; Current falls back to 72.4 kg', async () => {
      await deletes.nth(0).click();
      await ui(confirm, 'progress.history.confirm.confirm').click();
      await expect(confirm).toBeHidden();
      await expect(ui(sheet, 'progress.history.row')).toHaveCount(1);
      await expect(deletes).toHaveAccessibleName(deleteName(72.4, LAST_TUESDAY));
      await ui(sheet, 'progress.history.sheet.done').click();
      await expect(sheet).toBeHidden();
      await expectSpans(current, [weightText(72.4), words('progress.weight.current')]);
      await expect(link).toHaveAccessibleDescription(
        words('progress.history.weight.count', { count: 1 }),
      );
    });
  });

  test('recaps last week logged through the week bar in its tiles, and Count today moves the calorie average (ACC-G8-1, ACC-G8-2, ACC-G9-1, R05.17, R05.19)', async ({
    page,
  }) => {
    await onboard(page);
    // Near the goal is 2,452 kcal ± 10 % (2,207 to 2,697); the protein goal is 112 g.
    const lastWeek: readonly (Food & { readonly day: string })[] = [
      { day: LAST_MONDAY, name: 'Oats and eggs', kcal: 2_300, protein: 120 },
      { day: LAST_TUESDAY, name: 'Pasta', kcal: 1_500, protein: 60 },
      { day: LAST_WEDNESDAY, name: 'Chicken curry', kcal: 2_500, protein: 115 },
    ];

    await test.step('last Monday to Wednesday: a meal each, picked in the week bar', async () => {
      for (const food of lastWeek) {
        await pickDay(page, food.day);
        await enterManually(page, food);
        await expect(diaryRow(page, 'breakfast', food.name, food.kcal)).toBeVisible();
      }
    });

    await test.step('today: a meal of this week, which the recap leaves out', async () => {
      await pickDay(page, TODAY);
      await enterManually(page, { name: 'Omelette', kcal: 900, protein: 40 });
      await expectEaten(page, 900);
    });

    await openProgress(page);
    const recap = ui(page, 'progress.recap');
    const tile = (key: string): Locator => ui(recap, `progress.recap.${key}`);

    await test.step('the recap shows last week against the empty week before it', async () => {
      await expect(ui(recap, 'progress.recap.dates')).toHaveText(
        formatPeriod(LAST_MONDAY, LAST_SUNDAY, TODAY, LOCALE),
      );
      await expect(ui(recap, 'progress.recap.later')).toBeDisabled();
      const days = (count: number): string => words('progress.recap.days', { count, week: 7 });
      const up = (amount: number): string => words('progress.recap.change.up', { amount });
      await expectSpans(tile('logged'), [days(3), words('progress.recap.logged'), up(3)]);
      await expectSpans(tile('nearGoal'), [days(2), words('progress.recap.nearGoal.kcal'), up(2)]);
      await expectSpans(tile('protein'), [days(2), words('progress.recap.protein'), up(2)]);
      await expectSpans(tile('average'), [
        formatInt(2_100, LOCALE),
        words('progress.recap.average.kcal'),
        words('progress.recap.goal', { amount: formatInt(PLAN.kcal, LOCALE) }),
      ]);
      await expect(tile('logged').locator('[data-better]')).toHaveCount(1);
    });

    await test.step('three highlights, in their order; more logged days is the fourth and left out', async () => {
      await expect(ui(recap, 'progress.recap.highlights').locator('li')).toHaveText([
        words('progress.recap.highlight.run', { days: 3 }),
        words('progress.recap.highlight.moreNearGoal.kcal', { more: 2 }),
        words('progress.recap.highlight.moreProtein', { more: 2 }),
      ]);
    });

    await test.step('the week before has nothing; Later week comes back', async () => {
      await ui(recap, 'progress.recap.earlier').click();
      await expect(ui(recap, 'progress.recap.dates')).toHaveText(
        formatPeriod('2026-10-12', '2026-10-18', TODAY, LOCALE),
      );
      await expect(ui(recap, 'progress.recap.empty')).toHaveText(words('progress.recap.empty'));
      await ui(recap, 'progress.recap.later').click();
      await expect(tile('logged')).toBeVisible();
    });

    await test.step('1W calories: Avg 1,700 kcal with today; Count today off: Avg 2,000 kcal', async () => {
      const calories = ui(page, 'progress.calories');
      const average = ui(calories, 'progress.calories.average');
      const bars = ui(calories, 'progress.calories.chart.table').locator('tbody tr');
      // Last Wednesday's 2,500 and today's 900 fall in the window that ends today.
      await expect(average).toHaveText(
        words('progress.calories.average', { amount: kcalText(1_700) }),
      );
      await expect(bars).toHaveCount(2);
      const countToday = page.getByRole('switch', { name: words('progress.countToday.label') });
      await expect(countToday).toHaveAttribute('data-ui', 'progress.countToday');
      await countToday.click();
      await expect(countToday).toHaveAttribute('aria-checked', 'false');
      await expect(countToday).toHaveAccessibleDescription(
        words('progress.countToday.offWindow', {
          period: formatPeriod(LAST_TUESDAY, YESTERDAY, TODAY, LOCALE),
        }),
      );
      // The window ends yesterday: last Tuesday's 1,500 and Wednesday's 2,500.
      await expect(average).toHaveText(
        words('progress.calories.average', { amount: kcalText(2_000) }),
      );
      await expect(bars).toHaveCount(2);
    });
  });
});
