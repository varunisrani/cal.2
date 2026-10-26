import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { AppBus } from '../../data/bus';
import { createProfileRepo } from '../../data/repos/profileRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { defaultProfile } from '../../domain/profile/profile';
import { quickStartAction } from '../../services/quickStart';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, factories } from '../../test/factories';
import { QuickStart } from './QuickStart';

afterEach(cleanup);

const clock = factories().clock;
const quietBus: AppBus = { post: () => {}, subscribe: () => () => {}, close: () => {} };

/** A promise the test settles by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** The quick start until it is done, then a stand-in for Home, as the onboarding route will be. */
function Route({ onStart, onArrive }: { onStart: () => Promise<unknown>; onArrive: () => void }) {
  const [home, setHome] = useState(false);
  if (home) return <h1>Home</h1>;
  return (
    <QuickStart
      onStart={onStart}
      onDone={() => {
        setHome(true);
        onArrive();
      }}
    />
  );
}

const startButton = () => screen.getByRole('button', { name: 'Start with defaults' });

describe('QuickStart', () => {
  it('shows the app name as its heading and one start button with its hook', () => {
    render(<QuickStart onStart={async () => {}} onDone={() => {}} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Platewise' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Platewise' })).toHaveAttribute(
      'data-ui',
      'onboarding.quickStart',
    );
    expect(startButton()).toHaveAttribute('data-ui', 'onboarding.quickStart.start');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stores the default profile, one weigh-in and onboarding done, then shows Home (P04-09)', async () => {
    const db = await openTestDb();
    const settings = createSettingsRepo(db, { bus: quietBus, clock });
    onTestFinished(() => settings.close());
    const profile = createProfileRepo(db);
    // Wired as the onboarding route will be: the shell's repositories, the browser's language.
    const onStart = quickStartAction({ db, profile, settings, bus: quietBus, clock }, 'en-GB');
    const arrived = deferred();
    const user = userEvent.setup();
    render(<Route onStart={onStart} onArrive={arrived.resolve} />);

    await user.click(startButton());
    await act(async () => arrived.promise);

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(await profile.get()).toEqual({ kind: 'ok', value: defaultProfile('2026-10-26') });
    expect(await db.weighIns.toArray()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, kg: 70 },
    ]);
    expect(await settings.get('onboarding.done')).toBe(true);
    expect(await settings.get('units.weight')).toBe('kg');
  });

  it('runs the start once on a double press', async () => {
    const work = deferred();
    const onStart = vi.fn(() => work.promise);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<QuickStart onStart={onStart} onDone={onDone} />);

    await user.dblClick(startButton());
    expect(startButton()).toHaveAttribute('aria-busy', 'true');
    await act(async () => work.resolve());

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('says so when the start fails, stays put and lets the person try again', async () => {
    const onStart = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue({});
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<QuickStart onStart={onStart} onDone={onDone} />);

    await user.click(startButton());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'We couldn’t save your starting setup. Try again.',
    );
    expect(onDone).not.toHaveBeenCalled();

    await user.click(startButton());
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
