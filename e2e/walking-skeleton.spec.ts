/**
 * The walking skeleton end to end (P04-14, Demo 1): a first run on a phone walks the wizard's
 * shortest path (every step on its default, AI set up later, the formula plan), logs "Toast,
 * 250 kcal" by hand, sees it under its meal with the gauge at 250, reloads and still has it, then
 * deletes it only after confirming. parity/walking-skeleton.platewise.json is the same flow for
 * REA.
 */
import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { lookupMessage, type MessageKey } from '../src/i18n/catalogue';
import { en } from '../src/i18n/en';
import { numberFormat, pluralRules } from '../src/i18n/format';
import { parseMessage, renderMessage, type MessageParams } from '../src/i18n/message';

const LOCALE = 'en-US';

// The same browser settings as the parity scenario's environment block, on the full Pixel 7
// profile (touch and mobile flags included).
test.use({ ...devices['Pixel 7'], locale: LOCALE, timezoneId: 'UTC', reducedMotion: 'reduce' });

/** 08:30 in the browser's zone (UTC): inside the default breakfast window (05:00 to 12:00). */
const MORNING = new Date('2026-10-26T08:30:00Z');

/** The app's words for `key`, rendered as the app renders them in this locale. */
function words(key: MessageKey<typeof en>, params?: MessageParams): string {
  const source = lookupMessage(en, key);
  if (source === undefined) throw new Error(`The catalogue has no message "${key}"`);
  return renderMessage(parseMessage(source), {
    params,
    plural: pluralRules('en'),
    number: numberFormat(LOCALE),
    onProblem: (problem) => {
      throw new Error(`${problem} in message "${key}"`);
    },
  });
}

/** The element with a `data-ui` hook. */
function ui(scope: Page | Locator, hook: string): Locator {
  return scope.locator(`[data-ui="${hook}"]`);
}

/** Drags a row from near its trailing edge to its leading edge with the pointer, then lets go. */
async function swipeTowardLeadingEdge(page: Page, row: Locator): Promise<void> {
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  if (box === null) throw new Error('The row to swipe is not on screen');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 4, y, { steps: 12 });
  await page.mouse.up();
}

test.describe('walking skeleton (Demo 1)', () => {
  test('a manual entry lands under its meal, moves the gauge, survives a reload and is deleted only after confirming (ACC-D2-1)', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.clock.install({ time: MORNING });

    const name = 'Toast';
    const energy = words('home.energy.kcal', { amount: '250' });
    const gauge = ui(page, 'home.gauge');
    const diary = ui(page, 'home.diary');
    const breakfast = ui(diary, 'home.meal.breakfast');
    const entry = ui(page, 'entry.row');

    const wizard = ui(page, 'screen.onboarding');

    await test.step('a fresh load opens the wizard; Get started', async () => {
      await page.goto('/');
      await expect(wizard).toHaveAttribute('data-step', 'welcome');
      const start = wizard.getByRole('button', {
        name: words('onboarding.welcome.start'),
        exact: true,
      });
      await expect(start).toHaveAttribute('data-ui', 'wizard.start');
      await start.click();
    });

    await test.step('Continue on every step from Sex to Reminders, keeping the defaults', async () => {
      const next = wizard.getByRole('button', {
        name: words('onboarding.wizard.continue'),
        exact: true,
      });
      await expect(next).toHaveAttribute('data-ui', 'wizard.continue');
      const steps = [
        'sex',
        'birthday',
        'body',
        'bodyFat',
        'activity',
        'goal',
        'target',
        'pace',
        'reminders',
      ];
      for (const step of steps) {
        await expect(wizard).toHaveAttribute('data-step', step);
        await next.click();
      }
    });

    await test.step('AI access: Set up later', async () => {
      await expect(wizard).toHaveAttribute('data-step', 'aiAccess');
      const later = wizard.getByRole('button', {
        name: words('aiSetup.access.later'),
        exact: true,
      });
      await expect(later).toHaveAttribute('data-ui', 'wizard.ai.later');
      await later.click();
    });

    await test.step('Building plan, then Plan ready with the formula plan; finish', async () => {
      await expect(wizard).toHaveAttribute('data-step', 'buildingPlan');
      await expect(ui(wizard, 'wizard.building')).toBeVisible();
      await expect(wizard.getByRole('button', { name: words('common.back') })).toHaveCount(0);
      await expect(wizard).toHaveAttribute('data-step', 'planReady');
      await expect(ui(wizard, 'wizard.plan.kcal')).toContainText('2,452');
      await expect(ui(wizard, 'wizard.plan.aiUnavailable')).toBeVisible();
      const finish = wizard.getByRole('button', {
        name: words('onboarding.planReady.finish'),
        exact: true,
      });
      await expect(finish).toHaveAttribute('data-ui', 'wizard.plan.finish');
      await finish.click();
    });

    await test.step('Home opens with nothing eaten, against the plan', async () => {
      await expect(page).toHaveURL(/#\/home$/);
      await expect(gauge).toHaveAccessibleName(words('home.gauge.heading.kcal'));
      await expect(gauge).toHaveAccessibleDescription(/^0 .*2,452/);
      await expect(ui(diary, 'home.diary.empty')).toHaveText(words('home.diary.empty'));
      await expect(entry).toHaveCount(0);
    });

    await test.step('"+" → Enter manually → Toast, 250 kcal → Save', async () => {
      const add = ui(page, 'home.add');
      await expect(add).toHaveAccessibleName(words('home.add.label'));
      await add.click();
      const manualItem = page.getByRole('menuitem', { name: words('home.add.manual') });
      await expect(manualItem).toHaveAttribute('data-ui', 'home.add.manual');
      await manualItem.click();

      const sheet = page.getByRole('dialog', { name: words('log.manual.title') });
      await expect(sheet).toHaveAttribute('data-ui', 'manual');
      const nameField = sheet.getByRole('textbox', { name: words('log.manual.name') });
      await expect(nameField).toHaveAttribute('data-ui', 'manual.name');
      await nameField.fill(name);
      const energyField = sheet.getByRole('textbox', { name: words('log.manual.energy.kcal') });
      await expect(energyField).toHaveAttribute('data-ui', 'manual.energy');
      await energyField.fill('250');
      const save = ui(sheet, 'manual.save');
      await expect(save).toHaveAccessibleName(words('common.save'));
      await save.click();
      await expect(sheet).toBeHidden();
    });

    const expectToastLogged = async (): Promise<void> => {
      await expect(entry).toHaveCount(1);
      await expect(breakfast).toHaveAccessibleName(words('log.meal.breakfast'));
      await expect(
        breakfast.getByRole('group', { name: `${name} ${energy}`, exact: true }),
      ).toBeVisible();
      await expect(ui(breakfast, 'entry.row')).toHaveCount(1);
      await expect(gauge).toHaveAccessibleDescription(/^250 /);
      await expect(ui(diary, 'home.diary.empty')).toHaveCount(0);
    };

    await test.step('the entry is under breakfast and the gauge reads 250', expectToastLogged);

    await test.step('after a reload it is still there', async () => {
      await page.reload();
      await expect(page).toHaveURL(/#\/home$/);
      await expectToastLogged();
    });

    const confirmDelete = page.getByRole('alertdialog', { name: words('home.entry.deleteTitle') });

    await test.step('the keyboard delete button asks first; Cancel keeps the entry', async () => {
      const deleteButton = entry.getByRole('button', {
        name: words('home.entry.deleteLabel', { name }),
      });
      await expect(deleteButton).toHaveAttribute('data-ui', 'entry.row.delete');
      await deleteButton.press('Enter');
      await expect(confirmDelete).toHaveAttribute('data-ui', 'entry.delete');
      await expect(confirmDelete).toHaveAccessibleDescription(
        words('home.entry.deleteMessage', { name }),
      );
      const cancel = ui(confirmDelete, 'entry.delete.cancel');
      await expect(cancel).toHaveAccessibleName(words('common.cancel'));
      await cancel.click();
      await expect(confirmDelete).toBeHidden();
      await expect(entry).toHaveCount(1);
      // Cancel hands the focus back to the button, which keeps the row slid aside; let it go.
      await deleteButton.blur();
      await expect(entry).not.toHaveAttribute('data-revealed');
    });

    await test.step('a swipe asks too; confirming leaves the empty diary', async () => {
      await swipeTowardLeadingEdge(page, entry);
      await expect(confirmDelete).toBeVisible();
      const confirm = ui(confirmDelete, 'entry.delete.confirm');
      await expect(confirm).toHaveAccessibleName(words('common.delete'));
      await confirm.click();
      await expect(confirmDelete).toBeHidden();
      await expect(entry).toHaveCount(0);
      await expect(ui(diary, 'home.diary.empty')).toHaveText(words('home.diary.empty'));
      await expect(gauge).toHaveAccessibleDescription(/^0 /);
    });

    expect(pageErrors).toEqual([]);
  });
});
