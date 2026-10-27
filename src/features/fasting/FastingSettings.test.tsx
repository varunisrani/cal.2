import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { common } from '../../i18n/en/common';
import { fasting } from '../../i18n/en/fasting';
import { FACTORY_NOW, makeDraft, makeFast } from '../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { settle } from '../water/testing/openWater';
import { FastingSettings } from './FastingSettings';
import { openFasting, type FastingSetup } from './testing/openFasting';

afterEach(closeHarnesses);

const words = fasting.fasting.settings;
const HOUR = 3_600_000;
const CARD = '[data-ui="fasting.settings"]';
const GOAL_SHEET = '[data-ui="fasting.goal.editor"]';

/** The text of the element `data-ui` names, or '' when there is none. */
const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

/** The hooks of the card's rows, in order. */
const shownRows = (): string[] =>
  Array.from(document.querySelectorAll(`${CARD} li > button`)).map(
    (row) => row.getAttribute('data-ui') ?? '',
  );

async function openCard(setup: FastingSetup = {}) {
  const user = userEvent.setup();
  const h = await openFasting(setup);
  h.mount(<FastingSettings />);
  await untilShown(CARD);
  const tracking = () => screen.getByRole('switch', { name: words.tracking });
  return { ...h, user, tracking };
}

describe('FastingSettings', () => {
  it('is off by default and then shows only its switch', async () => {
    const s = await openCard();

    expect(s.tracking()).toHaveAttribute('aria-checked', 'false');
    expect(s.tracking()).toHaveAccessibleDescription(words.trackingHint);
    expect(shownRows()).toEqual(['fasting.tracking']);
  });

  it('shows the default goal of 16 hours once fasting is on (ACC-J10-1, ACC-H6-1)', async () => {
    const s = await openCard();

    await s.user.click(s.tracking());

    await until(() => shownRows().length === 2);
    expect(s.tracking()).toHaveAttribute('aria-checked', 'true');
    expect(await s.repos.settingsRepo.get('fasting.on')).toBe(true);
    expect(shownRows()).toEqual(['fasting.tracking', 'fasting.goal']);
    expect(textOf('fasting.goal')).toBe(`${words.goal} 16 hours`);
  });

  it('ends the running fast when switched off, keeps it, says so, and food logs again (ACC-H10-1, R05.2)', async () => {
    const running = makeFast({ id: 'running', start: FACTORY_NOW - 5 * HOUR, end: null });
    const s = await openCard({ on: true, fasts: [running] });
    const lunch = { loggedAt: FACTORY_NOW, meal: 'lunch', source: 'manual' } as const;
    expect((await s.services.diary.logEntry(makeDraft(), lunch)).kind).toBe('fastActive');

    await s.user.click(s.tracking());

    await until(() => shownRows().length === 1);
    expect(await s.repos.settingsRepo.get('fasting.on')).toBe(false);
    expect(await s.storedFasts()).toEqual([{ ...running, end: FACTORY_NOW }]);
    await settle(() => document.querySelector('[data-ui="toast.message"]') !== null);
    expect(screen.getByRole('status')).toHaveTextContent(words.ended);
    expect((await s.services.diary.logEntry(makeDraft(), lunch)).kind).toBe('logged');
  });

  it('says nothing about a fast when none was running', async () => {
    const s = await openCard({ on: true });

    await s.user.click(s.tracking());

    await until(() => shownRows().length === 1);
    await settle(() => !(s.tracking() as HTMLButtonElement).disabled);
    expect(document.querySelector('[data-ui="toast.message"]')).toBeNull();
  });

  it('offers 1 to 168 hours, opens on the stored goal and stores the hours picked in minutes', async () => {
    const s = await openCard({ on: true, defaultGoalMin: 18 * 60 });
    expect(textOf('fasting.goal')).toBe(`${words.goal} 18 hours`);

    await s.user.click(screen.getByRole('button', { name: /^Default goal/ }));
    await untilShown(GOAL_SHEET);
    const sheet = within(screen.getByRole('dialog', { name: fasting.fasting.goal.title }));
    const wheel = sheet.getByRole('combobox', { name: fasting.fasting.goal.title });
    const options = within(wheel).getAllByRole('option');
    expect(wheel).toHaveValue('18');
    expect(options).toHaveLength(168);
    expect(options[0]).toHaveTextContent('1');
    expect(options.at(-1)).toHaveTextContent('168');

    await s.user.selectOptions(wheel, '20');
    await s.user.click(sheet.getByRole('button', { name: common.common.save }));

    await untilGone(GOAL_SHEET);
    expect(await s.repos.settingsRepo.get('fasting.defaultGoalMin')).toBe(1_200);
    await until(() => textOf('fasting.goal') === `${words.goal} 20 hours`);
  });

  it('keeps a stored goal that is not whole hours when saved unmoved', async () => {
    const s = await openCard({ on: true, defaultGoalMin: 990 });
    expect(textOf('fasting.goal')).toBe(`${words.goal} 16 hours`);

    await s.user.click(screen.getByRole('button', { name: /^Default goal/ }));
    await untilShown(GOAL_SHEET);
    await s.user.click(screen.getByRole('button', { name: common.common.save }));

    await untilGone(GOAL_SHEET);
    expect(await s.repos.settingsRepo.get('fasting.defaultGoalMin')).toBe(990);
  });

  it('draws nothing until the settings are read (R06.22)', async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = await openFasting({
      on: true,
      sources: (real) => ({
        ...real,
        settingsRepo: {
          snapshot: real.settingsRepo.snapshot,
          loaded: held.then(() => real.settingsRepo.loaded),
        },
      }),
    });
    h.mount(<FastingSettings />);
    await act(async () => {
      await h.repos.settingsRepo.loaded;
    });
    expect(document.querySelector(CARD)).toBeNull();

    release();
    await untilShown(CARD);
    expect(screen.getByRole('switch', { name: words.tracking })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
