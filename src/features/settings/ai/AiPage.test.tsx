import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { complete } from '../../../ai/client';
import type { ImageBackend } from '../../../ai/image';
import { DEFAULT_AI_SETTINGS, roleFor } from '../../../ai/settings';
import { fakeFetch } from '../../../ai/testing/fakeFetch';
import { anthropicAnswer, geminiError } from '../../../ai/testing/wire';
import { createSecretsRepo } from '../../../data/repos/secretsRepo';
import { createAiAccess } from '../../../services/aiAccess';
import { untilLoaded } from '../../../test/lazy';
import { closeHarnesses, openHarness, untilShown, type Harness } from '../../../test/screenHarness';
import { categoryFor, SETTINGS_CATEGORIES } from '../registry';
import { SettingsScreen } from '../SettingsScreen';
import { card, formWords, openAiPage, pageWords, pickers } from './testing/openAiPage';

afterEach(closeHarnesses);

beforeAll(async () => {
  // Fetched on first open in the app; loaded here first so no wait includes its transform.
  await import('./AiPage');
});

const GEMINI_KEY = 'AIzaSyD-4fA9xQ2mZ7bW1cR8tY5uI3oP6aS0dF4';
const ANTHROPIC_KEY = 'sk-ant-api03-Zq8Lm2Np4Rt6Vx8Bz0Cd2Fh4Jk6';
const OPENAI_KEY = 'sk-proj-4fA9xQ2mZ7bW1cR8tY5u';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** The main provider set up as onboarding leaves it: Gemini, its default model, its key. */
async function geminiSetUp(h: Harness): Promise<void> {
  await h.repos.settingsRepo.set('ai.settings', DEFAULT_AI_SETTINGS);
  await createSecretsRepo(h.db).set('gemini', GEMINI_KEY);
}

const field = (name: string) => screen.getByRole('textbox', { name });
const storedAi = async (h: Harness) => h.repos.settingsRepo.get('ai.settings');

/** Reads any photo as a tiny JPEG. */
const backend: ImageBackend = {
  decode: () =>
    Promise.resolve({
      width: 800,
      height: 600,
      toJpeg: () => Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0)),
      close: () => undefined,
    }),
};

describe('AiPage', () => {
  it('is listed with the preferences right after Tracking, and is fetched on first open', async () => {
    expect(categoryFor(['ai'])).toMatchObject({
      id: 'ai',
      titleKey: 'aiSetup.page.title',
      group: 'prefs',
    });
    const prefs = SETTINGS_CATEGORIES.filter((category) => category.group === 'prefs').map(
      (category) => category.id,
    );
    expect(prefs.indexOf('ai')).toBe(prefs.indexOf('tracking') + 1);

    const h = await openHarness({ hash: '#/settings/ai' });
    h.mount(<SettingsScreen nested={['ai']} />);
    expect(screen.getByRole('heading', { level: 1, name: pageWords.title })).toBeVisible();
    await untilLoaded();
    await untilShown('[data-ui="ai.primary.provider"]');
  });

  it('says plainly that keys stay in this browser, which cannot fully shield them (ACC-J8-2, D-16.7)', async () => {
    await openAiPage({ prepare: geminiSetUp });

    expect(screen.getByText(pageWords.storage)).toBeVisible();
    const main = card(pageWords.roles.primary.heading);
    expect(
      within(main).getByText(formWords.key.device.replace('{provider}', 'Gemini')),
    ).toBeVisible();
  });

  it('shows the answer length limit with Gemini as the main provider, and stores a new one (ACC-E12-1, R03.9)', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({ prepare: geminiSetUp });

    expect(pickers(card(pageWords.roles.primary.heading)).provider).toHaveValue('gemini');
    const limit = field(pageWords.limits.maxTokens.label);
    expect(limit).toBeVisible();
    expect(limit).toHaveValue('8192');

    await user.clear(limit);
    await user.type(limit, '2048');
    await user.tab();
    await h.settled();
    expect((await storedAi(h))?.maxTokens).toBe(2_048);

    // Below the minimum it stores 1, and the field shows what was stored.
    await user.clear(limit);
    await user.type(limit, '0');
    await user.tab();
    await h.settled();
    expect((await storedAi(h))?.maxTokens).toBe(1);
    expect(limit).toHaveValue('1');
  });

  it('clamps Give up after to 30–600 seconds: 10 becomes 30, and letters change nothing (D-16.23)', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({ prepare: geminiSetUp });
    const timeout = field(pageWords.limits.timeout.label);
    expect(timeout).toHaveValue('180');

    await user.clear(timeout);
    await user.type(timeout, '10{Enter}');
    await h.settled();
    expect(timeout).toHaveValue('30');
    expect((await storedAi(h))?.timeoutSec).toBe(30);

    await user.clear(timeout);
    await user.type(timeout, 'soon');
    await user.tab();
    await h.settled();
    expect(timeout).toHaveValue('30');
    expect((await storedAi(h))?.timeoutSec).toBe(30);
  });

  it('shows the reasoning effort while OpenRouter is the text standby, and stores the effort', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({ prepare: geminiSetUp });
    const effortPicker = () =>
      screen.queryByRole('combobox', { name: pageWords.limits.effort.label });
    expect(effortPicker()).toBeNull();

    const standby = card(pageWords.roles.textStandby.heading);
    const toggle = within(standby).getByRole('switch', {
      name: pageWords.roles.textStandby.switch,
    });
    await user.click(toggle);
    await user.selectOptions(pickers(standby).provider, 'openrouter');

    expect(effortPicker()).toHaveValue('auto');
    await user.selectOptions(effortPicker()!, 'high');
    await h.settled();
    expect(await storedAi(h)).toMatchObject({
      openRouterEffort: 'high',
      textStandby: { on: true },
    });

    // Switched off, OpenRouter fills no role any more.
    await user.click(toggle);
    expect(effortPicker()).toBeNull();
    await h.settled();
  });

  it('makes photo requests fall back to the photo standby set here (ACC-J8-1)', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({ prepare: geminiSetUp });

    const standby = card(pageWords.roles.imageStandby.heading);
    await user.click(
      within(standby).getByRole('switch', { name: pageWords.roles.imageStandby.switch }),
    );
    await user.selectOptions(pickers(standby).provider, 'anthropic');
    await user.click(within(standby).getByLabelText(formWords.key.label));
    await user.paste(ANTHROPIC_KEY);
    await h.settled();
    expect(within(standby).getByText('Saved key: sk-a…4Jk6')).toBeVisible();

    // A food photo, as the analysis sends it, with what is now stored.
    const stored = await createAiAccess({
      settingsRepo: h.repos.settingsRepo,
      secretsRepo: createSecretsRepo(h.db),
    })();
    const fake = fakeFetch()
      .on(GEMINI_URL, { status: 401, json: geminiError(401, 'UNAUTHENTICATED', 'Bad key.') })
      .on(ANTHROPIC_URL, { json: anthropicAnswer('{"name": "Lentil soup"}') });
    const result = await complete(
      {
        purpose: 'mealPhotos',
        images: [new Blob([new Uint8Array(4)], { type: 'image/jpeg' })],
        system: 'Read the meal.',
        prompt: 'What is on the plate?',
        json: true,
      },
      { settings: stored.settings, keys: stored.keys, fetch: fake.fetch, imageBackend: backend },
    );

    expect(result).toEqual({ ok: true, value: '{"name": "Lentil soup"}' });
    expect(fake.requests.map((request) => new URL(request.url).host)).toEqual([
      'generativelanguage.googleapis.com',
      'api.anthropic.com',
    ]);
  });

  it('forgets a key: it leaves storage, and the card asks for one again', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({ prepare: geminiSetUp });
    const main = card(pageWords.roles.primary.heading);
    expect(within(main).getByText('Saved key: AIza…0dF4')).toBeVisible();

    await user.click(within(main).getByRole('button', { name: 'Forget the Gemini key' }));
    await h.settled();

    expect(await createSecretsRepo(h.db).get('gemini')).toBeNull();
    expect(within(main).queryByText('Saved key: AIza…0dF4')).toBeNull();
    expect(within(main).getByText(formWords.key.missing)).toBeVisible();
  });

  it('shares a key per provider: one pasted in a standby card is the main provider’s too', async () => {
    const user = userEvent.setup();
    const h = await openAiPage();
    const main = card(pageWords.roles.primary.heading);
    expect(within(main).getByText(formWords.key.missing)).toBeVisible();

    const standby = card(pageWords.roles.imageStandby.heading);
    await user.click(
      within(standby).getByRole('switch', { name: pageWords.roles.imageStandby.switch }),
    );
    // On Gemini too, so it starts on Gemini's next model, not the main provider's.
    expect(pickers(standby).model).toHaveValue('gemini-3.8-flash');
    await user.click(within(standby).getByLabelText(formWords.key.label));
    await user.paste(GEMINI_KEY);
    await h.settled();

    expect(within(main).getByText('Saved key: AIza…0dF4')).toBeVisible();
    expect(within(main).queryByText(formWords.key.missing)).toBeNull();
    expect((await storedAi(h))?.imageStandby).toEqual({
      on: true,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });

  it('stores Different model for text as on only once its choice is complete', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({
      prepare: async (harness) => {
        await harness.repos.settingsRepo.set('ai.settings', {
          ...DEFAULT_AI_SETTINGS,
          primary: { provider: 'openai', model: 'gpt-6-luna' },
        });
        await createSecretsRepo(harness.db).set('openai', OPENAI_KEY);
      },
    });
    const text = card(pageWords.roles.textRole.heading);

    // Its model starts on Gemini, whose key is not saved: the switch shows on, nothing changes.
    await user.click(within(text).getByRole('switch', { name: pageWords.roles.textRole.switch }));
    await h.settled();
    expect(within(text).getByText(pageWords.pending)).toBeVisible();
    const before = await storedAi(h);
    expect(before?.textRole.on).toBe(false);
    expect(roleFor({}, before ?? DEFAULT_AI_SETTINGS).provider).toBe('openai');

    await user.click(within(text).getByLabelText(formWords.key.label));
    await user.paste(GEMINI_KEY);
    await h.settled();
    expect((await storedAi(h))?.textRole).toEqual({
      on: true,
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
    });
  });

  it('stores the notes for the AI trimmed', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({ prepare: geminiSetUp });
    const notes = screen.getByRole('textbox', { name: pageWords.notes.label });

    await user.type(notes, '  I live in Lyon and cook with olive oil.  {Enter}');
    await user.click(screen.getByRole('button', { name: pageWords.notes.save }));
    await h.settled();

    expect((await storedAi(h))?.instructions).toBe('I live in Lyon and cook with olive oil.');
    expect(notes).toHaveValue('I live in Lyon and cook with olive oil.');
  });
});
