/**
 * The Coach end to end (P08-14, Demo 5). Each test starts from an empty browser, walks the wizard
 * on its defaults (the goal is "maintain") with the AI as the Custom provider at the fake's
 * loopback address (`plan-ok`), and opens the Coach tab. Then it talks to the fake: a question it
 * answers after a `food_log` call on the person's own diary, a card and a chip (the chip with a
 * photo), a turn that fails and is retried, a slow reply cut off by Clear chat, enough short
 * exchanges to pass the 200-message cap, and (P13) a reminder the fake proposes, added from its
 * card and found in Settings › Tracking & reminders. As in the logging spec, every request off
 * loopback is aborted and fails the test.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { failureMessages } from '../src/ai/errors';
import { NUTRITION_TOOL_NAMES, REMINDER_TOOL_NAME } from '../src/services/coach/toolSchemas';
import { CHAT_PATH, readNamedScript, type RecordedRequest } from './fake-ai/server';
import {
  FAKE_AI_BASE_URL,
  LOCALE,
  MEAL_PHOTO,
  answerOf,
  fakeAi,
  hooksSeen,
  imagesSent,
  messagesSent,
  questionsSent,
  recordHooks,
  recordTexts,
  routeFoodDatabases,
  textScript,
  textsSeen,
  toolResultsSent,
  toolsOffered,
  ui,
  words,
  type FoodDatabaseLog,
} from './support';

test.use({ ...devices['Pixel 7'], locale: LOCALE, timezoneId: 'UTC', reducedMotion: 'reduce' });

/**
 * 08:30 UTC on a Sunday: yesterday is in the same week of the week bar (weeks start on Monday)
 * and inside the range `coach-tool` asks `food_log` for, 2026-10-19 to 2026-10-25.
 */
const START = new Date('2026-10-25T08:30:00Z');
const YESTERDAY = '2026-10-24';

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

/** The waiting dots and the error banner: every appearance is recorded (`recordHooks`). */
const WATCHED = ['coach.typing', 'coach.error'] as const;

/** The default goal's suggested questions, in the order the cards and the chip row show them. */
const CHIPS = [
  words('coach.chips.maintain.stable'),
  words('coach.chips.maintain.average'),
  words('coach.chips.maintain.macros'),
  words('coach.chips.maintain.trend'),
] as const;

const COACH_TOOL = readNamedScript('coach-tool');
const COACH_REMINDER = readNamedScript('coach-reminder');
const FAIL_THEN_OK = readNamedScript('coach-fail-then-ok');
const SLOW = readNamedScript('coach-slow');

/** The id of `coach-tool`'s one `food_log` call, which the tool's result must answer. */
const FOOD_LOG_CALL_ID = 'call_fake_food_log_1';

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

/**
 * Makes the browser allow notifications from each document's start, as a person who pressed
 * Allow: headless Chromium reads `denied` even after `grantPermissions` (as in the reminders spec).
 */
async function allowNotifications(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const prompt = window.Notification as typeof Notification | undefined;
    if (prompt === undefined) return;
    Object.defineProperty(prompt, 'permission', { configurable: true, get: () => 'granted' });
    Object.defineProperty(prompt, 'requestPermission', {
      configurable: true,
      value: (): Promise<NotificationPermission> => Promise.resolve('granted'),
    });
  });
}

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

/** The Coach tab from the tab bar: an empty chat with four cards, Clear chat off. */
async function openEmptyCoach(page: Page): Promise<void> {
  await ui(page, 'shell.tabbar.coach').click();
  await expect(page).toHaveURL(/#\/coach$/);
  const empty = ui(page, 'coach.empty');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('heading', { name: words('coach.empty.title') })).toBeVisible();
  await expect(ui(empty, 'coach.cards').getByRole('button')).toHaveText([...CHIPS]);
  await expect(ui(page, 'coach.reset')).toBeDisabled();
}

/** Types `question` into the composer and presses Send; the field empties. */
async function ask(page: Page, question: string): Promise<void> {
  const field = page.getByRole('textbox', { name: words('coach.composer.label') });
  await expect(field).toHaveAttribute('data-ui', 'coach.input');
  await field.fill(question);
  const send = page.getByRole('button', { name: words('coach.composer.send'), exact: true });
  await expect(send).toHaveAttribute('data-ui', 'coach.send');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(field).toHaveValue('');
}

// ---- What the chat shows and what the fake was asked ------------------------------------------

/** One message as the chat shows it: who said it and the words. */
type Said = readonly ['user' | 'assistant', string];

function messages(page: Page): Locator {
  return ui(ui(page, 'coach.list'), 'coach.message');
}

/** The words of a message: the person's as typed, the Coach's as its rendered reply. */
async function expectMessage(message: Locator, [role, text]: Said): Promise<void> {
  await expect(message).toHaveAttribute('data-role', role);
  await expect(role === 'user' ? message : ui(message, 'coach.reply')).toHaveText(text);
}

/** The conversation is exactly `said`, oldest first. */
async function expectChat(page: Page, said: readonly Said[]): Promise<void> {
  const shown = messages(page);
  await expect(shown).toHaveCount(said.length);
  for (const [index, message] of said.entries()) await expectMessage(shown.nth(index), message);
}

/** The Coach's requests to the fake, oldest first: they offer tools, the wizard's plan does not. */
async function coachRequests(): Promise<RecordedRequest[]> {
  return (await fakeAi.requests()).filter((request) => toolsOffered(request).length > 0);
}

/**
 * The conversation and the composer in both themes: no serious or critical axe finding (the
 * rules and impacts of the a11y spec).
 */
async function expectAxeClean(page: Page): Promise<void> {
  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const results = await new AxeBuilder({ page })
      .include('[data-ui="screen.coach"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    const blocking = results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${theme}: ${violation.id} ${violation.nodes.map((n) => n.target)}`);
    expect(blocking).toEqual([]);
  }
}

// ---- The flows --------------------------------------------------------------------------------

test.describe('coach chat (Demo 5)', () => {
  test('answers "What did I eat yesterday?" from a food_log call, copies the reply and keeps the chat over a reload (ACC-I7-1, ACC-I10-2)', async ({
    page,
    context,
  }) => {
    const question = 'What did I eat yesterday?';
    const answer = answerOf(COACH_TOOL.replies[1]);
    const porridge = 'Porridge with berries';
    await onboard(page);

    await test.step('yesterday in the week bar → a porridge entered by hand', async () => {
      await ui(page, 'home.week').locator(`[data-day="${YESTERDAY}"]`).click();
      await ui(page, 'home.add').click();
      await page.getByRole('menuitem', { name: words('menu.group.describe') }).click();
      await page.getByRole('menuitem', { name: words('menu.method.manual') }).click();
      const sheet = page.getByRole('dialog', { name: words('log.manual.title') });
      await sheet.getByRole('textbox', { name: words('log.manual.name') }).fill(porridge);
      await sheet.getByRole('textbox', { name: words('log.manual.energy.kcal') }).fill('310');
      await ui(sheet, 'manual.save').click();
      await expect(sheet).toBeHidden();
      await expect(ui(page, 'entry.row')).toHaveCount(1);
    });

    await test.step('the Coach tab opens on the empty chat', async () => {
      await openEmptyCoach(page);
    });

    await test.step('the question → the fake calls food_log → the answer shows', async () => {
      await fakeAi.useScript('coach-tool');
      await ask(page, question);
      await expectChat(page, [
        ['user', question],
        ['assistant', answer],
      ]);
      await expect(ui(page, 'coach.reset')).toBeEnabled();
      expect(await hooksSeen(page)).not.toContain('coach.error');
    });

    await test.step('the fake was asked twice and got one tool result: yesterday’s porridge', async () => {
      const asked = await coachRequests();
      expect(asked).toHaveLength(2);
      const [first, second] = asked as [RecordedRequest, RecordedRequest];
      expect(toolsOffered(first)).toEqual([...NUTRITION_TOOL_NAMES, REMINDER_TOOL_NAME]);
      expect(questionsSent(first)).toEqual([question]);
      expect(toolResultsSent(first)).toEqual([]);
      // Food names reach the model only through a tool, never in the context.
      expect(JSON.stringify(first.body)).not.toContain(porridge);

      const results = toolResultsSent(second);
      expect(results).toHaveLength(1);
      const [result] = results as [Record<string, unknown>];
      expect(result.tool_call_id).toBe(FOOD_LOG_CALL_ID);
      expect(typeof result.content).toBe('string');
      expect(JSON.parse(result.content as string)).toMatchObject({
        from: '2026-10-19',
        to: '2026-10-25',
        count: 1,
        items: [{ date: YESTERDAY, name: porridge, kcal: 310, meal: 'breakfast' }],
      });
      // The call it answers is echoed just before it, as the model sent it.
      const sent = messagesSent(second);
      expect(sent.at(-2)).toMatchObject({
        role: 'assistant',
        tool_calls: [{ id: FOOD_LOG_CALL_ID }],
      });
      expect(questionsSent(second)).toEqual([question]);
    });

    await test.step('Copy puts the reply on the clipboard, as written', async () => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const reply = messages(page).nth(1);
      await ui(reply, 'coach.copy').click();
      await expect(page.getByText(words('coach.copy.done'))).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(answer);
    });

    await test.step('after a reload the chat is still there, with the chip row', async () => {
      await page.reload();
      await expect(page).toHaveURL(/#\/coach$/);
      await expectChat(page, [
        ['user', question],
        ['assistant', answer],
      ]);
      await expect(ui(page, 'coach.chips').getByRole('button')).toHaveText([...CHIPS]);
      await expect(ui(page, 'coach.reset')).toBeEnabled();
      expect(await coachRequests()).toHaveLength(2);
    });
  });

  test('sends a card at once, then a chip with the attached photo, keeping the typed words (D-16.33, D-16.85, R04.14)', async ({
    page,
  }) => {
    const cardAnswer = 'Your weight has held within half a kilogram for two weeks: that is stable.';
    const chipAnswer = 'On an average day you eat about 2,300 kcal, close to your plan.';
    const typed = 'And on weekends?';
    await onboard(page);
    await openEmptyCoach(page);
    await fakeAi.useReplies(textScript(cardAnswer, chipAnswer));

    await test.step('the first card sends its words at once, and the answer shows', async () => {
      const card = ui(page, 'coach.card.1');
      await expect(card).toHaveText(CHIPS[0]);
      await card.click();
      await expectChat(page, [
        ['user', CHIPS[0]],
        ['assistant', cardAnswer],
      ]);
      // The dots showed while the reply was on its way; no failure did.
      const seen = await hooksSeen(page);
      expect(seen).toContain('coach.typing');
      expect(seen).not.toContain('coach.error');
      const [asked] = (await coachRequests()) as [RecordedRequest];
      expect(questionsSent(asked)).toEqual([CHIPS[0]]);
      expect(imagesSent(asked)).toBe(0);
    });

    await test.step('with a conversation the chips are a row under it', async () => {
      await expect(ui(page, 'coach.empty')).toHaveCount(0);
      const row = ui(page, 'coach.chips');
      await expect(row.getByRole('button')).toHaveText([...CHIPS]);
      for (const [index, text] of CHIPS.entries()) {
        await expect(ui(row, `coach.chip.${index + 1}`)).toHaveText(text);
      }
    });

    await test.step('words typed and a photo picked from the library wait in the composer', async () => {
      await ui(page, 'coach.input').fill(typed);
      const attach = page.getByRole('button', { name: words('coach.composer.attach') });
      await expect(attach).toHaveAttribute('data-ui', 'coach.attach');
      await attach.click();
      const library = page.getByRole('menuitem', { name: words('coach.composer.library') });
      await expect(library).toHaveAttribute('data-ui', 'coach.attach.library');
      await expect(ui(page, 'coach.attach.camera')).toHaveText(words('coach.composer.camera'));
      const chooser = page.waitForEvent('filechooser');
      await library.click();
      await (await chooser).setFiles(MEAL_PHOTO);
      await expect(ui(page, 'coach.preview')).toBeVisible();
    });

    await test.step('the second chip sends its words with the photo; the typed words stay', async () => {
      await ui(page, 'coach.chip.2').click();
      await expect(ui(page, 'coach.preview')).toHaveCount(0);
      await expectChat(page, [
        ['user', CHIPS[0]],
        ['assistant', cardAnswer],
        ['user', CHIPS[1]],
        ['assistant', chipAnswer],
      ]);
      await expect(ui(messages(page).nth(2), 'coach.message.photo')).toBeVisible();
      await expect(ui(page, 'coach.input')).toHaveValue(typed);
    });

    await test.step('the second request carried the chip’s words and one image, not the draft', async () => {
      const asked = await coachRequests();
      expect(asked).toHaveLength(2);
      const second = asked[1] as RecordedRequest;
      expect(imagesSent(second)).toBe(1);
      expect(questionsSent(second).at(-1)).toBe(CHIPS[1]);
      expect(JSON.stringify(second.body)).not.toContain(typed);
    });
  });

  test('shows a failed turn with Details, and Retry answers it without asking twice (D-16.31, R04.4)', async ({
    page,
  }) => {
    const question = 'Is my intake right for keeping my weight?';
    const providerMessage = (FAIL_THEN_OK.replies[0]?.body as { error: { message: string } }).error
      .message;
    const answer = answerOf(FAIL_THEN_OK.replies[1]);
    const banner = ui(page, 'coach.error');
    await onboard(page);
    await openEmptyCoach(page);
    await fakeAi.useScript('coach-fail-then-ok');

    await test.step('the question → the provider fails → the banner under the question', async () => {
      await ask(page, question);
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute('data-kind', 'generic');
      const friendly = failureMessages({ kind: 'generic' }).map((line) =>
        words(line.key, line.params),
      );
      await expect(banner.getByRole('alert').locator('p')).toHaveText(friendly);
      // Our words, never the provider's, until Details is pressed.
      await expect(banner).not.toContainText(providerMessage);
      await expectChat(page, [['user', question]]);
    });

    await test.step('Details shows the provider’s own message', async () => {
      const details = banner.getByRole('button', { name: words('coach.error.details') });
      await expect(details).toHaveAttribute('data-ui', 'coach.details');
      await expect(details).toHaveAttribute('aria-expanded', 'false');
      await details.click();
      await expect(details).toHaveAttribute('aria-expanded', 'true');
      await expect(ui(banner, 'coach.details.text')).toHaveText(providerMessage);
    });

    await test.step('Retry: the answer shows under the one question', async () => {
      const retry = banner.getByRole('button', { name: words('common.retry') });
      await expect(retry).toHaveAttribute('data-ui', 'coach.retry');
      await retry.click();
      await expectChat(page, [
        ['user', question],
        ['assistant', answer],
      ]);
      await expect(banner).toHaveCount(0);
    });

    await test.step('both requests carried the question once', async () => {
      const asked = await coachRequests();
      expect(asked).toHaveLength(2);
      for (const request of asked) expect(questionsSent(request)).toEqual([question]);
    });

    await test.step('after a reload: the question and its answer, no banner', async () => {
      await page.reload();
      await expectChat(page, [
        ['user', question],
        ['assistant', answer],
      ]);
      await expect(banner).toHaveCount(0);
    });
  });

  test('clears the chat while a slow reply is pending, and that reply never arrives (ACC-I5-1, R04.6, D-16.34)', async ({
    page,
  }) => {
    const question = 'How is my week going?';
    const lateAnswer = answerOf(SLOW.replies[0]);
    const nextAnswer = answerOf(SLOW.replies[1]);
    const abandoned: string[] = [];
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).pathname === CHAT_PATH) {
        abandoned.push(request.failure()?.errorText ?? 'unknown');
      }
    });
    await recordTexts(page, [lateAnswer]);
    await onboard(page);
    await openEmptyCoach(page);
    await fakeAi.useScript('coach-slow');
    const typing = ui(page, 'coach.typing');
    const reset = page.getByRole('button', { name: words('coach.page.reset') });
    const dialog = page.getByRole('alertdialog', { name: words('coach.page.confirm.title') });

    await test.step('the question → the fake holds its answer; the dots show, the chips wait', async () => {
      await ask(page, question);
      await expectChat(page, [['user', question]]);
      await expect(typing).toBeVisible();
      await expect.poll(async () => (await coachRequests()).length).toBe(1);
      await expect(ui(page, 'coach.chip.1')).toBeDisabled();
      await expect(ui(page, 'coach.attach')).toBeDisabled();
    });

    await test.step('Clear chat → Cancel keeps everything as it was', async () => {
      await expect(reset).toHaveAttribute('data-ui', 'coach.reset');
      await reset.click();
      await expect(dialog).toHaveAttribute('data-ui', 'coach.resetDialog');
      await ui(dialog, 'coach.resetDialog.cancel').click();
      await expect(dialog).toBeHidden();
      await expectChat(page, [['user', question]]);
      await expect(typing).toBeVisible();
    });

    await test.step('Clear chat → Clear: the chat is empty at once and the request is dropped', async () => {
      await reset.click();
      const clear = ui(dialog, 'coach.resetDialog.confirm');
      await expect(clear).toHaveText(words('coach.page.confirm.clear'));
      await clear.click();
      await expect(dialog).toBeHidden();
      await expect(ui(page, 'coach.empty')).toBeVisible();
      await expect(ui(page, 'coach.message')).toHaveCount(0);
      await expect(typing).toHaveCount(0);
      await expect(reset).toBeDisabled();
      // The browser gave the request up, so the held answer has nowhere to arrive.
      await expect.poll(() => abandoned).toEqual(['net::ERR_ABORTED']);
    });

    await test.step('a card gets the next answer: the chat holds only that exchange', async () => {
      await ui(page, 'coach.card.1').click();
      await expectChat(page, [
        ['user', CHIPS[0]],
        ['assistant', nextAnswer],
      ]);
      expect(await coachRequests()).toHaveLength(2);
      expect(await textsSeen(page)).toEqual([]);
    });

    await test.step('after a reload the same exchange, and nothing of the cleared chat', async () => {
      await page.reload();
      await expectChat(page, [
        ['user', CHIPS[0]],
        ['assistant', nextAnswer],
      ]);
      expect(await textsSeen(page)).toEqual([]);
    });
  });

  test('keeps the newest 200 messages after 101 exchanges, also after a reload (D-16.29, R04.8)', async ({
    page,
  }) => {
    // 101 exchanges one after another (Send waits for each answer): a budget of its own.
    test.setTimeout(240_000);
    const exchanges = 101;
    const question = (n: number): string => `Question ${n}?`;
    const answer = (n: number): string => `Answer ${n}.`;
    await onboard(page);
    await openEmptyCoach(page);
    await fakeAi.useReplies(
      textScript(...Array.from({ length: exchanges }, (_, index) => answer(index + 1))),
    );
    const shown = messages(page);
    const field = ui(page, 'coach.input');
    const send = ui(page, 'coach.send');
    const newestReply = ui(shown.last(), 'coach.reply');

    await test.step(`${exchanges - 1} exchanges: all 200 messages, from the first question`, async () => {
      for (let n = 1; n < exchanges; n += 1) {
        await field.fill(question(n));
        // Send waits until the previous reply is no longer pending.
        await send.click();
        await expect(newestReply).toHaveText(answer(n));
      }
      await expect(shown).toHaveCount(200);
      await expectMessage(shown.first(), ['user', question(1)]);
    });

    await test.step('one more: still 200, the first question and its answer gone', async () => {
      await ask(page, question(exchanges));
      await expectMessage(shown.last(), ['assistant', answer(exchanges)]);
      await expect(shown).toHaveCount(200);
      await expectMessage(shown.first(), ['user', question(2)]);
      await expectMessage(shown.nth(1), ['assistant', answer(2)]);
    });

    await test.step('every request carried at most 20 messages of the conversation', async () => {
      const asked = await coachRequests();
      expect(asked).toHaveLength(exchanges);
      for (const request of asked) {
        const conversation = messagesSent(request).filter((message) => message.role !== 'system');
        expect(conversation.length).toBeLessThanOrEqual(20);
      }
    });

    await test.step('after a reload the same 200', async () => {
      await page.reload();
      await expect(shown).toHaveCount(200);
      await expectMessage(shown.first(), ['user', question(2)]);
      await expectMessage(shown.last(), ['assistant', answer(exchanges)]);
    });
  });
});

test.describe('reminders through the Coach (P13, D-16.93)', () => {
  test('adds the reminder the Coach proposed from its card, and it is in Settings › Tracking & reminders', async ({
    page,
  }) => {
    const question = 'Remind me to drink a glass of water every day at 10.';
    const answer = answerOf(COACH_REMINDER.replies[1]);
    const reminder = 'Drink a glass of water';
    const when = words('reminders.yours.everyDay', { time: '10:00 AM' });
    const card = ui(page, 'coach.reminderCard');
    await allowNotifications(page);
    await onboard(page);
    await openEmptyCoach(page);

    await test.step('the question → the fake proposes a reminder → a card under the answer', async () => {
      await fakeAi.useScript('coach-reminder');
      await ask(page, question);
      await expectChat(page, [
        ['user', question],
        ['assistant', answer],
      ]);
      await expect(ui(messages(page).nth(1), 'coach.reminderCard')).toBeVisible();
      await expect(card).toHaveAttribute('data-status', 'proposed');
      await expect(ui(card, 'coach.reminderCard.text')).toHaveText(reminder);
      await expect(ui(card, 'coach.reminderCard.when')).toHaveText(when);
      await expect(ui(card, 'coach.reminderCard.dismiss')).toHaveText(
        words('coach.reminder.dismiss'),
      );
      await expectAxeClean(page);
    });

    await test.step('the fake was offered propose_reminder and told the reminder waits for Add', async () => {
      const asked = await coachRequests();
      expect(asked).toHaveLength(2);
      expect(toolsOffered(asked[0]!)).toContain(REMINDER_TOOL_NAME);
      const [result] = toolResultsSent(asked[1]!) as [Record<string, unknown>];
      expect(result.tool_call_id).toBe('call_fake_propose_reminder_1');
      const told = JSON.parse(result.content as string) as Record<string, unknown>;
      expect(told).toMatchObject({
        proposed: true,
        reminder: { text: reminder, time: '10:00', days: 'daily' },
      });
      expect(String(told.note)).toContain('Nothing is set until they tap Add');
    });

    await test.step('Add → the card says it was added, with the way to Settings', async () => {
      await ui(card, 'coach.reminderCard.add').click();
      await expect(card).toHaveAttribute('data-status', 'added');
      await expect(ui(card, 'coach.reminderCard.added')).toHaveText(words('coach.reminder.added'));
      await expect(ui(card, 'coach.reminderCard.add')).toHaveCount(0);
      // The browser allowed notifications, so the reminder is on and nothing more is said.
      await expect(ui(card, 'coach.reminderCard.off')).toHaveCount(0);
      await expectAxeClean(page);
    });

    await test.step('after a reload the card still says added, with no Add', async () => {
      await page.reload();
      await expect(page).toHaveURL(/#\/coach$/);
      await expect(card).toHaveAttribute('data-status', 'added');
      await expect(ui(card, 'coach.reminderCard.add')).toHaveCount(0);
    });

    await test.step('the link opens Settings › Tracking & reminders › Your reminders with it, on', async () => {
      await ui(card, 'coach.reminderCard.settings').click();
      await expect(page).toHaveURL(/#\/settings\/tracking$/);
      const yours = ui(ui(page, 'screen.settings.tracking'), 'reminders.yours');
      const row = yours.getByRole('switch', { name: reminder });
      await expect(row).toHaveAttribute('aria-checked', 'true');
      await expect(row).toHaveAccessibleDescription(when);
      await expect(ui(yours, 'reminders.yours.item')).toHaveCount(1);
    });
  });
});
