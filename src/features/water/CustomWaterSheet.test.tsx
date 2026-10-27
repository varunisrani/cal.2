import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../../domain/dates/dayKey';
import type { WaterDisplayUnit } from '../../domain/units/water';
import { common } from '../../i18n/en/common';
import { trackers } from '../../i18n/en/trackers';
import { FACTORY_NOW } from '../../test/factories';
import { closeHarnesses, untilShown } from '../../test/screenHarness';
import { CustomWaterSheet } from './CustomWaterSheet';
import { openWater, settle } from './testing/openWater';

afterEach(closeHarnesses);

const words = trackers.trackers.water;
const HOUR = 60 * 60 * 1000;
const SHEET = '[data-ui="water.custom"]';
const TODAY = '2026-10-26';

/** The sheet closes itself through its host's state, a plain update: wait a task at a time. */
const closed = () => settle(() => document.querySelector(SHEET) === null);

interface HostProps {
  readonly day: DayKey;
  readonly unit: WaterDisplayUnit;
  readonly onAdded: () => void;
  readonly onClose: () => void;
}

/** The sheet as a page holds it: open until it closes itself. */
function Host({ day, unit, onAdded, onClose }: HostProps) {
  const [open, setOpen] = useState(true);
  return (
    <CustomWaterSheet
      open={open}
      day={day}
      unit={unit}
      onAdded={onAdded}
      onClose={() => {
        onClose();
        setOpen(false);
      }}
    />
  );
}

async function openSheet({ unit = 'ml', day = TODAY }: { unit?: WaterDisplayUnit; day?: DayKey }) {
  const user = userEvent.setup();
  const h = await openWater({ on: true, unit });
  const onAdded = vi.fn();
  const onClose = vi.fn();
  h.mount(<Host day={day} unit={unit} onAdded={onAdded} onClose={onClose} />);
  await untilShown(SHEET);
  const sheet = within(screen.getByRole('dialog', { name: words.custom.title }));
  const field = () => sheet.getByRole('textbox', { name: words.custom.field });
  const add = () => sheet.getByRole('button', { name: common.common.add });
  return { ...h, user, sheet, field, add, onAdded, onClose };
}

describe('CustomWaterSheet', () => {
  it('opens empty with the unit after the field, and enables Add only above 0', async () => {
    const s = await openSheet({});

    expect(s.field()).toHaveValue('');
    expect(s.field()).toHaveFocus();
    expect(s.field()).toHaveAccessibleDescription('ml');
    expect(s.add()).toBeDisabled();

    await s.user.type(s.field(), '0');
    expect(s.add()).toBeDisabled();
    expect(s.field()).not.toHaveAttribute('aria-invalid');

    await s.user.clear(s.field());
    await s.user.type(s.field(), '300');
    expect(s.add()).toBeEnabled();
  });

  it('refuses 6 000 ml with a message naming 5,000 ml and stores nothing (ACC-H3-1, R05.10, D-16.39)', async () => {
    const s = await openSheet({});

    await s.user.type(s.field(), '6000');

    expect(s.field()).toHaveAttribute('aria-invalid', 'true');
    expect(s.sheet.getByText('The most you can add at once is 5,000 ml.')).toBeVisible();
    expect(s.add()).toBeDisabled();
    await s.user.type(s.field(), '{Enter}');
    expect(await s.loggedOn(TODAY)).toEqual([]);

    await s.user.clear(s.field());
    await s.user.type(s.field(), '5000');
    expect(s.field()).not.toHaveAttribute('aria-invalid');
    await s.user.click(s.add());
    await closed();
    expect(await s.loggedOn(TODAY)).toEqual([5_000]);
  });

  it('takes digits only in ml, five at most', async () => {
    const s = await openSheet({});

    await s.user.type(s.field(), '2a5.0');
    expect(s.field()).toHaveValue('250');

    await s.user.clear(s.field());
    await s.user.type(s.field(), '123456');
    expect(s.field()).toHaveValue('12345');
  });

  it('takes one decimal in fl oz, with a comma or a dot, and stores whole ml', async () => {
    const s = await openSheet({ unit: 'flOz' });
    expect(s.field()).toHaveAccessibleDescription('fl oz');

    await s.user.type(s.field(), '170');
    expect(s.sheet.getByText('The most you can add at once is 169 fl oz.')).toBeVisible();
    expect(s.add()).toBeDisabled();

    await s.user.clear(s.field());
    await s.user.type(s.field(), '8,57');
    expect(s.field()).toHaveValue('8.5');
    await s.user.click(s.add());

    await closed();
    expect(await s.loggedOn(TODAY)).toEqual([251]);
    expect(screen.getByText('8.5 fl oz of water logged')).toBeVisible();
  });

  it('logs on the day it was opened for at the current clock time, confirms and closes', async () => {
    const s = await openSheet({ day: '2026-10-25' });

    await s.user.type(s.field(), '300{Enter}');

    await closed();
    const [log] = await s.repos.waterRepo.byDay('2026-10-25');
    expect(log).toMatchObject({ ml: 300, at: FACTORY_NOW - 24 * HOUR });
    expect(await s.loggedOn(TODAY)).toEqual([]);
    expect(screen.getByText('300 ml of water logged')).toBeVisible();
    expect(s.onAdded).toHaveBeenCalledTimes(1);
    expect(s.onAdded).toHaveBeenCalledWith(log);
    expect(s.onClose).toHaveBeenCalledTimes(1);
  });

  it('stores nothing on Cancel', async () => {
    const s = await openSheet({});

    await s.user.type(s.field(), '400');
    await s.user.click(s.sheet.getByRole('button', { name: common.common.cancel }));

    await closed();
    expect(await s.loggedOn(TODAY)).toEqual([]);
    expect(s.onAdded).not.toHaveBeenCalled();
    expect(s.onClose).toHaveBeenCalledTimes(1);
  });

  it('says so when the log fails, and stays open with the amount', async () => {
    const user = userEvent.setup();
    const h = await openWater({
      on: true,
      wrap: (real) => ({ ...real, logWater: () => Promise.reject(new Error('disk full')) }),
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onClose = vi.fn();
    h.mount(<Host day={TODAY} unit="ml" onAdded={vi.fn()} onClose={onClose} />);
    await untilShown(SHEET);
    const field = screen.getByRole('textbox', { name: words.custom.field });

    await user.type(field, '300');
    await user.click(screen.getByRole('button', { name: common.common.add }));

    await settle(() => document.querySelector('[data-ui="toast.message"]') !== null);
    expect(screen.getByText(words.menu.logFailed)).toBeVisible();
    expect(field).toHaveValue('300');
    expect(onClose).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
