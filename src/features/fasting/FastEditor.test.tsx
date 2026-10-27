import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fast } from '../../domain/model';
import { common } from '../../i18n/en/common';
import { fasting } from '../../i18n/en/fasting';
import type { FastingService } from '../../services/fasting';
import { FACTORY_NOW, makeFast } from '../../test/factories';
import { closeHarnesses, untilShown } from '../../test/screenHarness';
import { settle } from '../water/testing/openWater';
import { FastEditor } from './FastEditor';
import { openFasting } from './testing/openFasting';

afterEach(closeHarnesses);

const words = fasting.fasting.editor;
const HOUR = 3_600_000;
/** An instant on Monday 26 October 2026 (the harness's today) or the day before, in New York. */
const at = (time: string, day = '2026-10-26') => Date.parse(`${day}T${time}:00-04:00`);

const hooked = (hook: string) => document.querySelector<HTMLInputElement>(`[data-ui="${hook}"]`);

function setTime(field: 'started' | 'ended', part: 'date' | 'time', value: string) {
  fireEvent.change(hooked(`fast.editor.${field}.${part}`) as HTMLElement, { target: { value } });
}

/** A fast service whose writes are counted. */
function counting(real: FastingService) {
  return {
    ...real,
    edit: vi.fn(real.edit),
    endNow: vi.fn(real.endNow),
  };
}

async function openEditor(fast: Fast, others: readonly Fast[] = []) {
  const user = userEvent.setup();
  let spied: ReturnType<typeof counting> | undefined;
  const h = await openFasting({
    on: true,
    fasts: [fast, ...others],
    wrap: (real) => (spied = counting(real)),
  });
  const onClose = vi.fn();
  h.mount(<FastEditor open fast={fast} onClose={onClose} />);
  await untilShown('[data-ui="fast.editor"]');
  const title = fast.end === null ? words.titleActive : words.titleDone;
  const sheet = within(screen.getByRole('dialog', { name: title }));
  const press = (name: string) => user.click(sheet.getByRole('button', { name }));
  const closed = () => settle(() => onClose.mock.calls.length > 0);
  if (!spied) throw new Error('the service was not wrapped');
  return { ...h, user, onClose, sheet, press, closed, service: spied };
}

describe('FastEditor', () => {
  it('opens a running fast as Active fast: Started and the goal, End fast now and Cancel fast', async () => {
    const running = makeFast({ start: at('08:00'), end: null, goalMin: 960 });
    const e = await openEditor(running);

    expect(hooked('fast.editor.started.date')).toHaveValue('2026-10-26');
    expect(hooked('fast.editor.started.time')).toHaveValue('08:00');
    expect(hooked('fast.editor.ended')).toBeNull();
    expect(e.sheet.getByRole('spinbutton', { name: words.goal })).toHaveAttribute(
      'aria-valuetext',
      '16 hours',
    );
    expect(e.sheet.getByRole('button', { name: words.endNow })).toBeVisible();
    expect(e.sheet.getByRole('button', { name: words.cancelFast })).toBeVisible();
    expect(e.sheet.queryByRole('button', { name: words.deleteFast })).toBeNull();
  });

  it('opens a finished fast as Edit fast with Ended and Delete fast, neither time after now', async () => {
    const done = makeFast({ start: at('20:00', '2026-10-25'), end: at('10:15'), goalMin: 14 * 60 });
    const e = await openEditor(done);

    expect(hooked('fast.editor.started.date')).toHaveValue('2026-10-25');
    expect(hooked('fast.editor.ended.time')).toHaveValue('10:15');
    expect(hooked('fast.editor.ended.date')).toHaveAttribute('min', '2026-10-25');
    expect(hooked('fast.editor.ended.date')).toHaveAttribute('max', '2026-10-26');
    expect(hooked('fast.editor.ended.time')).toHaveAttribute('max', '12:30');
    expect(hooked('fast.editor.started.date')).toHaveAttribute('max', '2026-10-26');
    expect(e.sheet.getByRole('button', { name: words.deleteFast })).toBeVisible();
    expect(e.sheet.queryByRole('button', { name: words.endNow })).toBeNull();
  });

  it('keeps a running fast running on Save, with the new start and goal', async () => {
    const running = makeFast({ id: 'running', start: at('08:00'), end: null, goalMin: 960 });
    const e = await openEditor(running);

    setTime('started', 'time', '07:00');
    await e.user.click(e.sheet.getByRole('button', { name: `Increase ${words.goal}` }));
    await e.press(common.common.save);

    await e.closed();
    expect(await e.storedFasts()).toEqual([
      { id: 'running', start: at('07:00'), end: null, goalMin: 17 * 60 },
    ]);
  });

  it('applies the edited start and goal and ends the fast now in one write (ACC-H8-1, R05.3)', async () => {
    const running = makeFast({ id: 'running', start: at('08:00'), end: null, goalMin: 960 });
    const e = await openEditor(running);

    setTime('started', 'time', '06:00');
    await e.user.click(e.sheet.getByRole('button', { name: `Decrease ${words.goal}` }));
    await e.press(words.endNow);

    await e.closed();
    expect(e.service.endNow).toHaveBeenCalledTimes(1);
    expect(e.service.endNow).toHaveBeenCalledWith('running', {
      start: at('06:00'),
      goalMin: 15 * 60,
    });
    expect(e.service.edit).not.toHaveBeenCalled();
    expect(await e.storedFasts()).toEqual([
      { id: 'running', start: at('06:00'), end: FACTORY_NOW, goalMin: 15 * 60 },
    ]);
  });

  it('refuses an edit that overlaps another fast: says so with a hint and changes nothing (ACC-H9-1, R05.3)', async () => {
    const night = makeFast({ id: 'night', start: at('20:00', '2026-10-25'), end: at('08:00') });
    const short = makeFast({ id: 'short', start: at('09:00'), end: at('11:00'), goalMin: 120 });
    const e = await openEditor(short, [night]);

    setTime('started', 'time', '07:00');
    await e.press(common.common.save);

    await settle(() => hooked('fast.editor.overlap') !== null);
    const refusal = screen.getByRole('alertdialog', { name: words.overlap.title });
    expect(refusal).toHaveTextContent(words.overlap.message);
    expect(await e.storedFasts()).toEqual([night, short]);
    expect(e.onClose).not.toHaveBeenCalled();

    fireEvent.click(within(refusal).getByRole('button', { name: words.overlap.ok }));
    expect(hooked('fast.editor.overlap')).toBeNull();
    // The edit is still there to correct.
    expect(hooked('fast.editor.started.time')).toHaveValue('07:00');
  });

  it('leaves the fast running as it was when End fast now would overlap another (R05.3)', async () => {
    const night = makeFast({ id: 'night', start: at('20:00', '2026-10-25'), end: at('08:00') });
    const running = makeFast({ id: 'running', start: at('09:00'), end: null });
    const e = await openEditor(running, [night]);

    setTime('started', 'time', '07:30');
    await e.press(words.endNow);

    await settle(() => hooked('fast.editor.overlap') !== null);
    expect(await e.storedFasts()).toEqual([night, running]);
    expect(e.onClose).not.toHaveBeenCalled();
  });

  it('never lets Ended be before Started: a start moved past the end takes the end along', async () => {
    const done = makeFast({ id: 'done', start: at('09:00'), end: at('11:00'), goalMin: 120 });
    const e = await openEditor(done);

    setTime('started', 'time', '11:30');
    expect(hooked('fast.editor.ended.time')).toHaveValue('11:30');
    expect(hooked('fast.editor.ended.time')).toHaveAttribute('min', '11:30');
    await e.press(common.common.save);

    await e.closed();
    expect(await e.storedFasts()).toEqual([
      { id: 'done', start: at('11:30'), end: at('11:30'), goalMin: 120 },
    ]);
  });

  it('moves the end of a finished fast and keeps the fields left alone exactly as stored', async () => {
    // Seconds on the start and a goal that is not a whole number of hours, as an import may hold.
    const start = at('20:00', '2026-10-25') + 15_123;
    const done = makeFast({ id: 'done', start, end: at('08:00'), goalMin: 90 });
    const e = await openEditor(done);
    expect(e.sheet.getByRole('spinbutton', { name: words.goal })).toHaveAttribute(
      'aria-valuetext',
      '1 hour',
    );

    setTime('ended', 'time', '09:45');
    await e.press(common.common.save);

    await e.closed();
    expect(await e.storedFasts()).toEqual([{ id: 'done', start, end: at('09:45'), goalMin: 90 }]);
  });

  it('cancels a running fast so it leaves no history (ACC-H7-1)', async () => {
    const running = makeFast({ id: 'running', start: FACTORY_NOW - 2 * HOUR, end: null });
    const e = await openEditor(running);

    await e.press(words.cancelFast);

    await e.closed();
    expect(await e.storedFasts()).toEqual([]);
  });

  it('deletes a finished fast at once', async () => {
    const done = makeFast({ id: 'done', start: at('09:00'), end: at('11:00') });
    const kept = makeFast({
      id: 'kept',
      start: at('20:00', '2026-10-24'),
      end: at('08:00', '2026-10-25'),
    });
    const e = await openEditor(done, [kept]);

    await e.press(words.deleteFast);

    await e.closed();
    expect(await e.storedFasts()).toEqual([kept]);
  });

  it('drops the edits on Cancel', async () => {
    const running = makeFast({ id: 'running', start: at('08:00'), end: null });
    const e = await openEditor(running);

    setTime('started', 'time', '07:00');
    await e.press(common.common.cancel);

    expect(e.onClose).toHaveBeenCalledTimes(1);
    expect(await e.storedFasts()).toEqual([running]);
  });

  it('says so and closes when the fast was ended or deleted somewhere else', async () => {
    const running = makeFast({ id: 'running', start: at('08:00'), end: null });
    const e = await openEditor(running);
    await e.repos.fastRepo.end('running', at('10:00'));

    await e.press(words.endNow);

    await e.closed();
    expect(hooked('toast.message')).toHaveTextContent(words.gone);
    expect(await e.storedFasts()).toEqual([{ ...running, end: at('10:00') }]);
  });
});
