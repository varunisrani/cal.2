import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { common } from '../../i18n/en/common';
import { trackers } from '../../i18n/en/trackers';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { openWater, type WaterSetup } from './testing/openWater';
import { WaterSettings } from './WaterSettings';

afterEach(closeHarnesses);

const words = trackers.trackers.water;
const CARD = '[data-ui="water.settings"]';
const GOAL_SHEET = '[data-ui="water.goal.editor"]';

/** The text of the element `data-ui` names, or '' when there is none. */
const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

/** The hooks of the rows the card shows, in order. */
const shownRows = (): string[] =>
  Array.from(document.querySelectorAll(`${CARD} li > button`)).map(
    (row) => row.getAttribute('data-ui') ?? '',
  );

async function openCard(setup: WaterSetup = {}) {
  const user = userEvent.setup();
  const h = await openWater(setup);
  h.mount(<WaterSettings />);
  await untilShown(CARD);
  const tracking = () => screen.getByRole('switch', { name: words.settings.tracking });
  return { ...h, user, tracking };
}

describe('WaterSettings', () => {
  it('is off by default and then shows only its switch', async () => {
    const s = await openCard();

    expect(s.tracking()).toHaveAttribute('aria-checked', 'false');
    expect(s.tracking()).toHaveAccessibleDescription(words.settings.trackingHint);
    expect(shownRows()).toEqual(['water.tracking']);
  });

  it('shows the goal, the unit and the quick-add amounts once water is on (ACC-J10-1)', async () => {
    const s = await openCard();

    await s.user.click(s.tracking());

    await until(() => shownRows().length === 4);
    expect(s.tracking()).toHaveAttribute('aria-checked', 'true');
    expect(await s.repos.settingsRepo.get('water.on')).toBe(true);
    expect(shownRows()).toEqual(['water.tracking', 'water.goal', 'water.unit', 'water.quickAdd']);
    expect(textOf('water.goal')).toBe(`${words.settings.goal} 2,000 ml`);
    expect(textOf('water.unit')).toBe(`${words.settings.unit} ml`);
    expect(textOf('water.quickAdd')).toBe(`${words.settings.quickAdd} 250, 500, 750 ml`);
  });

  it('turns the water reminder off with tracking, keeping its time and the logs', async () => {
    const s = await openCard({ on: true });
    await s.repos.settingsRepo.set('remind.water', { on: true, at: '15:30' });
    await s.repos.waterRepo.add({ at: s.clock.now(), ml: 500 });

    await s.user.click(s.tracking());

    await until(() => shownRows().length === 1);
    expect(await s.repos.settingsRepo.get('water.on')).toBe(false);
    expect(await s.repos.settingsRepo.get('remind.water')).toEqual({ on: false, at: '15:30' });
    expect(await s.loggedOn('2026-10-26')).toEqual([500]);
  });

  it('opens the goal wheel in fl oz on 68, keeps 2 000 ml unmoved, and stores 70 fl oz as 2 070 ml (R05.10)', async () => {
    const s = await openCard({ on: true, unit: 'flOz' });
    expect(textOf('water.goal')).toBe(`${words.settings.goal} 67.6 fl oz`);

    await s.user.click(screen.getByRole('button', { name: /^Daily goal/ }));
    await untilShown(GOAL_SHEET);
    const sheet = within(screen.getByRole('dialog', { name: words.goal.title }));
    const wheel = sheet.getByRole('combobox', { name: words.goal.title });
    const options = within(wheel).getAllByRole('option');
    expect(wheel).toHaveValue('68');
    expect(options).toHaveLength(337);
    expect(options[0]).toHaveTextContent('2');
    expect(options.at(-1)).toHaveTextContent('338');

    await s.user.click(sheet.getByRole('button', { name: common.common.save }));
    await untilGone(GOAL_SHEET);
    expect(await s.repos.settingsRepo.get('water.goalMl')).toBe(2_000);

    await s.user.click(screen.getByRole('button', { name: /^Daily goal/ }));
    await untilShown(GOAL_SHEET);
    await s.user.selectOptions(screen.getByRole('combobox', { name: words.goal.title }), '70');
    await s.user.click(screen.getByRole('button', { name: common.common.save }));

    await untilGone(GOAL_SHEET);
    expect(await s.repos.settingsRepo.get('water.goalMl')).toBe(2_070);
    await until(() => textOf('water.goal') === `${words.settings.goal} 70 fl oz`);
  });

  it('offers 50 to 10,000 ml in 50s and stores the goal it shows', async () => {
    const s = await openCard({ on: true, goalMl: 2_020 });

    await s.user.click(screen.getByRole('button', { name: /^Daily goal/ }));
    await untilShown(GOAL_SHEET);
    const wheel = screen.getByRole('combobox', { name: words.goal.title });
    const options = within(wheel).getAllByRole('option');
    expect(wheel).toHaveValue('2000');
    expect(options).toHaveLength(200);
    expect(options[1]).toHaveTextContent('100');
    expect(options.at(-1)).toHaveTextContent('10,000');

    await s.user.selectOptions(wheel, '2500');
    await s.user.click(screen.getByRole('button', { name: common.common.save }));

    await untilGone(GOAL_SHEET);
    expect(await s.repos.settingsRepo.get('water.goalMl')).toBe(2_500);
  });

  it('switches the unit, and every row follows', async () => {
    const s = await openCard({ on: true });

    await s.user.click(screen.getByRole('button', { name: /^Unit/ }));
    await s.user.click(screen.getByRole('option', { name: words.unitChoice.flOz }));

    await until(() => textOf('water.unit') === `${words.settings.unit} fl oz`);
    expect(await s.repos.settingsRepo.get('water.unit')).toBe('flOz');
    expect(textOf('water.goal')).toBe(`${words.settings.goal} 67.6 fl oz`);
    expect(textOf('water.quickAdd')).toBe(`${words.settings.quickAdd} 8.5, 16.9, 25.4 fl oz`);
  });

  it('saves edited quick-add amounts from their row', async () => {
    const s = await openCard({ on: true });

    await s.user.click(screen.getByRole('button', { name: /^Quick-add amounts/ }));
    const editor = within(screen.getByRole('dialog', { name: words.quickAdd.title }));
    const first = editor.getByRole('textbox', { name: 'Amount 1' });
    await s.user.clear(first);
    await s.user.type(first, '300');
    await s.user.click(editor.getByRole('button', { name: common.common.save }));

    await untilGone('[data-ui="water.quickAdd.editor"]');
    expect(await s.repos.settingsRepo.get('water.quickAddMl')).toEqual([300, 500, 750]);
    await until(() => textOf('water.quickAdd').endsWith('300, 500, 750 ml'));
  });

  it('draws nothing until the settings are read (R06.22)', async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = await openWater({
      on: true,
      sources: (real) => ({
        ...real,
        settingsRepo: {
          snapshot: real.settingsRepo.snapshot,
          loaded: held.then(() => real.settingsRepo.loaded),
        },
      }),
    });
    h.mount(<WaterSettings />);
    await act(async () => {
      await h.repos.settingsRepo.loaded;
    });
    expect(document.querySelector(CARD)).toBeNull();

    release();
    await untilShown(CARD);
    expect(screen.getByRole('switch', { name: words.settings.tracking })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
