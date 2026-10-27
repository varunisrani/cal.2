import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Boot } from '../../app/Boot';
import { ShellPortsContext } from '../../app/ports';
import { useRoute } from '../../app/useRoute';
import { createBackupRepo } from '../../data/repos/backupRepo';
import { aiSetup } from '../../i18n/en/aiSetup';
import { backup as backupWords } from '../../i18n/en/backup';
import { common } from '../../i18n/en/common';
import { onboarding } from '../../i18n/en/onboarding';
import { makeBackup } from '../../services/backup/backup';
import type { BackupService, BackupSummary, CheckedBackup } from '../../services/backup/service';
import {
  SEED_CLOCK,
  seededBackupFile,
  seedStore,
  testBackupService,
} from '../../services/backup/testing/seed';
import { ServicesProvider } from '../../services/context';
import { createShellPorts } from '../../services/shell';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import { untilLoaded } from '../../test/lazy';
import { closeHarnesses, openHarness } from '../../test/screenHarness';
import { HomePage } from '../home/HomePage';
import { settle } from '../water/testing/openWater';
import { OnboardingRoute } from './OnboardingRoute';
import { restoredSetup, WELCOME_RESTORE_SHEET } from './RestoreFromFile';
import { BUILD_ANIMATION_MS } from './steps/BuildingPlan';
import { WIZARD_STEPS } from './wizard';

beforeAll(async () => {
  // The restore screen is fetched on demand: its first transform stays out of every wait.
  await import('./RestoreFromFile');
});

afterEach(async () => {
  vi.useRealTimers();
  await closeHarnesses();
});

const words = onboarding.onboarding;
const sheet = backupWords.backup.restoreSheet;

/** Waits, one task at a time, until an element matching `selector` is on the page. */
const shown = (selector: string) => settle(() => document.querySelector(selector) !== null);

const button = (name: string) => screen.getByRole('button', { name });

const onStep = (step: string) => () =>
  document.querySelector(`[data-ui="screen.onboarding"][data-step="${step}"]`) !== null;

/** A backup file of the seeded store with its profile and done flag taken out first. */
async function backupWithoutProfile(): Promise<File> {
  const { db } = await openTestDb();
  try {
    await seedStore(db);
    await db.profile.clear();
    await db.settings.delete('onboarding.done');
    const made = await makeBackup({
      backupRepo: createBackupRepo(db),
      clock: SEED_CLOCK,
      appVersion: '0.1.0',
    });
    if (!made.ok) throw new Error(`no backup: ${made.error}`);
    return made.value.file;
  } finally {
    db.close();
  }
}

const asZip = (file: Blob, name = 'platewise-backup-2026-10-26.zip') => new File([file], name);

/** What the app shows for the route, as the shell does: onboarding, or Home for any tab. */
function Routed() {
  const route = useRoute();
  return route.kind === 'onboarding' ? <OnboardingRoute /> : <HomePage />;
}

/**
 * The app from a new install on Welcome: the live start-up gate over the test database, the
 * onboarding route and Home, with the real backup service. `wrap` changes the service (a held
 * restore).
 */
async function openWelcome(wrap?: (real: BackupService) => BackupService) {
  const user = userEvent.setup();
  const h = await openHarness({ hash: '#/onboarding' });
  const real = testBackupService(h.db, { clock: h.clock, share: { download: () => {} } });
  const backup = wrap ? wrap(real) : real;
  const complete = vi.spyOn(h.services.onboarding, 'complete');
  const ports = createShellPorts(h.repos);
  h.mount(
    <ServicesProvider services={{ ...h.services, backup }}>
      <ShellPortsContext value={ports}>
        <Boot>
          <Routed />
        </Boot>
      </ShellPortsContext>
    </ServicesProvider>,
  );
  await shown('[data-ui="wizard.restore"]');
  const input = document.querySelector<HTMLInputElement>('[data-ui="wizard.restoreFile"]')!;
  const picker = vi.spyOn(input, 'click');

  /** Welcome's link, then `file` chosen in the picker it opened; waits for the restore screen. */
  const pick = async (file: File): Promise<void> => {
    await user.upload(input, file);
    await untilLoaded();
    await shown('[data-ui="screen.welcomeRestore"]');
  };
  const entryIds = async () => (await h.db.entries.toArray()).map((row) => row.id).sort();
  const route = () => h.router.current().route;
  const boot = () => ports.boot.getSnapshot()?.status;
  return { ...h, user, input, picker, pick, entryIds, route, boot, complete };
}

/** A restore held at its start until `release` is called. */
function heldRestore() {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const wrap = (real: BackupService): BackupService => ({
    ...real,
    async apply(checked: CheckedBackup) {
      await gate;
      return real.apply(checked);
    },
  });
  return { wrap, release: () => release() };
}

/** One turn of the event loop (a message, not a timer), for the test database's callbacks. */
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

/** Waits for `check` while the timers are fake, firing the live queries' zero-delay timers. */
async function untilOnFakeTimers(check: () => boolean | Promise<boolean>): Promise<void> {
  for (let turn = 0; turn < 500; turn++) {
    if (await check()) return;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await nextTurn();
    });
  }
  throw new Error('untilOnFakeTimers: never got there');
}

describe('restoredSetup', () => {
  const summary = (hasProfile: boolean, onboardingDone: boolean): BackupSummary => ({
    madeAt: FACTORY_NOW,
    appVersion: '0.1.0',
    entries: 1,
    photos: 0,
    messages: 0,
    hasProfile,
    onboardingDone,
  });

  it('counts a setup as finished only with both a profile and the done flag', () => {
    expect(restoredSetup(summary(true, true))).toBe(true);
    expect(restoredSetup(summary(true, false))).toBe(false);
    expect(restoredSetup(summary(false, true))).toBe(false);
    expect(restoredSetup(summary(false, false))).toBe(false);
  });
});

describe('RestoreFromFile on Welcome', () => {
  it('restores a complete backup after its preview and lands on Home with its entries, seeding nothing (ACC-B10-1)', async () => {
    const s = await openWelcome();

    await s.user.click(button(words.welcome.restore));
    expect(s.picker).toHaveBeenCalledTimes(1);
    await s.pick(asZip(await seededBackupFile()));
    await shown('[data-ui="restore.madeAt"]');
    // The preview changes nothing.
    expect(await s.entryIds()).toEqual([]);

    await s.user.click(button(sheet.confirm));
    await shown('[data-ui="welcomeRestore.open"]');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      words.restore.restoredTitle,
    );
    expect(screen.getByText(words.restore.restoredSetup)).toBeVisible();
    expect(document.querySelector('[data-ui="restore"]')).toBeNull();
    // No way back to Welcome after a restore, and no second restore over it.
    expect(screen.queryByRole('button', { name: common.common.back })).toBeNull();
    expect(screen.queryByRole('button', { name: words.restore.tryAgain })).toBeNull();
    // The setup is stored, so the gate reads ready, yet the screen waits for Open Platewise.
    await settle(() => s.boot() === 'ready');
    expect(s.route().kind).toBe('onboarding');
    expect(screen.getByRole('button', { name: words.restore.open })).toBeVisible();

    await s.user.click(button(words.restore.open));
    await shown('[data-ui="home.meal.lunch"]');

    expect(s.route()).toMatchObject({ kind: 'tab', tab: 'home' });
    const lunch = document.querySelector<HTMLElement>('[data-ui="home.meal.lunch"]')!;
    expect(within(lunch).getByText('Lentil soup')).toBeTruthy();
    expect(await s.entryIds()).toEqual(['entry-lunch', 'entry-yoghurt']);
    // Nothing seeded over the restore: the backup's own weigh-in and no tune-up start.
    expect(s.complete).not.toHaveBeenCalled();
    expect((await s.db.weighIns.toArray()).map((row) => row.id)).toEqual(['weigh-1']);
    expect(await s.repos.settingsRepo.get('tuneUp.lastCheckDay')).toBeNull();
  });

  it('continues a backup without a profile at the Sex step, keeping its entries through to the end (ACC-B10-2)', async () => {
    const s = await openWelcome();

    await s.user.click(button(words.welcome.restore));
    await s.pick(asZip(await backupWithoutProfile()));
    await shown('[data-ui="restore.madeAt"]');
    await s.user.click(button(sheet.confirm));
    await shown('[data-ui="welcomeRestore.continue"]');

    expect(screen.getByText(words.restore.restoredData)).toBeVisible();
    expect(screen.queryByRole('button', { name: words.restore.open })).toBeNull();

    await s.user.click(button(words.restore.continue));
    await shown('[data-ui="screen.onboarding"][data-step="sex"]');

    expect(s.route().kind).toBe('onboarding');
    expect(await s.entryIds()).toEqual(['entry-lunch', 'entry-yoghurt']);

    // The rest of the wizard, over the restored diary.
    for (const step of WIZARD_STEPS.slice(1, WIZARD_STEPS.indexOf('aiAccess'))) {
      expect(onStep(step)()).toBe(true);
      await s.user.click(button(words.wizard.continue));
    }
    await shown('[data-ui="wizard.ai.later"]');
    vi.useFakeTimers({
      now: FACTORY_NOW,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    fireEvent.click(button(aiSetup.aiSetup.access.later));
    await untilOnFakeTimers(onStep('buildingPlan'));
    await act(() => vi.advanceTimersByTimeAsync(BUILD_ANIMATION_MS));
    await untilOnFakeTimers(
      () => document.querySelector('[data-ui="wizard.plan.finish"]') !== null,
    );
    fireEvent.click(button(words.planReady.finish));
    await untilOnFakeTimers(() => s.repos.settingsRepo.get('onboarding.done'));

    expect(s.complete).toHaveBeenCalledTimes(1);
    expect((await s.repos.profileRepo.get()).kind).toBe('ok');
    expect(await s.entryIds()).toEqual(['entry-lunch', 'entry-yoghurt']);
    // The restored history was not empty, so no first weigh-in was added to it.
    expect((await s.db.weighIns.toArray()).map((row) => row.id)).toEqual(['weigh-1']);
    await untilOnFakeTimers(() => s.route().kind === 'tab');
  });

  it('shows why a bad file was refused, with Try again opening the picker for another file', async () => {
    const s = await openWelcome();

    await s.user.click(button(words.welcome.restore));
    await s.pick(asZip(new Blob(['a shopping list, not a backup']), 'notes.zip'));
    await shown('[data-ui="welcomeRestore.problem"]');

    expect(screen.getByRole('alert')).toHaveTextContent(sheet.problem.notBackup);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(words.restore.failedTitle);
    expect(heading).toHaveFocus();
    expect(document.querySelector('[data-ui="restore"]')).toBeNull();
    expect(button(words.restore.startFresh)).toBeVisible();
    expect(await s.entryIds()).toEqual([]);
    expect((await s.repos.profileRepo.get()).kind).toBe('missing');

    await s.user.click(button(words.restore.tryAgain));
    expect(s.picker).toHaveBeenCalledTimes(2);
    await s.pick(asZip(await seededBackupFile()));
    await shown('[data-ui="restore.madeAt"]');
    await s.user.click(button(sheet.confirm));
    await shown('[data-ui="welcomeRestore.open"]');

    expect(await s.entryIds()).toEqual(['entry-lunch', 'entry-yoghurt']);
  });

  it('starts the wizard on Start fresh, and Back after a refusal returns to Welcome', async () => {
    const s = await openWelcome();
    const notBackup = asZip(new Blob(['not a backup']), 'notes.zip');

    await s.user.click(button(words.welcome.restore));
    await s.pick(notBackup);
    await shown('[data-ui="welcomeRestore.problem"]');
    await s.user.click(button(common.common.back));
    await shown('[data-ui="wizard.start"]');

    await s.pick(notBackup);
    await shown('[data-ui="welcomeRestore.problem"]');
    await s.user.click(button(words.restore.startFresh));
    await shown('[data-ui="screen.onboarding"][data-step="sex"]');

    expect(await s.entryIds()).toEqual([]);
  });

  it('returns to Welcome when the preview is cancelled, changing nothing', async () => {
    const s = await openWelcome();

    await s.user.click(button(words.welcome.restore));
    await s.pick(asZip(await seededBackupFile()));
    await shown('[data-ui="restore.madeAt"]');
    await s.user.click(button(common.common.cancel));
    await shown('[data-ui="wizard.start"]');

    expect(document.querySelector('[data-ui="screen.welcomeRestore"]')).toBeNull();
    expect(await s.entryIds()).toEqual([]);
    expect(s.route().kind).toBe('onboarding');
  });

  it('cannot be left while restoring: the sheet stays, Back is disabled and closing the tab asks first', async () => {
    const held = heldRestore();
    const s = await openWelcome(held.wrap);

    await s.user.click(button(words.welcome.restore));
    await s.pick(asZip(await seededBackupFile()));
    await shown('[data-ui="restore.madeAt"]');
    await s.user.click(button(sheet.confirm));
    await shown('[data-ui="welcomeRestore.restoring"]');

    await s.user.keyboard('{Escape}');
    expect(document.querySelector('[data-ui="restore"]')).not.toBeNull();
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    // The browser's Back closes only the sheet: the screen stays and its Back is disabled.
    act(() => s.router.closeSheet(WELCOME_RESTORE_SHEET));
    expect(document.querySelector('[data-ui="restore"]')).toBeNull();
    const back = button(common.common.back);
    expect(back).toBeDisabled();
    await s.user.click(back);
    expect(document.querySelector('[data-ui="welcomeRestore.restoring"]')).not.toBeNull();
    expect(await s.entryIds()).toEqual([]);

    held.release();
    await shown('[data-ui="welcomeRestore.open"]');

    expect(await s.entryIds()).toEqual(['entry-lunch', 'entry-yoghurt']);
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
