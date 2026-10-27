/**
 * Accessibility end to end (P10-07, L9). axe-core checks the wizard, Home with the + menu and a
 * food review, Progress, the Coach, the Settings list and every Settings page, each in the dark
 * and the light theme (the appearance is System, so the browser's colour scheme picks the theme);
 * a serious or critical finding fails the test, lesser ones are attached to the report. On each
 * of those screens every keyboard stop must show a focus ring, and with reduced motion nothing
 * moves for longer than the 1 ms the motion tokens drop to. The gauge, the pillars and the charts
 * give their numbers as text. Then a food entered by hand and a weight are logged with the
 * keyboard alone. Every test starts from an empty browser on Tuesday 2026-10-27 at 08:30 UTC; as
 * in the logging spec, a request off loopback goes to our routed food databases or is aborted and
 * fails the test.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { formatInt } from '../src/i18n/format';
import {
  FAKE_AI_BASE_URL,
  LOCALE,
  OFF_PRODUCT_CODE,
  fakeAi,
  routeFoodDatabases,
  textScript,
  ui,
  words,
  type FoodDatabaseLog,
} from './support';

// The device comes from the project (a Pixel 7 on Chromium), so the browser matrix can run the
// keyboard walk and the Settings scan on WebKit and Firefox too (playwright.config.ts).
test.use({
  locale: LOCALE,
  timezoneId: 'UTC',
  reducedMotion: 'reduce',
  colorScheme: 'dark',
});

/** 08:30 in the browser's zone (UTC) on a Tuesday: breakfast by the default meal times. */
const START = new Date('2026-10-27T08:30:00Z');
const LAST_TUESDAY = '2026-10-20';

/** The Settings pages opened from another page (App settings, About) rather than the list. */
const SUB_PAGES = ['menu', 'product-fields', 'tab-bar', 'credits'] as const;

/** The model id typed for the Custom provider; the fake answers whatever it is asked for. */
const MODEL = 'platewise-e2e';

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

/** The Coach's answer in Markdown: a heading, emphasis, lists, code and a link. */
const COACH_ANSWER = [
  '## Today so far',
  '',
  'You logged **one breakfast** of 310 kcal, *well* under your goal. Two ideas for lunch:',
  '',
  '- a bean salad with feta',
  '- lentil soup and bread',
  '',
  '1. Log it when you eat.',
  '2. Check `Progress` on Sunday.',
  '',
  'More in [the guide](https://example.org/guide).',
].join('\n');

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

// ---- The checks run on every screen -----------------------------------------------------------

type Theme = 'dark' | 'light';

/** The dark theme first: it is the app's default. */
const THEMES: readonly Theme[] = ['dark', 'light'];

/** axe's WCAG 2.0, 2.1 and 2.2 A and AA rules, and its best practices. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** The impacts that fail the run (P10-07); moderate and minor ones are reported only. */
const BLOCKING = new Set(['serious', 'critical']);

/** More keyboard stops than any screen has: a walk that gets here is going round in circles. */
const MAX_STOPS = 150;

/** The device's colour scheme, and the theme the app shows for it (appearance System). */
async function showTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** One axe finding as a line: where, what, how bad, and the elements it names. */
function findingLine(
  screen: string,
  theme: Theme,
  violation: { id: string; impact?: string | null; help: string; nodes: { target: unknown }[] },
): string {
  const targets = violation.nodes.map((node) => JSON.stringify(node.target)).join(' ');
  return `${screen} (${theme}): ${violation.id} [${violation.impact ?? 'unrated'}] ${violation.help} → ${targets}`;
}

/** What `focusStop` reports about the element holding the focus. */
interface Stop {
  /** A short description for the failure message: tag, role, name, hook. */
  readonly what: string;
  /** Whether a focus ring is drawn for it. */
  readonly ring: boolean;
  /** Whether this element already held the focus in this walk (the walk has gone round). */
  readonly again: boolean;
}

/** The key under which the page remembers the elements a walk has met. */
const STOPS_KEY = '__platewiseA11yStops';

/**
 * The element holding the focus, or `null` when nothing does (the walk left the page). The ring
 * counts when an outline at least 1 px wide is drawn on the element or one of its pseudo-elements
 * (a stretched button rings its `::after`), on one of its three nearest ancestors (a field box or
 * a wheel draws it with `:focus-within`), or on one of its descendants (a week-bar day rings its
 * date). The app draws outlines for focus only.
 */
async function focusStop(page: Page): Promise<Stop | null> {
  return page.evaluate((key) => {
    const store = window as unknown as Record<string, Element[] | undefined>;
    const met = (store[key] ??= []);
    const active = document.activeElement;
    if (active === null || active === document.body || active === document.documentElement) {
      return null;
    }
    const outlined = (element: Element, pseudo?: string): boolean => {
      const style = getComputedStyle(element, pseudo);
      return (
        style.outlineStyle !== 'none' &&
        parseFloat(style.outlineWidth) >= 1 &&
        style.outlineColor !== 'rgba(0, 0, 0, 0)'
      );
    };
    const around: Element[] = [];
    for (let up: Element | null = active; up !== null && around.length < 4; up = up.parentElement) {
      around.push(up);
    }
    const ring =
      around.some((element) =>
        [undefined, '::before', '::after'].some((pseudo) => outlined(element, pseudo)),
      ) || Array.from(active.querySelectorAll('*')).some((element) => outlined(element));
    const again = met.includes(active);
    if (!again) met.push(active);
    const name =
      active.getAttribute('aria-label') ?? (active.textContent ?? '').trim().slice(0, 40);
    const role = active.getAttribute('role');
    const hook = active.getAttribute('data-ui');
    const what = [
      active.tagName.toLowerCase(),
      role ? `role=${role}` : '',
      name ? `"${name}"` : '',
      hook ? `[${hook}]` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return { what, ring, again };
  }, STOPS_KEY);
}

/** Forgets the elements a walk has met; the focus stays where it is. */
async function forgetStops(page: Page): Promise<void> {
  await page.evaluate((key) => {
    (window as unknown as Record<string, unknown>)[key] = [];
  }, STOPS_KEY);
}

/**
 * Puts the keyboard at the top of the page, as a fresh load does: the focus on `<body>`, so the
 * next Tab goes to the first control (inside an open sheet, its first control: the rest is inert).
 */
async function focusPageStart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const body = document.body;
    body.tabIndex = -1;
    body.focus();
    body.removeAttribute('tabindex');
  });
}

/**
 * Walks every keyboard stop once round with `key` (Tab over a screen, ArrowDown over a menu) and
 * returns the stops that show no focus ring. A Tab walk starts at the top of the page; an arrow
 * walk starts where the focus is. It ends when the focus leaves the page or comes back to a stop
 * already met.
 */
async function stopsWithoutRing(page: Page, key: 'Tab' | 'ArrowDown'): Promise<string[]> {
  await forgetStops(page);
  if (key === 'Tab') await focusPageStart(page);
  const missing: string[] = [];
  for (let count = 0; count < MAX_STOPS; count++) {
    await page.keyboard.press(key);
    const stop = await focusStop(page);
    if (stop === null || stop.again) return missing;
    if (!stop.ring) missing.push(stop.what);
  }
  throw new Error(`More than ${MAX_STOPS} keyboard stops: the walk does not come round`);
}

/** Every element that moves for longer than reduced motion allows: name and durations. */
async function movingForLong(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // Durations are written in seconds by getComputedStyle: "0.001s, 0.22s".
    const longest = (list: string): number =>
      Math.max(0, ...list.split(',').map((part) => parseFloat(part) || 0));
    const found: string[] = [];
    for (const element of document.querySelectorAll('*')) {
      for (const pseudo of [undefined, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        const transition = longest(style.transitionDuration);
        const animated = style.animationName !== 'none';
        const animation = animated ? longest(style.animationDuration) : 0;
        const endless = animated && style.animationIterationCount === 'infinite';
        if (transition > 0.001 || animation > 0.001 || endless) {
          const hook = element.getAttribute('data-ui');
          const name = `${element.tagName.toLowerCase()}${pseudo ?? ''}${hook ? `[${hook}]` : ''}.${element.className}`;
          found.push(
            `${name}: transition ${style.transitionDuration}, animation ${style.animationName} ${style.animationDuration}${endless ? ' infinite' : ''}`,
          );
        }
      }
    }
    return found;
  });
}

/**
 * The screen as it is now, checked in both themes: axe has no serious or critical finding, every
 * keyboard stop shows a focus ring, and nothing moves for longer than reduced motion allows.
 * Failures are soft, so one run reports every screen; lesser axe findings are attached.
 */
async function checkScreen(
  page: Page,
  testInfo: TestInfo,
  screen: string,
  walkWith: 'Tab' | 'ArrowDown' = 'Tab',
): Promise<void> {
  await test.step(`${screen}: axe in both themes, focus rings, reduced motion`, async () => {
    const blocking: string[] = [];
    const lesser: string[] = [];
    for (const theme of THEMES) {
      await showTheme(page, theme);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      for (const violation of results.violations) {
        const line = findingLine(screen, theme, violation);
        (BLOCKING.has(violation.impact ?? '') ? blocking : lesser).push(line);
      }
    }
    await showTheme(page, THEMES[0]!);
    if (lesser.length > 0) {
      await testInfo.attach(`axe: lesser findings on ${screen}`, {
        body: lesser.join('\n'),
        contentType: 'text/plain',
      });
    }
    expect.soft(blocking, `axe: serious or critical findings on ${screen}`).toEqual([]);
    expect.soft(await movingForLong(page), `reduced motion on ${screen}`).toEqual([]);
    expect.soft(await stopsWithoutRing(page, walkWith), `focus rings on ${screen}`).toEqual([]);
  });
}

// ---- Getting there ----------------------------------------------------------------------------

/** The wizard's Continue button. */
function continueButton(wizard: Locator): Locator {
  return wizard.getByRole('button', { name: words('onboarding.wizard.continue'), exact: true });
}

/** On the AI access step: the Custom provider at the fake's loopback address, terms accepted. */
async function fillCustomProvider(wizard: Locator): Promise<void> {
  await wizard
    .getByRole('combobox', { name: words('aiSetup.provider.label') })
    .selectOption('custom');
  await wizard.getByRole('textbox', { name: words('aiSetup.server.label') }).fill(FAKE_AI_BASE_URL);
  await wizard.getByRole('checkbox', { name: words('aiSetup.access.terms.accept') }).check();
  await wizard
    .getByRole('textbox', { name: words('aiSetup.model.label'), exact: true })
    .fill(MODEL);
}

/**
 * A fresh load → the wizard on its defaults with the AI as the Custom provider (the fake answers
 * `plan-ok`) → Home with nothing logged. `onStep` runs on each step the wizard shows, before it is
 * left.
 */
async function onboard(
  page: Page,
  onStep: (step: string) => Promise<void> = async () => {},
): Promise<void> {
  await fakeAi.useScript('plan-ok');
  await page.goto('/');
  const wizard = ui(page, 'screen.onboarding');
  await expect(wizard).toHaveAttribute('data-step', 'welcome');
  await onStep('welcome');
  await wizard
    .getByRole('button', { name: words('onboarding.welcome.start'), exact: true })
    .click();
  for (const step of BODY_STEPS) {
    await expect(wizard).toHaveAttribute('data-step', step);
    await onStep(step);
    await continueButton(wizard).click();
  }
  await expect(wizard).toHaveAttribute('data-step', 'aiAccess');
  await onStep('aiAccess');
  await fillCustomProvider(wizard);
  await onStep('aiAccess with the Custom provider');
  await continueButton(wizard).click();
  await expect(wizard).toHaveAttribute('data-step', 'planReady');
  await expect(ui(wizard, 'wizard.plan.kcal')).toBeVisible();
  await onStep('planReady');
  await wizard
    .getByRole('button', { name: words('onboarding.planReady.finish'), exact: true })
    .click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(ui(page, 'home.diary.empty')).toBeVisible();
}

/** "+" → a group's page of the menu → one of its rows, with the pointer. */
async function choose(page: Page, group: string | null, item: string): Promise<void> {
  await ui(page, 'home.add').click();
  if (group !== null) await ui(page, `home.add.group.${group}`).click();
  await ui(page, `home.add.${item}`).click();
}

/** "+" → Describe → Enter manually → a name, its kcal and protein → Save. */
async function enterManually(page: Page, name: string, kcal: number, protein: number) {
  await choose(page, 'describe', 'manual');
  const sheet = page.getByRole('dialog', { name: words('log.manual.title') });
  await ui(sheet, 'manual.name').fill(name);
  await ui(sheet, 'manual.energy').fill(String(kcal));
  await ui(sheet, 'manual.protein').fill(String(protein));
  await ui(sheet, 'manual.save').click();
  await expect(sheet).toBeHidden();
}

/** Settings › Tracking & reminders → water and fasting on → Home. */
async function trackWaterAndFasting(page: Page): Promise<void> {
  await ui(page, 'shell.tabbar.settings').click();
  await ui(page, 'settings.category.tracking').click();
  const screen = ui(page, 'screen.settings.tracking');
  for (const hook of ['water.tracking', 'fasting.tracking']) {
    const toggle = ui(screen, hook);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
  await ui(screen, 'settings.back').click();
  await ui(page, 'shell.tabbar.home').click();
  await expect(ui(page, 'home.add')).toBeVisible();
}

/** The Progress tab, read. */
async function openProgress(page: Page): Promise<void> {
  await ui(page, 'shell.tabbar.progress').click();
  await expect(ui(page, 'progress.weight')).toBeVisible();
}

/** A sheet or menu that closes with Escape, then gone. */
async function closeWithEscape(page: Page, layer: Locator): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(layer).toBeHidden();
}

// ---- axe, focus rings and reduced motion, screen by screen -----------------------------------

test.describe('accessibility checks on the main screens, in both themes (ACC-L9-1)', () => {
  // Each screen is checked twice by axe and walked once with the keyboard.
  test.describe.configure({ timeout: 180_000 });

  test('the wizard, each step from Welcome to Plan ready', async ({ page }, testInfo) => {
    await onboard(page, async (step) => {
      const wizard = ui(page, 'screen.onboarding');
      await expect(wizard).toBeVisible();
      await checkScreen(page, testInfo, `wizard: ${step}`);
    });
  });

  test('the + menu, the manual sheet, a food review, then Home with food, water and a fast', async ({
    page,
  }, testInfo) => {
    await onboard(page);
    await trackWaterAndFasting(page);
    await enterManually(page, 'Porridge with berries', 310, 11);
    await choose(page, null, 'water');
    await ui(page, 'water.menu.amount.0').click();

    // While a fast runs the menu holds only the trackers, so the fast comes last.
    await ui(page, 'home.add').click();
    const menu = page.getByRole('menu');
    await expect(ui(menu, 'home.add.group.describe')).toBeVisible();
    // Tab leaves a menu (it closes); its rows are walked with the arrow keys.
    await checkScreen(page, testInfo, 'the + menu', 'ArrowDown');
    await closeWithEscape(page, menu);

    await choose(page, 'describe', 'manual');
    const manual = page.getByRole('dialog', { name: words('log.manual.title') });
    await expect(ui(manual, 'manual.name')).toBeVisible();
    await checkScreen(page, testInfo, 'the manual sheet');
    await ui(manual, 'manual.cancel').click();
    await expect(manual).toBeHidden();

    await choose(page, 'snapScan', 'barcode');
    const scanner = page.getByRole('dialog', { name: words('scan.title') });
    await scanner.getByRole('textbox', { name: words('scan.digits.label') }).fill(OFF_PRODUCT_CODE);
    await scanner.getByRole('button', { name: words('scan.digits.submit') }).click();
    const review = page.getByRole('dialog', { name: words('review.title') });
    await expect(ui(review, 'review.product')).toBeVisible();
    await expect(ui(review, 'review.photo.1')).toBeVisible();
    await checkScreen(page, testInfo, 'a food review (a product)');
    await ui(review, 'review.cancel').click();
    await expect(review).toBeHidden();

    await choose(page, null, 'startFast');
    const start = page.getByRole('dialog', { name: words('fasting.start.title') });
    await ui(start, 'fast.start.go').click();
    await expect(start).toBeHidden();
    await expect(ui(page, 'fast.row')).toHaveAttribute('data-running', '');
    await expect(ui(page, 'toast.message')).toHaveCount(0);
    await checkScreen(page, testInfo, 'Home');
  });

  test('Progress with two weigh-ins, the Log weight sheet and the history', async ({
    page,
  }, testInfo) => {
    await onboard(page);
    await enterManually(page, 'Porridge with berries', 310, 11);
    await openProgress(page);
    await ui(page, 'progress.weight.log').click();
    const logWeight = page.getByRole('dialog', { name: words('progress.logWeight.title') });
    await expect(ui(logWeight, 'progress.logWeight.save')).toBeVisible();
    await checkScreen(page, testInfo, 'the Log weight sheet');
    await ui(logWeight, 'progress.logWeight.unit.kg').click();
    await ui(logWeight, 'progress.logWeight.wheel.whole').selectOption('72');
    await ui(logWeight, 'progress.logWeight.date').fill(LAST_TUESDAY);
    await ui(logWeight, 'progress.logWeight.save').click();
    await expect(logWeight).toBeHidden();
    await ui(page, 'progress.range.month').click();
    const chart = ui(page, 'progress.weight.chart');
    await expect(ui(chart, 'progress.weight.chart.plot').locator('[data-part="dot"]')).toHaveCount(
      2,
    );
    await expect(ui(page, 'progress.nutrition.loading')).toHaveCount(0);
    await checkScreen(page, testInfo, 'Progress');

    await ui(page, 'progress.history').click();
    const history = page.getByRole('dialog', { name: words('progress.history.weight.title') });
    await expect(ui(history, 'progress.history.row')).toHaveCount(2);
    await checkScreen(page, testInfo, 'the weight history');
  });

  test('the Coach, empty and with an answer in Markdown', async ({ page }, testInfo) => {
    await onboard(page);
    await ui(page, 'shell.tabbar.coach').click();
    await expect(ui(page, 'coach.empty')).toBeVisible();
    await checkScreen(page, testInfo, 'the Coach, empty');

    await fakeAi.useReplies(textScript(COACH_ANSWER));
    await page
      .getByRole('textbox', { name: words('coach.composer.label') })
      .fill('How am I doing today?');
    await ui(page, 'coach.send').click();
    const reply = ui(page, 'coach.reply');
    await expect(reply.getByRole('link')).toBeVisible();
    await expect(ui(page, 'coach.typing')).toHaveCount(0);
    await checkScreen(page, testInfo, 'the Coach with an answer');
  });

  test('the Settings list and every Settings page', async ({ page }, testInfo) => {
    await onboard(page);
    await ui(page, 'shell.tabbar.settings').click();
    await expect(ui(page, 'screen.settings')).toBeVisible();
    await checkScreen(page, testInfo, 'Settings');
    // Every page the list shows, then the pages opened from App settings and About.
    const listed = await page
      .locator('[data-ui^="settings.category."]')
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-ui')!.slice('settings.category.'.length)),
      );
    expect(listed).toContain('profile');
    for (const id of [...listed, ...SUB_PAGES]) {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, `#/settings/${id}`);
      const screen = ui(page, `screen.settings.${id}`);
      await expect(screen).toBeVisible();
      await expect(ui(screen, 'settings.pageLoading')).toHaveCount(0);
      await checkScreen(page, testInfo, `Settings › ${id}`);
    }
  });
});

// ---- Values as text (L9) ----------------------------------------------------------------------

test.describe('values as text (L9)', () => {
  test('the gauge, the pillars and the charts give their numbers to a screen reader', async ({
    page,
  }) => {
    await onboard(page);
    await enterManually(page, 'Porridge with berries', 310, 11);

    await test.step('the gauge and the protein pillar describe themselves with the numbers', async () => {
      await expect(ui(page, 'home.gauge')).toHaveAccessibleName(words('home.gauge.heading.kcal'));
      await expect(ui(page, 'home.gauge')).toHaveAccessibleDescription(
        new RegExp(`^${formatInt(310, LOCALE)} `),
      );
      const left = words('home.pillar.left', { amount: '#' }).replace('#', '[\\d,]+');
      await expect(ui(page, 'home.pillar.protein')).toHaveAccessibleDescription(
        new RegExp(`^11 ${left}$`),
      );
    });

    await test.step('the weight chart reads as a table of days and weights', async () => {
      await openProgress(page);
      const table = ui(page, 'progress.weight.chart.table');
      await expect(table).toBeAttached();
      await expect(table.locator('tbody tr')).toHaveCount(1);
      await expect(table.locator('tbody tr th')).toHaveText([/Oct 27, 2026/]);
    });
  });
});

// ---- The keyboard alone -----------------------------------------------------------------------

/**
 * Presses `key` until `target` holds the focus, checking the focus ring at every stop on the way.
 * Fails when the target is not reached within the bound (it cannot be reached by that key).
 */
async function keyTo(page: Page, target: Locator, key = 'Tab'): Promise<void> {
  await forgetStops(page);
  for (let count = 0; count < MAX_STOPS; count++) {
    await page.keyboard.press(key);
    const stop = await focusStop(page);
    if (stop !== null) expect(stop.ring, `a focus ring on ${stop.what}`).toBe(true);
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`${key} never reached ${String(target)}`);
}

test.describe('the keyboard alone', () => {
  test('logs a food entered by hand and a weight, with a focus ring at every stop', async ({
    page,
  }) => {
    await onboard(page);
    // The wizard's Finish was clicked: the walk starts from the top of Home.
    await focusPageStart(page);

    await test.step('Tab to "+", Enter; Describe and Enter manually from the menu', async () => {
      await keyTo(page, ui(page, 'home.add'));
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toBeVisible();
      await keyTo(page, ui(page, 'home.add.group.describe'), 'ArrowDown');
      await page.keyboard.press('Enter');
      await keyTo(page, ui(page, 'home.add.manual'), 'ArrowDown');
      await page.keyboard.press('Enter');
    });

    await test.step('type the name and the calories, Tab to Save, Enter', async () => {
      const sheet = page.getByRole('dialog', { name: words('log.manual.title') });
      await expect(sheet).toBeVisible();
      await keyTo(page, ui(sheet, 'manual.name'));
      await page.keyboard.type('Toast');
      await keyTo(page, ui(sheet, 'manual.energy'));
      await page.keyboard.type('250');
      await keyTo(page, ui(sheet, 'manual.save'));
      await page.keyboard.press('Enter');
      await expect(sheet).toBeHidden();
      await expect(
        ui(page, 'home.meal.breakfast').getByRole('group', {
          name: `Toast ${words('home.energy.kcal', { amount: '250' })}`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(ui(page, 'home.gauge')).toHaveAccessibleDescription(/^250 /);
    });

    await test.step('Tab to the Progress tab, Enter; Tab to Log weight, Enter', async () => {
      await keyTo(page, ui(page, 'shell.tabbar.progress'));
      await page.keyboard.press('Enter');
      await expect(ui(page, 'progress.weight')).toBeVisible();
      await keyTo(page, ui(page, 'progress.weight.log'));
      await page.keyboard.press('Enter');
    });

    await test.step('kg with the arrow keys, 71 on the whole wheel, Save', async () => {
      const sheet = page.getByRole('dialog', { name: words('progress.logWeight.title') });
      await expect(sheet).toBeVisible();
      await keyTo(page, ui(sheet, 'progress.logWeight.unit.lb'));
      await page.keyboard.press('ArrowLeft');
      await expect(ui(sheet, 'progress.logWeight.unit.kg')).toHaveAttribute('aria-checked', 'true');
      const whole = ui(sheet, 'progress.logWeight.wheel.whole');
      await expect(whole).toHaveValue('70');
      await keyTo(page, whole);
      await page.keyboard.press('ArrowDown');
      await expect(whole).toHaveValue('71');
      await keyTo(page, ui(sheet, 'progress.logWeight.save'));
      await page.keyboard.press('Enter');
      await expect(sheet).toBeHidden();
      await expect(ui(page, 'progress.weight.current')).toContainText(
        words('onboarding.wizard.weight.shownKg', { value: '71.0' }),
      );
    });
  });
});

// ---- Reduced motion ---------------------------------------------------------------------------

/** The Welcome step's Get started button: its transitions follow the motion tokens. */
async function welcomeTransition(page: Page): Promise<string> {
  await page.goto('/');
  const start = ui(page, 'wizard.start');
  await expect(start).toBeVisible();
  return start.evaluate((element) => getComputedStyle(element).transitionDuration);
}

test.describe('reduced motion', () => {
  test('with reduce, the motion tokens are 1 ms and transitions take that long', async ({
    page,
  }) => {
    expect(await welcomeTransition(page)).toBe('0.001s, 0.001s');
    const base = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--motion-base').trim(),
    );
    expect(base).toBe('1ms');
  });

  test.describe('without a preference', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('the same transitions take their normal length', async ({ page }) => {
      expect(await welcomeTransition(page)).toBe('0.14s, 0.14s');
    });
  });
});
