/**
 * Logging food end to end (P06-20, Demo 3). Each test starts from an empty browser, walks the
 * wizard on its defaults with the AI as the Custom provider at the fake's loopback address
 * (`plan-ok`), and lands on Home at 08:30 UTC, inside breakfast. Then it logs food one way (a meal
 * photo, a typed meal, typed barcode digits, a label after a barcode miss, a pick from Recent) or
 * changes what was logged (an entry's calories, two entries combined); two more prove that a
 * review survives a reload and that a busy provider is asked again without an error. Open Food
 * Facts, its image host and FoodData Central answer from our fixtures (e2e/fixtures); a request to
 * any other host off loopback is aborted and fails the test.
 */
import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { RETRY_WAITS_MS } from '../src/ai/retry';
import type { MealKind } from '../src/domain/model';
import {
  EGGS_ON_TOAST,
  FAKE_AI_BASE_URL,
  GRAIN_BOWL,
  LOCALE,
  MEAL_PHOTO,
  OFF_MISSING_CODE,
  OFF_PRODUCT_CODE,
  RICE_CAKE_LABEL,
  fakeAi,
  foodScript,
  hooksSeen,
  imagesSent,
  recordHooks,
  routeFoodDatabases,
  ui,
  words,
  type FoodDatabaseLog,
} from './support';

test.use({ ...devices['Pixel 7'], locale: LOCALE, timezoneId: 'UTC', reducedMotion: 'reduce' });

/** 08:30 in the browser's zone (UTC): breakfast by the default meal times. */
const START = new Date('2026-10-27T08:30:00Z');
const TODAY = '2026-10-27';
const YESTERDAY = '2026-10-26';

/** The model id typed for the Custom provider; the fake answers whatever it is asked for. */
const MODEL = 'platewise-e2e';

/** Longer than a row's long-press (500 ms in EntryRow.tsx), run on the page clock. */
const HOLD_MS = 1_000;

/** The retry ladder's wait after a busy reply, run on the page clock. */
const FIRST_RETRY_MS = RETRY_WAITS_MS[0];
if (FIRST_RETRY_MS === undefined) throw new Error('The retry ladder has no first wait');

/** The overlays and failures whose every appearance is recorded (`recordHooks`). */
const WATCHED = ['analysis.failed', 'scan.looking', 'scan.failed'] as const;

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
  await recordHooks(page, WATCHED);
  await page.clock.install({ time: START });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(net.strays).toEqual([]);
});

// ---- Getting there ----------------------------------------------------------------------------

/** A fresh load → the wizard on its defaults, the fake AI as the Custom provider → Home. */
async function onboard(page: Page): Promise<void> {
  await test.step('onboard with the AI as the Custom provider at loopback', async () => {
    await fakeAi.useScript('plan-ok');
    await page.goto('/');
    const wizard = ui(page, 'screen.onboarding');
    await wizard
      .getByRole('button', { name: words('onboarding.welcome.start'), exact: true })
      .click();
    const next = wizard.getByRole('button', {
      name: words('onboarding.wizard.continue'),
      exact: true,
    });
    for (const step of BODY_STEPS) {
      await expect(wizard).toHaveAttribute('data-step', step);
      await next.click();
    }
    await expect(wizard).toHaveAttribute('data-step', 'aiAccess');
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
    await expect(wizard).toHaveAttribute('data-step', 'planReady');
    await wizard
      .getByRole('button', { name: words('onboarding.planReady.finish'), exact: true })
      .click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(ui(page, 'home.diary.empty')).toBeVisible();
  });
}

type Group = 'snapScan' | 'describe' | 'reuse';
type Method = 'camera' | 'barcode' | 'describe' | 'manual' | 'recent';

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

/** The photos sheet is open: "Add photo" picks our JPEG from the camera's input; Analyse. */
async function photographAndAnalyse(page: Page): Promise<void> {
  const sheet = page.getByRole('dialog', { name: words('capture.title') });
  await expect(sheet).toHaveAttribute('data-ui', 'capture');
  const chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: words('capture.addPhoto') }).click();
  await (await chooser).setFiles(MEAL_PHOTO);
  await expect(ui(sheet, 'capture.card')).toHaveCount(1);
  await expect(ui(sheet, 'capture.count')).toHaveText(words('capture.count', { count: 1 }));
  const analyse = sheet.getByRole('button', { name: words('capture.analyse') });
  await expect(analyse).toBeEnabled();
  await analyse.click();
  await expect(sheet).toBeHidden();
}

/** "+" → Barcode → the digits typed under the camera → Look up. */
async function lookUpDigits(page: Page, digits: string): Promise<void> {
  await choose(page, 'snapScan', 'barcode');
  const scanner = page.getByRole('dialog', { name: words('scan.title') });
  await expect(scanner).toHaveAttribute('data-ui', 'scan');
  await scanner.getByRole('textbox', { name: words('scan.digits.label') }).fill(digits);
  await scanner.getByRole('button', { name: words('scan.digits.submit') }).click();
  await expect(scanner).toBeHidden();
}

/** "+" → Describe → Enter manually → a name and its kcal → Save. */
async function enterManually(page: Page, name: string, kcal: number): Promise<void> {
  await choose(page, 'describe', 'manual');
  const sheet = page.getByRole('dialog', { name: words('log.manual.title') });
  await sheet.getByRole('textbox', { name: words('log.manual.name') }).fill(name);
  await sheet.getByRole('textbox', { name: words('log.manual.energy.kcal') }).fill(String(kcal));
  await ui(sheet, 'manual.save').click();
  await expect(sheet).toBeHidden();
}

// ---- What the screens show --------------------------------------------------------------------

function reviewSheet(page: Page): Locator {
  return page.getByRole('dialog', { name: words('review.title') });
}

/** Energy and macros as the nutrition rows write them at the shown amount. */
interface ShownValues {
  readonly kcal: string;
  readonly protein: string;
  readonly carbs: string;
  readonly fat: string;
}

/** The review shows `values` in its nutrition rows. */
async function expectValues(sheet: Locator, values: ShownValues): Promise<void> {
  for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    await expect(ui(sheet, `review.${key}`)).toHaveText(values[key]);
  }
}

/** The review shows `name`, an amount of `count` `unit` and `values`. */
async function expectReview(
  review: Locator,
  name: string,
  amount: { readonly count: string; readonly unit: string },
  values: ShownValues,
): Promise<void> {
  await expect(review).toHaveAttribute('data-ui', 'review');
  await expect(ui(review, 'review.name')).toHaveValue(name);
  await expect(ui(review, 'review.amount')).toHaveValue(amount.count);
  await expect(ui(review, 'review.unit')).toHaveValue(amount.unit);
  await expectValues(review, values);
}

/** Log on the review: it closes. */
async function logReview(page: Page): Promise<void> {
  const review = reviewSheet(page);
  await ui(review, 'review.log').click();
  await expect(review).toBeHidden();
}

/** The diary row of `name` at `kcal` under `meal`. */
function diaryRow(page: Page, meal: MealKind, name: string, kcal: number): Locator {
  const energy = words('home.energy.kcal', { amount: String(kcal) });
  return ui(ui(page, 'home.diary'), `home.meal.${meal}`).getByRole('group', {
    name: `${name} ${energy}`,
    exact: true,
  });
}

/** The gauge has `kcal` eaten on the day shown. */
async function expectEaten(page: Page, kcal: number): Promise<void> {
  await expect(ui(page, 'home.gauge')).toHaveAccessibleDescription(new RegExp(`^${kcal} `));
}

/** A day of the week bar. */
function weekDay(page: Page, day: string): Locator {
  return ui(page, 'home.week').locator(`[data-day="${day}"]`);
}

// ---- The flows --------------------------------------------------------------------------------

test.describe('logging flows (Demo 3)', () => {
  test('logs a meal photo at 1.5 servings and Home shows it under its meal', async ({ page }) => {
    await onboard(page);
    await fakeAi.useReplies(foodScript(GRAIN_BOWL));
    const review = reviewSheet(page);

    await test.step('"+" → Snap & scan → Camera → our photo → Analyse', async () => {
      await choose(page, 'snapScan', 'camera');
      await photographAndAnalyse(page);
    });

    await test.step('the review opens on one serving of the AI answer, with the photo', async () => {
      await expectReview(
        review,
        GRAIN_BOWL.name,
        { count: '1', unit: 'serving' },
        { kcal: '520', protein: '34', carbs: '58', fat: '16' },
      );
      await expect(ui(review, 'review.photo.1')).toBeVisible();
      await expect(ui(review, 'review.grams')).toHaveText(
        words('review.serving.approx', { grams: '360' }),
      );
      // Nothing failed on the way: a failure that came and went would have been recorded.
      expect(await hooksSeen(page)).not.toContain('analysis.failed');
    });

    await test.step('1.5 servings: about 540 g, and every value follows', async () => {
      const amount = ui(review, 'review.amount');
      await amount.fill('1.5');
      await amount.press('Enter');
      await expect(amount).toHaveValue('1.5');
      await expect(ui(review, 'review.unit').locator('option:checked')).toHaveText(
        words('review.serving.servingOther'),
      );
      await expect(ui(review, 'review.grams')).toHaveText(
        words('review.serving.approx', { grams: '540' }),
      );
      await expectValues(review, { kcal: '780', protein: '51', carbs: '87', fat: '24' });
    });

    await test.step('Log: the bowl is under breakfast and the gauge reads 780', async () => {
      await logReview(page);
      const row = diaryRow(page, 'breakfast', GRAIN_BOWL.name, 780);
      await expect(row).toBeVisible();
      await expect(row).toContainText(
        words('home.entry.macros', { protein: 51, carbs: 87, fat: 24 }),
      );
      await expect(ui(page, 'entry.row')).toHaveCount(1);
      await expectEaten(page, 780);
    });

    await test.step('the AI was asked once for the food, with the photo', async () => {
      const requests = await fakeAi.requests();
      expect(requests).toHaveLength(2);
      expect(imagesSent(requests[1]!)).toBe(1);
    });
  });

  test('describes "two eggs and toast", reviews the estimate from the AI and logs it (ACC-D6-1)', async ({
    page,
  }) => {
    await onboard(page);
    await fakeAi.useReplies(foodScript(EGGS_ON_TOAST));
    const description = 'two eggs and toast';
    const review = reviewSheet(page);

    await test.step('"+" → Describe → Describe → the words → Analyse', async () => {
      await choose(page, 'describe', 'describe');
      const sheet = page.getByRole('dialog', { name: words('capture.describe.title') });
      await expect(sheet).toHaveAttribute('data-ui', 'describe');
      const field = sheet.getByRole('textbox', { name: words('capture.describe.label') });
      await expect(field).toBeFocused();
      await field.fill(description);
      await sheet.getByRole('button', { name: words('capture.analyse') }).click();
      await expect(sheet).toBeHidden();
    });

    await test.step('the review opens with the AI estimate for one plate', async () => {
      await expectReview(
        review,
        EGGS_ON_TOAST.name,
        { count: '1', unit: 'plate' },
        { kcal: '340', protein: '18', carbs: '30.8', fat: '16' },
      );
      await expect(ui(review, 'review.emoji')).toHaveText(EGGS_ON_TOAST.emoji);
      expect(await hooksSeen(page)).not.toContain('analysis.failed');
    });

    await test.step('Log: Home shows it under breakfast', async () => {
      await logReview(page);
      await expect(diaryRow(page, 'breakfast', EGGS_ON_TOAST.name, 340)).toBeVisible();
      await expectEaten(page, 340);
    });

    await test.step('the AI got the words, and no photo', async () => {
      const requests = await fakeAi.requests();
      expect(requests).toHaveLength(2);
      expect(JSON.stringify(requests[1]!.body)).toContain(description);
      expect(imagesSent(requests[1]!)).toBe(0);
    });
  });

  test('looks up typed barcode digits in Open Food Facts and logs the product (ACC-D19-1, ACC-D20-1)', async ({
    page,
  }) => {
    await onboard(page);
    const review = reviewSheet(page);
    const name = 'Millbrook Bakery Spelt Crackers with Rosemary';

    await test.step('"+" → Barcode → the digits as printed, spaces and all → Look up', async () => {
      await lookUpDigits(page, '2 001234 567893');
    });

    await test.step('the product opens in the review: one 25 g serving, its photo, its details', async () => {
      await expectReview(
        review,
        name,
        { count: '1', unit: 'serving' },
        { kcal: '105', protein: '3', carbs: '16', fat: '3' },
      );
      await expect(ui(review, 'review.grams')).toHaveText(
        words('review.serving.approx', { grams: '25' }),
      );
      await expect(ui(review, 'review.photo.1')).toBeVisible();
      const details = ui(review, 'review.product');
      const field = (key: string) => ui(details, `review.product.${key}`);
      await expect(field('barcode')).toContainText(OFF_PRODUCT_CODE);
      await expect(field('package')).toContainText('200 g');
      await expect(field('nutri')).toContainText('B');
      await expect(field('nova')).toContainText('3');
      await expect(field('eco')).toHaveCount(0);
      await expect(field('allergens')).toContainText('Gluten');
      await expect(field('traces')).toContainText('Sesame seeds');
      await expect(field('categories')).toContainText('Snacks, Crackers');
      await expect(
        ui(details, 'review.product.ingredients').locator('strong', { hasText: 'Spelt' }),
      ).toBeVisible();
      const seen = await hooksSeen(page);
      expect(seen).toContain('scan.looking');
      expect(seen).not.toContain('scan.failed');
    });

    await test.step('Log: Home shows it under breakfast', async () => {
      await logReview(page);
      await expect(diaryRow(page, 'breakfast', name, 105)).toBeVisible();
      await expectEaten(page, 105);
    });

    await test.step('Open Food Facts was asked once, as the app; nothing else was', async () => {
      expect(net.off).toEqual([{ code: OFF_PRODUCT_CODE, lc: 'en', appName: 'Platewise' }]);
      expect(net.offPhotos).toHaveLength(1);
      expect(net.fdc).toEqual([]);
      // Only the wizard's plan reached the AI.
      expect(await fakeAi.requests()).toHaveLength(1);
    });
  });

  test('offers Scan label for a product Open Food Facts lacks, logs the label, and finds that label on the next scan (ACC-D20-2, ACC-D21-1, R02.15, R02.20)', async ({
    page,
  }) => {
    await onboard(page);
    await fakeAi.useReplies(foodScript(RICE_CAKE_LABEL));
    const review = reviewSheet(page);
    const failure = page.getByRole('alertdialog', { name: words('scan.failedTitle') });

    await test.step('a code Open Food Facts does not know → the failure offers Scan label', async () => {
      await lookUpDigits(page, OFF_MISSING_CODE);
      await expect(failure).toHaveAttribute('data-ui', 'scan.failed');
      await expect(failure).toHaveAccessibleDescription(words('scan.failure.notFound'));
      await failure.getByRole('button', { name: words('scan.scanLabel') }).click();
      await expect(failure).toBeHidden();
    });

    await test.step('Scan label opens the photos sheet on the camera; the label photo → Analyse', async () => {
      await photographAndAnalyse(page);
    });

    await test.step('the review shows the label values, tied to the barcode', async () => {
      await expectReview(
        review,
        RICE_CAKE_LABEL.name,
        { count: '2', unit: 'cake' },
        { kcal: '68', protein: '1.6', carbs: '14.2', fat: '0.6' },
      );
      await expect(ui(review, 'review.product.barcode')).toContainText(OFF_MISSING_CODE);
      await expect(ui(review, 'review.savedLabel')).toHaveCount(0);
    });

    await test.step('Log: Home shows the label entry', async () => {
      await logReview(page);
      await expect(diaryRow(page, 'breakfast', RICE_CAKE_LABEL.name, 68)).toBeVisible();
      const requests = await fakeAi.requests();
      expect(requests).toHaveLength(2);
      expect(imagesSent(requests[1]!)).toBe(1);
    });

    await test.step('the same code again opens the saved label, with its notice', async () => {
      await lookUpDigits(page, OFF_MISSING_CODE);
      await expect(ui(review, 'review.savedLabel')).toHaveText(words('scan.savedLabel'));
      await expect(ui(review, 'review.name')).toHaveValue(RICE_CAKE_LABEL.name);
      await expectValues(review, { kcal: '68', protein: '1.6', carbs: '14.2', fat: '0.6' });
      await ui(review, 'review.cancel').click();
      await expect(review).toBeHidden();
      await expect(ui(page, 'entry.row')).toHaveCount(1);
    });

    await test.step('Open Food Facts was asked twice; FoodData Central (no key) and the AI not again', async () => {
      expect(net.off.map((asked) => asked.code)).toEqual([OFF_MISSING_CODE, OFF_MISSING_CODE]);
      expect(net.fdc).toEqual([]);
      expect(await fakeAi.requests()).toHaveLength(2);
    });
  });

  test("logs yesterday's food again from Recent, on today, leaving yesterday as it was (ACC-D16-2)", async ({
    page,
  }) => {
    await onboard(page);
    const name = 'Porridge with berries';
    const diary = ui(page, 'home.diary');

    await test.step('yesterday in the week bar → enter the porridge by hand', async () => {
      await weekDay(page, YESTERDAY).click();
      await expect(diary.getByRole('heading', { name: words('home.diary.day') })).toBeVisible();
      await enterManually(page, name, 310);
      await expect(diaryRow(page, 'breakfast', name, 310)).toBeVisible();
    });

    await test.step('back to today: nothing logged yet', async () => {
      await weekDay(page, TODAY).click();
      await expect(diary.getByRole('heading', { name: words('home.diary.today') })).toBeVisible();
      await expect(ui(diary, 'home.diary.empty')).toBeVisible();
    });

    await test.step('"+" → Reuse → Recent → the porridge opens in the review, not logged yet', async () => {
      await choose(page, 'reuse', 'recent');
      const sheet = page.getByRole('dialog', { name: words('reuse.title.recent') });
      await expect(sheet).toHaveAttribute('data-ui', 'reuse.recent');
      const rows = ui(sheet, 'reuse.row');
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(name);
      await ui(rows, 'reuse.row.pick').click();
      await expect(sheet).toBeHidden();
      const review = reviewSheet(page);
      await expect(ui(review, 'review.name')).toHaveValue(name);
      await expect(ui(review, 'review.unit')).toHaveText(words('review.serving.servingOne'));
      await expect(ui(review, 'review.kcal')).toHaveText('310');
      await expect(ui(diary, 'home.diary.empty')).toBeVisible();
    });

    await test.step('Log: today has it under breakfast', async () => {
      await logReview(page);
      await expect(diaryRow(page, 'breakfast', name, 310)).toBeVisible();
      await expectEaten(page, 310);
    });

    await test.step('yesterday still has its own, once', async () => {
      await weekDay(page, YESTERDAY).click();
      await expect(diary.getByRole('heading', { name: words('home.diary.day') })).toBeVisible();
      await expect(ui(diary, 'entry.row')).toHaveCount(1);
      await expect(diaryRow(page, 'breakfast', name, 310)).toBeVisible();
      expect(await fakeAi.requests()).toHaveLength(1);
    });
  });

  test("edits an entry's calories from its row through the nutrition lock (ACC-D12-2, D-16.19)", async ({
    page,
  }) => {
    await onboard(page);
    const name = 'Toast';
    const time = ui(page, 'entry.row').locator('time');

    await enterManually(page, name, 250);
    await expect(diaryRow(page, 'breakfast', name, 250)).toBeVisible();
    const loggedAt = await time.getAttribute('datetime');

    await test.step('a tap on the row opens its editor; the lock opens the values', async () => {
      await page.getByRole('button', { name: words('home.entry.open', { name }) }).click();
      const editor = page.getByRole('dialog', { name: words('editor.title') });
      await expect(editor).toHaveAttribute('data-ui', 'editor');
      const lock = editor.getByRole('button', { name: words('review.nutrition.unlock') });
      await expect(lock).toHaveAttribute('data-ui', 'review.lock');
      await lock.click();
      const kcal = editor.getByRole('textbox', { name: words('review.nutrition.energy.kcal') });
      await expect(kcal).toHaveValue('250');
      await kcal.fill('320');
      const save = ui(editor, 'editor.save');
      await expect(save).toHaveAccessibleName(words('common.save'));
      await save.click();
      await expect(editor).toBeHidden();
    });

    await test.step('the row reads 320 at its own time, and so does the gauge', async () => {
      await expect(diaryRow(page, 'breakfast', name, 320)).toBeVisible();
      await expect(ui(page, 'entry.row')).toHaveCount(1);
      await expect(time).toHaveAttribute('datetime', loggedAt ?? '');
      await expectEaten(page, 320);
    });
  });

  test('combines two entries picked with a long-press into one (D-16.20)', async ({ page }) => {
    await onboard(page);
    const bar = ui(page, 'home.selection');

    await enterManually(page, 'Toast', 250);
    await enterManually(page, 'Coffee with milk', 60);
    await expect(ui(page, 'entry.row')).toHaveCount(2);

    await test.step('a long-press on Toast starts picking; the bar takes the "+" place', async () => {
      const toast = page.getByRole('button', { name: words('home.entry.open', { name: 'Toast' }) });
      // Clear of the tab bar and the "+" button, which float over the page's lower part.
      await toast.evaluate((row) => row.scrollIntoView({ block: 'center' }));
      const box = await toast.boundingBox();
      if (box === null) throw new Error('The Toast row is not on screen');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.clock.runFor(HOLD_MS);
      await page.mouse.up();
      await expect(bar).toBeVisible();
      await expect(ui(bar, 'home.selection.count')).toHaveText(
        words('home.selection.count', { count: 1 }),
      );
      await expect(ui(bar, 'home.selection.combine')).toBeDisabled();
      await expect(ui(page, 'home.add')).toBeHidden();
    });

    await test.step('a tap picks the coffee too; Combine', async () => {
      const coffee = page.getByRole('button', {
        name: words('home.entry.select', { name: 'Coffee with milk' }),
      });
      await expect(coffee).toHaveAttribute('aria-pressed', 'false');
      await coffee.click();
      await expect(ui(bar, 'home.selection.count')).toHaveText(
        words('home.selection.count', { count: 2 }),
      );
      const combine = bar.getByRole('button', { name: words('home.selection.combine') });
      await expect(combine).toBeEnabled();
      await combine.click();
      await expect(bar).toBeHidden();
    });

    await test.step('one row in eating order with the summed calories; "+" is back', async () => {
      await expect(ui(page, 'entry.row')).toHaveCount(1);
      await expect(diaryRow(page, 'breakfast', 'Toast + Coffee with milk', 310)).toBeVisible();
      await expectEaten(page, 310);
      await expect(ui(page, 'home.add')).toBeVisible();
    });
  });

  test('reopens the review with the same values after a reload, and only until it is logged (ACC-D25-1, D-16.46)', async ({
    page,
  }) => {
    await onboard(page);
    await fakeAi.useReplies(foodScript(GRAIN_BOWL));
    const review = reviewSheet(page);
    const expectBowl = async (): Promise<void> => {
      await expectReview(
        review,
        GRAIN_BOWL.name,
        { count: '1', unit: 'serving' },
        { kcal: '520', protein: '34', carbs: '58', fat: '16' },
      );
      await expect(ui(review, 'review.photo.1')).toBeVisible();
    };

    await test.step('a photo analysed: the review opens', async () => {
      await choose(page, 'snapScan', 'camera');
      await photographAndAnalyse(page);
      await expectBowl();
    });

    await test.step('a reload brings the same review back, without asking the AI again', async () => {
      await page.reload();
      await expect(page).toHaveURL(/#\/home$/);
      await expectBowl();
      expect(await fakeAi.requests()).toHaveLength(2);
    });

    await test.step('Log; after another reload Home has the entry and no review', async () => {
      await logReview(page);
      await expect(diaryRow(page, 'breakfast', GRAIN_BOWL.name, 520)).toBeVisible();
      await page.reload();
      await expect(diaryRow(page, 'breakfast', GRAIN_BOWL.name, 520)).toBeVisible();
      await expect(ui(page, 'entry.row')).toHaveCount(1);
      await expect(review).toHaveCount(0);
    });
  });

  test('shows no error when the provider is busy once and then answers (R03.6, D-16.23)', async ({
    page,
  }) => {
    await onboard(page);
    // A 429 first, then red lentil soup with wholemeal bread (410 kcal, one bowl).
    await fakeAi.useScript('busy-then-ok');
    const name = 'Red lentil soup with wholemeal bread';
    const review = reviewSheet(page);

    await test.step('Describe → Analyse; the provider answers busy', async () => {
      await choose(page, 'describe', 'describe');
      const sheet = page.getByRole('dialog', { name: words('capture.describe.title') });
      await sheet
        .getByRole('textbox', { name: words('capture.describe.label') })
        .fill('a bowl of red lentil soup and a slice of wholemeal bread');
      await sheet.getByRole('button', { name: words('capture.analyse') }).click();
      await expect.poll(async () => (await fakeAi.requests()).length).toBe(2);
    });

    await test.step('the overlay stays up and no failure shows', async () => {
      // A typed meal: a spinner, no photo.
      await expect(ui(page, 'analysis')).toBeVisible();
      await expect(ui(page, 'analysis.spinner')).toBeVisible();
      await expect(ui(page, 'analysis.failed')).toHaveCount(0);
    });

    await test.step("after the ladder's wait the same request goes again and the review opens", async () => {
      await page.clock.runFor(FIRST_RETRY_MS);
      await expectReview(
        review,
        name,
        { count: '1', unit: 'bowl' },
        { kcal: '410', protein: '22', carbs: '65', fat: '6.9' },
      );
      const requests = await fakeAi.requests();
      expect(requests).toHaveLength(3);
      expect(requests[2]!.body).toEqual(requests[1]!.body);
      expect(await hooksSeen(page)).not.toContain('analysis.failed');
    });

    await test.step('Log: Home shows it', async () => {
      await logReview(page);
      await expect(diaryRow(page, 'breakfast', name, 410)).toBeVisible();
    });
  });
});
