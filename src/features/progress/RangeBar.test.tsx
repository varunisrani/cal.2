import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { DayKey } from '../../domain/dates/dayKey';
import { FIRST_VIEW, type PeriodView } from '../../domain/progress/ranges';
import { progress } from '../../i18n/en/progress';
import { RangeBar } from './RangeBar';

const words = progress.progress;
const TODAY = '2026-10-26';

/** The bar with its view kept in state, as the page keeps it. */
function Bar({ today = TODAY, initial = FIRST_VIEW }: { today?: DayKey; initial?: PeriodView }) {
  const [view, setView] = useState(initial);
  return <RangeBar view={view} today={today} onChange={setView} />;
}

function setUp(props: { today?: DayKey; initial?: PeriodView } = {}) {
  const user = userEvent.setup();
  render(<Bar {...props} />);
  const label = () => document.querySelector('[data-ui="progress.period.label"]')?.textContent;
  const earlier = () => screen.getByRole('button', { name: words.period.earlier });
  const later = () => screen.getByRole('button', { name: words.period.later });
  const range = (name: string) => user.click(screen.getByRole('radio', { name }));
  return { user, label, earlier, later, range };
}

describe('RangeBar', () => {
  it('opens on 1W with the dates of the last seven days and no year', () => {
    const bar = setUp();
    expect(screen.getByRole('radio', { name: words.range.week })).toBeChecked();
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      '1W',
      '1M',
      '3M',
      '6M',
      '1Y',
      'All',
    ]);
    expect(bar.label()).toBe('Oct 20 – 26');
  });

  it('shows the previous 30 days and their dates after the back arrow on 1M (ACC-G1-1)', async () => {
    const bar = setUp();
    await bar.range(words.range.month);
    expect(bar.label()).toBe('Sep 27 – Oct 26');

    await bar.user.click(bar.earlier());

    expect(bar.label()).toBe('Aug 28 – Sep 26');
  });

  it('keeps the forward arrow off on the current window and turns it on after a step back', async () => {
    const bar = setUp();
    expect(bar.later()).toBeDisabled();

    await bar.user.click(bar.earlier());
    expect(bar.label()).toBe('Oct 13 – 19');
    expect(bar.later()).toBeEnabled();

    await bar.user.click(bar.later());
    expect(bar.label()).toBe('Oct 20 – 26');
    expect(bar.later()).toBeDisabled();
  });

  it('goes back to the current window when the range changes', async () => {
    const bar = setUp();
    await bar.user.click(bar.earlier());
    await bar.user.click(bar.earlier());
    expect(bar.label()).toBe('Oct 6 – 12');

    await bar.range(words.range.quarter);

    expect(bar.label()).toBe('Jul 29 – Oct 26');
    expect(bar.later()).toBeDisabled();
  });

  it('has no period row for All', async () => {
    const bar = setUp();
    await bar.range(words.range.all);

    expect(document.querySelector('[data-ui="progress.period"]')).toBeNull();
    expect(screen.queryByRole('button', { name: words.period.earlier })).toBeNull();
  });

  it('writes the year only when an end of the window lies outside this year', async () => {
    const bar = setUp();
    await bar.range(words.range.year);
    expect(bar.label()).toBe('Oct 27, 2025 – Oct 26, 2026');

    await bar.range(words.range.half);
    expect(bar.label()).toBe('Apr 30 – Oct 26');
  });

  it('writes both years for a week across New Year', () => {
    const bar = setUp({ today: '2026-01-03' });
    expect(bar.label()).toBe('Dec 28, 2025 – Jan 3, 2026');
  });
});
