import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { addDays, startOfDay } from '../../domain/dates/dayKey';
import type { WeighIn } from '../../domain/model';
import { progress } from '../../i18n/en/progress';
import { WeightCard, type WeightCardProps } from './WeightCard';

const words = progress.progress.weight;
const HOUR = 3_600_000;

/** Morning weigh-ins, one a day from 20 October 2026. */
function mornings(...kgs: number[]): WeighIn[] {
  return kgs.map((kg, index) => ({
    id: `weigh-${index + 1}`,
    at: startOfDay(addDays('2026-10-20', index)) + 8 * HOUR,
    kg,
  }));
}

function renderCard(props: Partial<WeightCardProps> = {}) {
  const readings = props.readings ?? mornings(70.4, 70.1, 69.8);
  const onLog = vi.fn();
  render(
    <WeightCard
      readings={readings}
      latest={readings[readings.length - 1] ?? null}
      unit="kg"
      onLog={onLog}
      {...props}
    />,
  );
  return { onLog };
}

/** The figure of the badge `data-ui` names (its first line), or null when there is none. */
function badge(name: string): string | null {
  const element = document.querySelector(`[data-ui="progress.weight.${name}"]`);
  return element?.firstElementChild?.textContent ?? null;
}

describe('WeightCard', () => {
  it('shows 0.0 without a sign for a net change of −0.04 kg (ACC-G3-2)', () => {
    renderCard({ readings: mornings(70.04, 70.02, 70) });
    expect(badge('change')).toBe('0.0 kg');
  });

  it('signs a gain with + and a loss with −, to one decimal', () => {
    renderCard({ readings: mornings(70, 70.6, 71.94) });
    expect(badge('change')).toBe('+1.9 kg');
  });

  it('writes a loss with a minus sign', () => {
    renderCard({ readings: mornings(72, 71.5, 70.9) });
    expect(badge('change')).toBe('-1.1 kg');
  });

  it('shows the newest weigh-in of all as Current, even when it lies outside the window', () => {
    const outside: WeighIn = { id: 'later', at: startOfDay('2026-11-03') + 8 * HOUR, kg: 68.4 };
    renderCard({ readings: mornings(70.2, 70.6), latest: outside });

    expect(badge('current')).toBe('68.4 kg');
    expect(badge('change')).toBe('+0.4 kg');
    expect(badge('average')).toBe('70.4 kg');
  });

  it('labels the four badges in order, Goal only when a goal weight is set', () => {
    renderCard({ goalKg: 65 });
    const badges = [...document.querySelectorAll('[data-ui^="progress.weight."]')].filter(
      (element) => /\.(current|goal|change|average)$/.test(element.getAttribute('data-ui') ?? ''),
    );
    expect(badges.map((element) => element.lastElementChild?.textContent)).toEqual([
      words.current,
      words.goal,
      words.change,
      words.average,
    ]);
    expect(badge('goal')).toBe('65.0 kg');
  });

  it('has no Goal badge without a goal weight', () => {
    renderCard();
    expect(badge('goal')).toBeNull();
    expect(badge('current')).toBe('69.8 kg');
    expect(badge('average')).toBe('70.1 kg');
  });

  it('writes every figure in pounds when the unit is lb', () => {
    renderCard({ readings: mornings(70, 71), goalKg: 65, unit: 'lb' });
    expect(badge('current')).toBe('156.5 lb');
    expect(badge('goal')).toBe('143.3 lb');
    expect(badge('change')).toBe('+2.2 lb');
    expect(badge('average')).toBe('155.4 lb');
  });

  it('applies the 0.05 rule to the pound value: 0.04 kg is 0.1 lb', () => {
    renderCard({ readings: mornings(70, 70.04), unit: 'lb' });
    expect(badge('change')).toBe('+0.1 lb');
  });

  it('shows a prompt instead of badges and a chart when the window has no weigh-ins', async () => {
    const user = userEvent.setup();
    const { onLog } = renderCard({ readings: [], latest: mornings(70)[0] ?? null });

    expect(screen.getByText(words.empty)).toBeVisible();
    expect(badge('current')).toBeNull();
    expect(screen.queryByRole('figure')).toBeNull();

    await user.click(screen.getByRole('button', { name: words.log }));
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('draws the window with the goal line, and lists the readings as text', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 404, 212),
    );
    renderCard({ goalKg: 68 });

    const chart = screen.getByRole('figure', { name: words.chart });
    expect(chart.querySelector('[data-part="goal"]')).not.toBeNull();
    const rows = within(chart).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.lastElementChild?.textContent)).toEqual([
      '70.4 kg',
      '70.1 kg',
      '69.8 kg',
    ]);
    expect(within(chart).getByText('Goal: 68.0 kg')).toBeInTheDocument();
  });
});
