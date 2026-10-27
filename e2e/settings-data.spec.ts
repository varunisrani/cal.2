/**
 * Settings, data and offline end to end (P09-19, Demo 6). Each test starts from an empty browser,
 * walks the wizard on its defaults (with the AI as the Custom provider at the fake's loopback
 * address where the test needs the AI, else "set up later") and lands on Home on Tuesday
 * 2026-10-27 at 08:30 UTC. Then: the accent and the units; a CSV export of this week; an import of
 * our own diary file with Replace; a backup, Erase everything and a restore from Welcome; the
 * notification switch when the browser says no; the FoodData Central key on the wire. The last
 * test needs the service worker that every other project blocks: it runs in the
 * `offline-chromium` project (playwright.config.ts), reloads with the network off and asks the AI
 * offline. As in the logging spec, every request off loopback is routed; any other host is
 * aborted and fails the test.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  devices,
  expect,
  test,
  type Download,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import type { MealKind } from '../src/domain/model';
import { formatWeight, type WeightDisplayUnit } from '../src/domain/units/body';
import { formatEnergy, type EnergyDisplayUnit } from '../src/domain/units/energy';
import { formatDay, formatInt, formatPeriod } from '../src/i18n/format';
import {
  FAKE_AI_BASE_URL,
  GRAIN_BOWL,
  LOCALE,
  MEAL_PHOTO,
  OFF_MISSING_CODE,
  fakeAi,
  foodScript,
  notificationRequests,
  refuseNotifications,
  routeFoodDatabases,
  textScript,
  ui,
  words,
  type FoodDatabaseLog,
} from './support';

test.use({ ...devices['Pixel 7'], locale: LOCALE, timezoneId: 'UTC', reducedMotion: 'reduce' });

/** 08:30 UTC on a Tuesday: breakfast by the default meal times; the week started on Monday. */
const START = new Date('2026-10-27T08:30:00Z');
const TODAY = '2026-10-27';
const YESTERDAY = '2026-10-26';
const MONDAY = '2026-10-26';

/** The model id typed for the Custom provider; the fake answers whatever it is asked for. */
const MODEL = 'platewise-e2e';

/** Our own diary file: today only, the grain bowl at 08:15 and a lentil salad at lunch. */
const DIARY_IMPORT = fileURLToPath(new URL('./fixtures/diary-import.json', import.meta.url));

/** The wizard's steps that Continue walks through on their defaults, Sex to Reminders. */
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
  // The fake outlives tests: nothing scripted or recorded carries over.
  await fakeAi.reset();
  net = await routeFoodDatabases(context);
  await page.clock.install({ time: START });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(net.strays).toEqual([]);
});

// ---- Words as the app writes them -------------------------------------------------------------

/** "250 kcal", "1,046 kJ": a kcal amount as Home writes it in `unit`. */
function energyText(kcal: number, unit: EnergyDisplayUnit = 'kcal'): string {
  const amount = formatEnergy(kcal, unit, LOCALE);
  return words(unit === 'kJ' ? 'home.energy.kJ' : 'home.energy.kcal', { amount });
}

/** "70.0 kg", "154.3 lb": a weight with one decimal, as Progress writes it. */
function weightText(kg: number, unit: WeightDisplayUnit): string {
  const value = formatWeight(kg, unit, LOCALE);
  return words(`onboarding.wizard.weight.${unit === 'kg' ? 'shownKg' : 'shownLb'}`, { value });
}

// ---- Getting there ----------------------------------------------------------------------------

/**
 * A fresh load → the wizard on its defaults → Home with nothing logged. With `ai`, the AI is the
 * Custom provider at the fake (`plan-ok` answers the plan); without, it is set up later.
 */
async function onboard(page: Page, { ai }: { readonly ai: boolean }): Promise<void> {
  await test.step(`onboard ${ai ? 'with the AI at loopback' : 'with the AI set up later'}`, async () => {
    if (ai) await fakeAi.useScript('plan-ok');
    await page.goto('/');
    const wizard = ui(page, 'screen.onboarding');
    await ui(wizard, 'wizard.start').click();
    const next = ui(wizard, 'wizard.continue');
    for (const step of BODY_STEPS) {
      await expect(wizard).toHaveAttribute('data-step', step);
      await next.click();
    }
    await expect(wizard).toHaveAttribute('data-step', 'aiAccess');
    if (ai) {
      await wizard
        .getByRole('combobox', { name: words('aiSetup.provider.label') })
        .selectOption('custom');
      await wizard
        .getByRole('textbox', { name: words('aiSetup.server.label') })
        .fill(FAKE_AI_BASE_URL);
      await wizard.getByRole('checkbox', { name: words('aiSetup.access.terms.accept') }).check();
      await wizard
        .getByRole('textbox', { name: words('aiSetup.model.label'), exact: true })
        .fill(MODEL);
      await next.click();
    } else {
      await wizard
        .getByRole('button', { name: words('aiSetup.access.later'), exact: true })
        .click();
    }
    await expect(wizard).toHaveAttribute('data-step', 'planReady');
    await ui(wizard, 'wizard.plan.finish').click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(ui(page, 'home.diary.empty')).toBeVisible();
  });
}

/** Settings tab → the hub → a category's page. */
async function openSettings(page: Page, category: string): Promise<Locator> {
  await ui(page, 'shell.tabbar.settings').click();
  await expect(ui(page, 'screen.settings')).toBeVisible();
  await ui(page, `settings.category.${category}`).click();
  const screen = ui(page, `screen.settings.${category}`);
  await expect(screen).toBeVisible();
  return screen;
}

/** Back to the hub (so the tab opens there next time), then Home. */
async function leaveSettings(page: Page, screen: Locator): Promise<void> {
  await ui(screen, 'settings.back').click();
  await expect(ui(page, 'screen.settings')).toBeVisible();
  await ui(page, 'shell.tabbar.home').click();
  await expect(ui(page, 'home.add')).toBeVisible();
}

type Group = 'snapScan' | 'describe';
type Method = 'camera' | 'barcode' | 'describe' | 'manual';

/** "+" → a group's page of the add menu → one of its methods. */
async function choose(page: Page, group: Group, method: Method): Promise<void> {
  await ui(page, 'home.add').click();
  const groupItem = page.getByRole('menuitem', { name: words(`menu.group.${group}`) });
  await expect(groupItem).toHaveAttribute('data-ui', `home.add.group.${group}`);
  await groupItem.click();
  const item = page.getByRole('menuitem', { name: words(`menu.method.${method}`) });
  await expect(item).toHaveAttribute('data-ui', `home.add.${method}`);
  await item.click();
}

/** "+" → Describe → Enter manually → a name and its kcal → Save, on the day Home shows. */
async function enterManually(page: Page, name: string, kcal: number): Promise<void> {
  await choose(page, 'describe', 'manual');
  const sheet = page.getByRole('dialog', { name: words('log.manual.title') });
  await ui(sheet, 'manual.name').fill(name);
  await ui(sheet, 'manual.energy').fill(String(kcal));
  await ui(sheet, 'manual.save').click();
  await expect(sheet).toBeHidden();
}

/**
 * "+" → Snap & scan → Camera → our photo → Analyse → the review of the fake's grain bowl, logged
 * at `time` today (picked in the review, so the minute does not follow the test's pace).
 */
async function logGrainBowl(page: Page, time: string): Promise<void> {
  await test.step(`a meal photo analysed and logged at ${time}`, async () => {
    await fakeAi.useReplies(foodScript(GRAIN_BOWL));
    await choose(page, 'snapScan', 'camera');
    const capture = page.getByRole('dialog', { name: words('capture.title') });
    const chooser = page.waitForEvent('filechooser');
    await capture.getByRole('button', { name: words('capture.addPhoto') }).click();
    await (await chooser).setFiles(MEAL_PHOTO);
    await expect(ui(capture, 'capture.card')).toHaveCount(1);
    await capture.getByRole('button', { name: words('capture.analyse') }).click();
    const review = page.getByRole('dialog', { name: words('review.title') });
    await expect(ui(review, 'review.name')).toHaveValue(GRAIN_BOWL.name);
    await expect(ui(review, 'review.photo.1')).toBeVisible();
    await ui(review, 'review.when.time').fill(time);
    await expect(ui(review, 'review.when.time')).toHaveValue(time);
    await ui(review, 'review.log').click();
    await expect(review).toBeHidden();
  });
}

// ---- What the screens show --------------------------------------------------------------------

/** The diary row of `name` at `energy` under `meal`. */
function diaryRow(page: Page, meal: MealKind, name: string, energy: string): Locator {
  return ui(ui(page, 'home.diary'), `home.meal.${meal}`).getByRole('group', {
    name: `${name} ${energy}`,
    exact: true,
  });
}

/** Picks `day` in the week bar. */
async function pickDay(page: Page, day: string): Promise<void> {
  const tile = ui(page, 'home.week').locator(`[data-day="${day}"]`);
  await tile.click();
  await expect(tile).toHaveAttribute('aria-checked', 'true');
}

/** One choice of a radio group (a segmented control or the accents), by its words and hook. */
function choice(group: Locator, name: string): Locator {
  return group.getByRole('radio', { name, exact: true });
}

/** The entry's editor shows its first photo, decoded from the stored bytes. */
async function expectPhotoShown(editor: Locator): Promise<void> {
  const photo = ui(editor, 'review.photo.1').locator('img');
  await expect(photo).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
}

/** Progress's current weight and Personal info's height read `weight` and `height`; then Home. */
async function expectBody(page: Page, weight: string, height: string): Promise<void> {
  await ui(page, 'shell.tabbar.progress').click();
  const current = ui(ui(page, 'progress.weight'), 'progress.weight.current');
  await expect(current.locator(':scope > span')).toHaveText([
    weight,
    words('progress.weight.current'),
  ]);
  const profile = await openSettings(page, 'profile');
  await expect(ui(profile, 'profile.height')).toHaveAccessibleName(
    words('profile.rowName', { name: words('profile.rows.height'), value: height }),
  );
  await leaveSettings(page, profile);
}

/** Opens the entry editor of `name` from its row. */
async function openEntry(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: words('home.entry.open', { name }) }).click();
  const editor = page.getByRole('dialog', { name: words('editor.title') });
  await expect(editor).toHaveAttribute('data-ui', 'editor');
  return editor;
}

// ---- Files that leave the app -----------------------------------------------------------------

/**
 * Presses `button` and waits for the file the app hands over. Headless Chromium has no Web Share,
 * so the app downloads it; a browser that shared it instead would fail this wait.
 */
async function downloadFrom(page: Page, button: Locator): Promise<Download> {
  const download = page.waitForEvent('download');
  await button.click();
  return download;
}

/** Saves a download under its own name in the test's output folder, for a later pick. */
async function keep(download: Download, testInfo: TestInfo): Promise<string> {
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  return path;
}

/** The fields of an RFC 4180 CSV text, line by line (quoted fields may hold commas and quotes). */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[at + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      at += 1;
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) rows.push([...row, field]);
  return rows;
}

// ---- The flows --------------------------------------------------------------------------------

test.describe('settings and data (Demo 6)', () => {
  test('changes the accent and the units: the page and Home follow at once, a reload keeps them, and no stored value changes (ACC-A9-1, ACC-C12-1, D-16.1)', async ({
    page,
  }) => {
    await onboard(page, { ai: false });
    const html = page.locator('html');
    await enterManually(page, 'Toast', 250);
    await expect(diaryRow(page, 'breakfast', 'Toast', energyText(250))).toBeVisible();

    await test.step("en-US units: the wizard's 70 kg reads 154.3 lb and its 175 cm 5 ft 9 in", async () => {
      await expectBody(
        page,
        weightText(70, 'lb'),
        words('profile.value.ftIn', { feet: 5, inches: 9 }),
      );
    });

    await test.step('Settings › App settings: Ember is drawn at once', async () => {
      const screen = await openSettings(page, 'app');
      await expect(html).toHaveAttribute('data-accent', 'basil');
      const accents = ui(screen, 'appSettings.accent');
      const ember = choice(accents, words('appearance.accent.ember'));
      await expect(ember).toHaveAttribute('data-ui', 'appSettings.accent.ember');
      await expect(choice(accents, words('appearance.accent.basil'))).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await ember.click();
      await expect(ember).toHaveAttribute('aria-checked', 'true');
      await expect(html).toHaveAttribute('data-accent', 'ember');
    });

    await test.step('Units: kJ, kg and cm in place of the en-US kcal, lb and ft-in', async () => {
      const screen = ui(page, 'screen.settings.app');
      const picks = [
        ['energy', words('home.unit.kcal'), words('home.unit.kJ'), 'kJ'],
        ['weight', words('profile.units.lb'), words('profile.units.kg'), 'kg'],
        ['height', words('profile.units.ftIn'), words('profile.units.cm'), 'cm'],
      ] as const;
      for (const [setting, before, after, value] of picks) {
        const group = ui(screen, `appSettings.units.${setting}`);
        await expect(choice(group, before)).toHaveAttribute('aria-checked', 'true');
        const pick = choice(group, after);
        await expect(pick).toHaveAttribute('data-ui', `appSettings.units.${setting}.${value}`);
        await pick.click();
        await expect(pick).toHaveAttribute('aria-checked', 'true');
      }
      await leaveSettings(page, screen);
    });

    await test.step('Home writes the 250 kcal toast as 1,046 kJ, under a kJ gauge', async () => {
      await expect(diaryRow(page, 'breakfast', 'Toast', energyText(250, 'kJ'))).toBeVisible();
      await expect(ui(page, 'home.gauge')).toContainText(words('home.gauge.heading.kJ'));
    });

    await test.step('the same weight and height read 70.0 kg and 175 cm: nothing was converted', async () => {
      await expectBody(page, weightText(70, 'kg'), words('profile.value.cm', { value: '175' }));
    });

    await test.step('a reload keeps the accent and every unit', async () => {
      await page.reload();
      await expect(diaryRow(page, 'breakfast', 'Toast', energyText(250, 'kJ'))).toBeVisible();
      await expect(html).toHaveAttribute('data-accent', 'ember');
      const screen = await openSettings(page, 'app');
      await expect(
        choice(ui(screen, 'appSettings.accent'), words('appearance.accent.ember')),
      ).toHaveAttribute('aria-checked', 'true');
      for (const [setting, name] of [
        ['energy', words('home.unit.kJ')],
        ['weight', words('profile.units.kg')],
        ['height', words('profile.units.cm')],
      ] as const) {
        await expect(choice(ui(screen, `appSettings.units.${setting}`), name)).toHaveAttribute(
          'aria-checked',
          'true',
        );
      }
    });

    await test.step('back to kcal: the toast reads 250 kcal again, as it was stored', async () => {
      const screen = ui(page, 'screen.settings.app');
      await choice(ui(screen, 'appSettings.units.energy'), words('home.unit.kcal')).click();
      await leaveSettings(page, screen);
      await expect(diaryRow(page, 'breakfast', 'Toast', energyText(250))).toBeVisible();
    });
  });

  test('exports this week as CSV with its header, the food row and the water rows (ACC-K1-1)', async ({
    page,
  }) => {
    await onboard(page, { ai: false });
    const name = 'Toast, butter and "jam"';

    await test.step('water on; a 250 ml glass and a food whose name needs quoting', async () => {
      const tracking = await openSettings(page, 'tracking');
      const tracked = tracking.getByRole('switch', {
        name: words('trackers.water.settings.tracking'),
      });
      await expect(tracked).toHaveAttribute('data-ui', 'water.tracking');
      await tracked.click();
      await expect(tracked).toHaveAttribute('aria-checked', 'true');
      await leaveSettings(page, tracking);
      await ui(page, 'home.add').click();
      const menu = page.getByRole('menu');
      const water = menu.getByRole('menuitem', { name: words('menu.tracker.water'), exact: true });
      await expect(water).toHaveAttribute('data-ui', 'home.add.water');
      await water.click();
      await ui(menu, 'water.menu.amount.0').click();
      await expect(ui(ui(page, 'home.diary'), 'water.row')).toHaveCount(1);
      await enterManually(page, name, 250);
      await expect(diaryRow(page, 'breakfast', name, energyText(250))).toBeVisible();
    });
    const at = (await ui(page, 'entry.row').locator('time').getAttribute('datetime')) ?? '';
    const waterAt =
      (await ui(page, 'water.row').locator('time').first().getAttribute('datetime')) ?? '';

    const file = await test.step('Your data › Export › This week › CSV → a download', async () => {
      const data = await openSettings(page, 'data');
      await ui(data, 'data.export').click();
      const sheet = page.getByRole('dialog', { name: words('transfer.export.title') });
      await expect(sheet).toHaveAttribute('data-ui', 'exportDiary');
      await expect(
        sheet.getByRole('radio', { name: words('transfer.export.range.week') }),
      ).toBeChecked();
      await ui(sheet, 'exportDiary.format.csv').click();
      await expect(
        sheet.getByRole('radio', { name: words('transfer.export.format.csv') }),
      ).toBeChecked();
      const download = await downloadFrom(page, ui(sheet, 'exportDiary.export'));
      await expect(sheet).toBeHidden();
      await expect(ui(page, 'toast.region')).toContainText(words('transfer.export.downloaded'));
      return download;
    });

    await test.step("the file is this week's, Monday to today, named so", async () => {
      expect(file.suggestedFilename()).toBe(`platewise-diary-${MONDAY}_to_${TODAY}.csv`);
    });

    await test.step('one header naming every column, energy in kcal', async () => {
      const rows = csvRows(readFileSync(await file.path(), 'utf8'));
      const header = rows[0] ?? [];
      expect(header.slice(0, 10)).toEqual([
        'date',
        'time',
        'kind',
        'meal',
        'name',
        'grams',
        'energy_kcal',
        'protein_g',
        'carbs_g',
        'fat_g',
      ]);
      expect(header.slice(-5)).toEqual(['source', 'note', 'parts', 'water_ml', 'day_water_ml']);
      expect(header).toContain('fibre_g');
      expect(header).toContain('sodium_mg');
      for (const row of rows) expect(row).toHaveLength(header.length);

      const field = (row: readonly string[], column: string): string | undefined =>
        row[header.indexOf(column)];
      const kinds = rows.slice(1).map((row) => field(row, 'kind'));
      expect(kinds).toEqual(['food', 'water', 'day_water']);
      const [food, water, total] = rows.slice(1);

      // The name came back whole through its quotes; the time is the row's own.
      expect(field(food!, 'date')).toBe(TODAY);
      expect(field(food!, 'time')).toBe(at.slice(11, 16));
      expect(field(food!, 'meal')).toBe('breakfast');
      expect(field(food!, 'name')).toBe(name);
      expect(field(food!, 'energy_kcal')).toBe('250');
      expect(field(food!, 'source')).toBe('manual');
      expect(field(water!, 'date')).toBe(TODAY);
      expect(field(water!, 'time')).toBe(waterAt.slice(11, 16));
      expect(field(water!, 'water_ml')).toBe('250');
      expect(field(total!, 'day_water_ml')).toBe('250');
    });
  });

  test("imports our diary file with Replace: the matched entry keeps its photo and takes the file's values (ACC-K2-2, R06.16)", async ({
    page,
  }) => {
    await onboard(page, { ai: true });
    const bowl = GRAIN_BOWL.name;
    const salad = 'Lentil salad with feta';

    await test.step('yesterday: a porridge, outside the dates of the file', async () => {
      await pickDay(page, YESTERDAY);
      await enterManually(page, 'Porridge with berries', 310);
      await pickDay(page, TODAY);
    });

    await logGrainBowl(page, '08:15');
    await enterManually(page, 'Black coffee', 5);
    await expect(diaryRow(page, 'breakfast', bowl, energyText(520))).toBeVisible();
    await expect(ui(ui(page, 'home.diary'), 'entry.row')).toHaveCount(2);

    await test.step('Your data › Import › our file: two foods, no water, today', async () => {
      const data = await openSettings(page, 'data');
      await ui(data, 'data.import').click();
      const sheet = page.getByRole('dialog', { name: words('transfer.import.title') });
      await expect(sheet).toHaveAttribute('data-ui', 'importDiary');
      const chooser = page.waitForEvent('filechooser');
      await ui(sheet, 'importDiary.choose').click();
      await (await chooser).setFiles(DIARY_IMPORT);
      await expect(ui(sheet, 'importDiary.foods')).toHaveText(formatInt(2, LOCALE));
      await expect(ui(sheet, 'importDiary.water')).toHaveText(formatInt(0, LOCALE));
      await expect(ui(sheet, 'importDiary.days')).toHaveText(
        formatPeriod(TODAY, TODAY, TODAY, LOCALE),
      );
      await ui(sheet, 'importDiary.replace').click();
      await expect(sheet).toBeHidden();
      await expect(ui(page, 'toast.region')).toContainText(
        words('transfer.import.done', { foods: 2, water: 0 }),
      );
      await leaveSettings(page, data);
    });

    await test.step("today follows the file: the bowl at the file's 480 kcal, the salad, no coffee", async () => {
      await expect(diaryRow(page, 'breakfast', bowl, energyText(480))).toBeVisible();
      await expect(diaryRow(page, 'lunch', salad, energyText(390))).toBeVisible();
      await expect(ui(ui(page, 'home.diary'), 'entry.row')).toHaveCount(2);
    });

    await test.step('the bowl kept its photo and took the note of the file', async () => {
      const editor = await openEntry(page, bowl);
      await expectPhotoShown(editor);
      await expect(ui(editor, 'editor.note')).toHaveValue('Half the rice.');
      await ui(editor, 'editor.cancel').click();
      await expect(editor).toBeHidden();
    });

    await test.step("yesterday's porridge is untouched", async () => {
      await pickDay(page, YESTERDAY);
      await expect(
        diaryRow(page, 'breakfast', 'Porridge with berries', energyText(310)),
      ).toBeVisible();
      await expect(ui(ui(page, 'home.diary'), 'entry.row')).toHaveCount(1);
    });
  });

  test('backs up, erases everything and restores from Welcome to the same diary, chat and settings (ACC-K3-1, ACC-K4-1, ACC-K6-1, ACC-B10-1, R06.8)', async ({
    page,
  }, testInfo) => {
    await onboard(page, { ai: true });
    const html = page.locator('html');
    const question = 'Is this breakfast enough protein?';
    const answer = 'It gives you 34 g of protein, about a third of your daily goal.';
    const bowlInKj = diaryRow(page, 'breakfast', GRAIN_BOWL.name, energyText(520, 'kJ'));

    await logGrainBowl(page, '08:15');

    await test.step('the Coach answers one question', async () => {
      await fakeAi.useReplies(textScript(answer));
      await ui(page, 'shell.tabbar.coach').click();
      await expect(ui(page, 'coach.empty')).toBeVisible();
      await ui(page, 'coach.input').fill(question);
      await ui(page, 'coach.send').click();
      await expect(ui(ui(page, 'coach.list'), 'coach.reply')).toHaveText(answer);
    });

    await test.step('Settings › App settings: Lagoon and kJ', async () => {
      const screen = await openSettings(page, 'app');
      await choice(ui(screen, 'appSettings.accent'), words('appearance.accent.lagoon')).click();
      await choice(ui(screen, 'appSettings.units.energy'), words('home.unit.kJ')).click();
      await expect(html).toHaveAttribute('data-accent', 'lagoon');
      await leaveSettings(page, screen);
      await expect(bowlInKj).toBeVisible();
    });

    const backupFile =
      await test.step('Your data › Back up now → one zip file, and its time', async () => {
        const data = await openSettings(page, 'data');
        const card = ui(data, 'backup');
        await expect(ui(card, 'backup.last')).toHaveText(words('backup.never'));
        const download = await downloadFrom(page, ui(card, 'backup.now'));
        expect(download.suggestedFilename()).toBe(`platewise-backup-${TODAY}.zip`);
        await expect(ui(card, 'backup.last')).toContainText(formatDay(TODAY, 'medium', LOCALE));
        return keep(download, testInfo);
      });

    await test.step('Erase everything, asked first → Welcome, default accent', async () => {
      const data = ui(page, 'screen.settings.data');
      await ui(data, 'data.erase').click();
      const dialog = page.getByRole('alertdialog', { name: words('data.erase.title') });
      await expect(dialog).toHaveAttribute('data-ui', 'data.eraseDialog');
      await ui(dialog, 'data.eraseDialog.confirm').click();
      const wizard = ui(page, 'screen.onboarding');
      await expect(wizard).toHaveAttribute('data-step', 'welcome');
      await expect(page).toHaveURL(/#\/onboarding$/);
      await expect(html).toHaveAttribute('data-accent', 'basil');
    });

    const asked = (await fakeAi.requests()).length;

    await test.step('Welcome › Restore from a backup file: the file is checked and described', async () => {
      const chooser = page.waitForEvent('filechooser');
      await ui(page, 'wizard.restore').click();
      await (await chooser).setFiles(backupFile);
      await expect(ui(page, 'screen.welcomeRestore')).toHaveAttribute('data-phase', 'asking');
      const sheet = page.getByRole('dialog', { name: words('backup.restoreSheet.title') });
      await expect(sheet).toHaveAttribute('data-ui', 'restore');
      await expect(ui(sheet, 'restore.madeAt')).toContainText(formatDay(TODAY, 'medium', LOCALE));
      await expect(ui(sheet, 'restore.counts').getByRole('listitem')).toHaveText([
        words('backup.restoreSheet.entries', { count: 1 }),
        words('backup.restoreSheet.photos', { count: 1 }),
        words('backup.restoreSheet.messages', { count: 2 }),
      ]);
      await expect(ui(sheet, 'restore.replaces')).toHaveText(words('backup.restoreSheet.replaces'));
      await ui(sheet, 'restore.confirm').click();
      await expect(sheet).toBeHidden();
    });

    await test.step('restored → Open Platewise → Home with the bowl in kJ and Lagoon', async () => {
      const screen = ui(page, 'screen.welcomeRestore');
      await expect(screen).toHaveAttribute('data-phase', 'restored');
      await ui(screen, 'welcomeRestore.open').click();
      await expect(page).toHaveURL(/#\/home$/);
      await expect(bowlInKj).toBeVisible();
      await expect(ui(ui(page, 'home.diary'), 'entry.row')).toHaveCount(1);
      await expect(html).toHaveAttribute('data-accent', 'lagoon');
    });

    await test.step('the photo came back with the entry', async () => {
      const editor = await openEntry(page, GRAIN_BOWL.name);
      await expectPhotoShown(editor);
      await ui(editor, 'editor.cancel').click();
      await expect(editor).toBeHidden();
    });

    await test.step('the Coach has the same two messages; nothing asked the AI', async () => {
      await ui(page, 'shell.tabbar.coach').click();
      const shown = ui(ui(page, 'coach.list'), 'coach.message');
      await expect(shown).toHaveCount(2);
      await expect(shown.nth(0)).toHaveAttribute('data-role', 'user');
      await expect(shown.nth(0)).toHaveText(question);
      await expect(shown.nth(1)).toHaveAttribute('data-role', 'assistant');
      await expect(ui(shown.nth(1), 'coach.reply')).toHaveText(answer);
      expect(await fakeAi.requests()).toHaveLength(asked);
    });
  });

  test("keeps the notification switch off when the browser says no, and points to the browser's settings (ACC-J11-1, R06.13)", async ({
    page,
  }) => {
    await refuseNotifications(page);
    await onboard(page, { ai: false });
    const master = (screen: Locator): Locator =>
      screen.getByRole('switch', { name: words('reminders.settings.master') });

    await test.step('Tracking & reminders: Reminders off, nothing blocked yet', async () => {
      const screen = await openSettings(page, 'tracking');
      await expect(master(screen)).toHaveAttribute('data-ui', 'reminders.master');
      await expect(master(screen)).toHaveAttribute('aria-checked', 'false');
      await expect(ui(screen, 'reminders.blocked')).toHaveCount(0);
    });

    await test.step('Reminders pressed: the browser says no; the switch stays off, the pointer shows', async () => {
      const screen = ui(page, 'screen.settings.tracking');
      await master(screen).click();
      await expect(ui(screen, 'reminders.blocked')).toHaveText(words('reminders.settings.blocked'));
      await expect(master(screen)).toHaveAttribute('aria-checked', 'false');
      await expect(master(screen)).toBeEnabled();
      // No reminder rows: they show only while the switch is on.
      await expect(ui(screen, 'reminders.goalReached')).toHaveCount(0);
      expect(await notificationRequests(page)).toBe(1);
    });

    await test.step('after a reload it is still off, and the pointer still shows', async () => {
      await page.reload();
      const screen = ui(page, 'screen.settings.tracking');
      await expect(master(screen)).toHaveAttribute('aria-checked', 'false');
      await expect(ui(screen, 'reminders.blocked')).toBeVisible();
      expect(await notificationRequests(page)).toBe(1);
    });
  });

  test('sends a stored FoodData Central key in its header only, once, after an Open Food Facts miss (R02.18, R02.15)', async ({
    page,
  }) => {
    await onboard(page, { ai: false });
    const key = 'fdc-e2e-K3y-0042';

    await test.step('Settings › AI providers › Food databases: the key is saved, shown masked', async () => {
      const screen = await openSettings(page, 'ai');
      const card = ui(screen, 'ai.foodDb');
      const field = card.getByLabel(words('aiSetup.page.foodDb.label'));
      await expect(field).toHaveAttribute('data-ui', 'ai.foodDb.key');
      await field.fill(key);
      await ui(card, 'ai.foodDb.save').click();
      await expect(ui(card, 'ai.foodDb.saved')).toHaveText(
        words('aiSetup.page.foodDb.saved', { mask: 'fdc-…0042' }),
      );
      await expect(field).toHaveValue('');
      await leaveSettings(page, screen);
    });

    await test.step('typed digits Open Food Facts does not know → not found, Scan label offered', async () => {
      await choose(page, 'snapScan', 'barcode');
      const scanner = page.getByRole('dialog', { name: words('scan.title') });
      await scanner
        .getByRole('textbox', { name: words('scan.digits.label') })
        .fill(OFF_MISSING_CODE);
      await scanner.getByRole('button', { name: words('scan.digits.submit') }).click();
      const failure = page.getByRole('alertdialog', { name: words('scan.failedTitle') });
      await expect(failure).toHaveAttribute('data-ui', 'scan.failed');
      await expect(failure).toHaveAccessibleDescription(words('scan.failure.notFound'));
      await expect(failure.getByRole('button', { name: words('scan.scanLabel') })).toBeVisible();
    });

    await test.step('one FoodData Central search, the key in its X-Api-Key header and nowhere else', async () => {
      expect(net.off.map((asked) => asked.code)).toEqual([OFF_MISSING_CODE]);
      expect(net.fdcSearches).toHaveLength(1);
      const [search] = net.fdcSearches;
      expect(search!.apiKey).toBe(key);
      expect(search!.url).not.toContain(key);
      expect(search!.body ?? '').not.toContain(key);
      expect(search!.body ?? '').toContain(OFF_MISSING_CODE);
      // Nothing else carried it: not the other requests to the databases, not the AI.
      expect([...net.fdc, ...net.off.map((asked) => asked.code)].join(' ')).not.toContain(key);
      expect(JSON.stringify(await fakeAi.requests())).not.toContain(key);
    });
  });
});

test.describe('offline (service workers allowed)', () => {
  // The default project blocks service workers, as every other spec needs; this test runs in
  // `offline-chromium` (playwright.config.ts).
  test.skip(
    ({ serviceWorkers }) => serviceWorkers !== 'allow',
    'needs the service worker: runs in the offline-chromium project',
  );

  test(
    'reloads with the network off from the service worker, and an AI request offline says so (ACC-L2-1, R03.2)',
    { tag: '@offline' },
    async ({ page, context }) => {
      await onboard(page, { ai: true });
      await enterManually(page, 'Toast', 250);
      const row = diaryRow(page, 'breakfast', 'Toast', energyText(250));
      await expect(row).toBeVisible();

      await test.step('the worker installs and takes control of the page', async () => {
        await expect
          .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
          .toBe(true);
      });

      const asked = (await fakeAi.requests()).length;
      const workerFailures: string[] = [];
      context.on('requestfailed', (request) => {
        if (request.serviceWorker()) workerFailures.push(request.url());
      });

      await test.step('network off → reload: the worker answers, Home shows the entry', async () => {
        await context.setOffline(true);
        const response = await page.reload();
        expect(response?.fromServiceWorker()).toBe(true);
        expect(response?.status()).toBe(200);
        // The worker tried the network first, and the network was really off for it too.
        expect(workerFailures).toContain(`${new URL(page.url()).origin}/`);
        await expect(page).toHaveURL(/#\/home$/);
        await expect(row).toBeVisible();
      });

      await test.step('Describe → Analyse offline: the offline message, and no request', async () => {
        await choose(page, 'describe', 'describe');
        const sheet = page.getByRole('dialog', { name: words('capture.describe.title') });
        await sheet
          .getByRole('textbox', { name: words('capture.describe.label') })
          .fill('two eggs and toast');
        await sheet.getByRole('button', { name: words('capture.analyse') }).click();
        const failed = page.getByRole('alertdialog', {
          name: words('capture.analysing.failedTitle'),
        });
        await expect(failed).toHaveAttribute('data-ui', 'analysis.failed');
        await expect(failed).toContainText(words('ai.failure.offline'));
        expect(await fakeAi.requests()).toHaveLength(asked);
        await ui(failed, 'analysis.failed.cancel').click();
        await expect(failed).toBeHidden();
        await expect(row).toBeVisible();
      });

      await context.setOffline(false);
    },
  );
});
