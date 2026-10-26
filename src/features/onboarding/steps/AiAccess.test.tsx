import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeAiSettings, missingFor, roleFor } from '../../../ai/settings';
import { DataProvider, type DataSources } from '../../../data/DataProvider';
import { createBodyFatRepo } from '../../../data/repos/bodyFatRepo';
import { createCoachRepo } from '../../../data/repos/coachRepo';
import { createDiaryRepo } from '../../../data/repos/diaryRepo';
import { createFastRepo } from '../../../data/repos/fastRepo';
import { createProfileRepo } from '../../../data/repos/profileRepo';
import { createSavedMealsRepo } from '../../../data/repos/savedMealsRepo';
import { createSecretsRepo } from '../../../data/repos/secretsRepo';
import { createSettingsRepo } from '../../../data/repos/settingsRepo';
import { createWaterRepo } from '../../../data/repos/waterRepo';
import { createWeightRepo } from '../../../data/repos/weightRepo';
import { aiSetup } from '../../../i18n/en/aiSetup';
import { common } from '../../../i18n/en/common';
import { onboarding } from '../../../i18n/en/onboarding';
import { fixedClock } from '../../../lib/clock';
import {
  createAiSetupService,
  type AiChoice,
  type AiSetupService,
  type SavedChoice,
} from '../../../services/aiSetup';
import { ServicesProvider, type Services } from '../../../services/context';
import { openTestDb } from '../../../test/db';
import { FACTORY_NOW } from '../../../test/factories';
import { TEST_TODAY, wizardAt } from '../testing/renderWizard';
import type { WizardState } from '../wizard';
import { WizardPage } from '../WizardPage';
import { AiAccess } from './AiAccess';

const words = aiSetup.aiSetup;
const continueName = onboarding.onboarding.wizard.continue;
const GEMINI_KEY = 'AIzaSyD-4fA9xQ2mZ7bW1cR8tY5uI3oP6aS0dF4';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** One turn of the event loop (a message, not a timer), so storage callbacks can run. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

// React holds the updates made inside one `act` until it ends, so each turn gets its own.
const MAX_TURNS = 2_000;

/** Lets storage and React work, a turn at a time, until `check()` passes. */
async function until(check: () => boolean): Promise<void> {
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (check()) return;
    await act(nextTurn);
  }
  throw new Error('until: the page never got there');
}

const shown = (hook: string) => () => document.querySelector(`[data-ui="${hook}"]`) !== null;

async function setUp(change: (real: AiSetupService) => AiSetupService = (real) => real) {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const clock = fixedClock(FACTORY_NOW, 'America/New_York');
  const settingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
  const secretsRepo = createSecretsRepo(db);
  const real = createAiSetupService({ settingsRepo, secretsRepo });
  // Every call the step makes, until it settles: `settled()` waits for all of them.
  const inFlight = new Set<Promise<unknown>>();
  const track = <T,>(call: Promise<T>): Promise<T> => {
    inFlight.add(call);
    const done = () => inFlight.delete(call);
    call.then(done, done);
    return call;
  };
  const used = change(real);
  const services: Services = {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
    onboarding: { startWithDefaults: vi.fn() },
    aiSetup: {
      saveChoice: (choice) => track(used.saveChoice(choice)),
      savedKeyMask: (provider) => track(used.savedKeyMask(provider)),
      setTermsAccepted: (accepted) => track(used.setTermsAccepted(accepted)),
      setUpLater: () => track(used.setUpLater()),
    },
    clock,
  };
  /** Waits until the step has no storage call running, and React has drawn the outcome. */
  const settled = async (): Promise<void> => {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      await act(nextTurn);
      if (inFlight.size === 0) return;
    }
    throw new Error('settled: a storage call never finished');
  };
  const sources: DataSources = {
    profileRepo: createProfileRepo(db),
    settingsRepo,
    diaryRepo: createDiaryRepo(db),
    waterRepo: createWaterRepo(db),
    fastRepo: createFastRepo(db),
    weightRepo: createWeightRepo(db, { bus }),
    bodyFatRepo: createBodyFatRepo(db),
    savedMealsRepo: createSavedMealsRepo(db),
    coachRepo: createCoachRepo(db),
    unreadableFlag: async () => false,
    clock,
  };

  /** The wizard on AI access (or `state`), with every state it reports collected. */
  const show = async (state: WizardState = wizardAt('aiAccess')) => {
    const states: WizardState[] = [];
    render(
      <ServicesProvider services={services}>
        <DataProvider sources={sources}>
          <WizardPage
            today={TEST_TODAY}
            locale="en-GB"
            requestNotifications={vi.fn()}
            lateSteps={{ aiAccess: AiAccess }}
            initialState={state}
            onStateChange={(next) => states.push(next)}
          />
        </DataProvider>
      </ServicesProvider>,
    );
    await until(shown('wizard.ai.provider'));
    await settled();
    return () => states.at(-1) as WizardState;
  };

  return { settingsRepo, secretsRepo, service: real, show, settled };
}

const continueButton = () => screen.getByRole('button', { name: continueName });
const canContinue = () => !continueButton().hasAttribute('disabled');
const providerPicker = () => screen.getByRole('combobox', { name: words.provider.label });
const termsBox = () => screen.getByRole('checkbox', { name: words.access.terms.accept });
const keyField = () => screen.getByLabelText(words.key.label);
const serverField = () => screen.getByRole('textbox', { name: words.server.label });

/** Resolves when called; for holding a save back. */
function gate() {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

describe('AiAccess', () => {
  it('keeps Continue disabled until a needed key is entered and the terms are accepted, then stores the choice (ACC-B6-1)', async () => {
    const user = userEvent.setup();
    const h = await setUp();
    const latest = await h.show();

    expect(providerPicker()).toHaveValue('gemini');
    expect(screen.getByText(words.key.missing)).toBeVisible();
    expect(canContinue()).toBe(false);

    await user.click(keyField());
    await user.paste(`  ${GEMINI_KEY}\n`);
    expect(screen.queryByText(words.key.missing)).toBeNull();
    // A key alone is not enough: the terms come first, and nothing is stored meanwhile.
    await h.settled();
    expect(canContinue()).toBe(false);
    expect(await h.secretsRepo.slots()).toEqual([]);

    await user.click(termsBox());
    await until(canContinue);

    expect(latest().aiReady).toBe(true);
    // Stored trimmed, and shown masked once saved (R03.20, ACC-E14-1).
    expect(await h.secretsRepo.get('gemini')).toBe(GEMINI_KEY);
    expect(screen.getByText('Saved key: AIza…0dF4')).toBeVisible();
    expect((await h.settingsRepo.get('ai.settings'))?.primary).toEqual({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
    });
    expect(await h.settingsRepo.get('onboarding.termsAccepted')).toBe(true);

    await user.click(continueButton());
    expect(latest().step).toBe('buildingPlan');
  });

  it('holds Continue while the terms are unticked, even when nothing else is missing', async () => {
    const user = userEvent.setup();
    const h = await setUp();
    const latest = await h.show();

    await user.selectOptions(providerPicker(), 'ollama');
    await h.settled();
    expect(canContinue()).toBe(false);
    expect(await h.settingsRepo.get('ai.settings')).toBeNull();

    await user.click(termsBox());
    await until(canContinue);
    expect((await h.settingsRepo.get('ai.settings'))?.primary.provider).toBe('ollama');

    await user.click(termsBox());
    expect(canContinue()).toBe(false);
    expect(latest().aiReady).toBe(false);
    await h.settled();
    expect(await h.settingsRepo.get('onboarding.termsAccepted')).toBe(false);
  });

  it('blocks Continue for Custom without a model, and opens it once one is typed (R03.20)', async () => {
    const user = userEvent.setup();
    const h = await setUp();
    await h.show();

    await user.selectOptions(providerPicker(), 'custom');
    await user.click(termsBox());
    await user.type(serverField(), 'https://llm.example/v1/');
    await h.settled();
    expect(screen.getByText(words.model.missing)).toBeVisible();
    expect(canContinue()).toBe(false);

    await user.type(screen.getByRole('textbox', { name: words.model.label }), 'llama-3.3-70b');
    await until(canContinue);

    const stored = await h.settingsRepo.get('ai.settings');
    expect(stored?.primary).toEqual({ provider: 'custom', model: 'llama-3.3-70b' });
    expect(stored?.endpoints.custom).toEqual({ main: 'https://llm.example/v1', standby: '' });
  });

  it('refuses a plain-http server on the local network with the reason and holds Continue (ACC-E13-1)', async () => {
    const user = userEvent.setup();
    const h = await setUp();
    await h.show();

    await user.selectOptions(providerPicker(), 'ollama');
    await user.click(termsBox());
    await until(canContinue);

    await user.clear(serverField());
    await user.type(serverField(), 'http://10.0.0.2:11434/v1');
    await h.settled();

    expect(serverField()).toBeInvalid();
    expect(screen.getByText(words.server.problem.plainHttp)).toBeVisible();
    expect(canContinue()).toBe(false);
    // The last stored address is still the one that was accepted.
    expect((await h.settingsRepo.get('ai.settings'))?.endpoints.ollama?.main).toBe(
      'http://localhost:11434/v1',
    );
  });

  it('continues with "Set up later" and saves no provider, so the plan uses the formulas (ACC-B6-2)', async () => {
    const user = userEvent.setup();
    const h = await setUp();
    await h.service.saveChoice({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      serverUrl: '',
      key: GEMINI_KEY,
    });
    const latest = await h.show();

    await user.click(screen.getByRole('button', { name: words.access.later }));
    await until(() => latest().step === 'buildingPlan');

    expect(latest().aiReady).toBe(true);
    const stored = await h.settingsRepo.get('ai.settings');
    expect(stored).toBeNull();
    expect(await h.secretsRepo.slots()).toEqual([]);
    // What Building plan reads: the default provider without a key, so no AI call can be made.
    const settings = decodeAiSettings(stored);
    expect(missingFor(roleFor({}, settings), {})).toEqual(['key']);
  });

  it('reopens on the saved choice with the key masked, and lets the person go on (back from Plan ready)', async () => {
    const h = await setUp();
    await h.service.saveChoice({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      serverUrl: '',
      key: GEMINI_KEY,
    });
    await h.service.setTermsAccepted(true);
    const latest = await h.show(wizardAt('aiAccess', { aiReady: true }));

    expect(providerPicker()).toHaveValue('gemini');
    expect(screen.getByRole('combobox', { name: words.model.label })).toHaveValue(
      'gemini-3.8-flash',
    );
    expect(termsBox()).toBeChecked();
    expect(screen.getByText('Saved key: AIza…0dF4')).toBeVisible();
    expect(keyField()).toHaveValue('');
    expect(screen.queryByText(GEMINI_KEY)).toBeNull();

    await until(canContinue);
    expect(latest().aiReady).toBe(true);
    expect(await h.secretsRepo.get('gemini')).toBe(GEMINI_KEY);
  });

  it('opens Continue only for the newest values when an older save finishes late', async () => {
    const user = userEvent.setup();
    const gates = [gate(), gate()];
    const saves: AiChoice[] = [];
    const h = await setUp((real) => ({
      ...real,
      saveChoice: async (choice): Promise<SavedChoice> => {
        const count = saves.push(choice);
        await gates[count - 1]?.opened;
        return real.saveChoice(choice);
      },
    }));
    const latest = await h.show();

    await user.selectOptions(providerPicker(), 'ollama');
    await user.click(termsBox());
    await user.selectOptions(screen.getByRole('combobox', { name: words.model.label }), 'qwen3.5');

    // The first save lands after the model changed: it must not open Continue.
    gates[0]!.open();
    await until(() => saves.length === 2);
    expect(saves.map((choice) => choice.model)).toEqual(['gemma4', 'qwen3.5']);
    expect(canContinue()).toBe(false);
    expect(latest().aiReady).toBe(false);

    gates[1]!.open();
    await until(canContinue);
    expect((await h.settingsRepo.get('ai.settings'))?.primary.model).toBe('qwen3.5');
  });

  it('says when the choice did not save, keeps Continue closed, and tries again on Retry', async () => {
    const user = userEvent.setup();
    const h = await setUp((real) => ({
      ...real,
      saveChoice: vi
        .fn<AiSetupService['saveChoice']>()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockImplementation(real.saveChoice),
    }));
    await h.show();

    await user.selectOptions(providerPicker(), 'ollama');
    await user.click(termsBox());
    await h.settled();
    expect(screen.getByRole('alert')).toHaveTextContent(words.access.saveFailed);
    expect(canContinue()).toBe(false);

    await user.click(screen.getByRole('button', { name: common.common.retry }));
    await until(canContinue);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
