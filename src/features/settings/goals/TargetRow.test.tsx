import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { goals } from '../../../i18n/en/goals';
import { TargetRow } from './TargetRow';

const words = goals.goals.page.targets;

function renderRow(locked: boolean, readOnly: boolean, describedBy?: string) {
  const onSelect = vi.fn();
  render(
    <>
      <p id="why">{'Explained elsewhere'}</p>
      <TargetRow
        label="Protein"
        value="150 g"
        locked={locked}
        readOnly={readOnly}
        describedBy={describedBy}
        onSelect={onSelect}
        data-ui="goals.target.protein"
      />
    </>,
  );
  return { onSelect, row: screen.getByRole('button') };
}

describe('TargetRow', () => {
  it('names the target, its value and a locked glyph', () => {
    const { row } = renderRow(true, false);

    expect(row).toHaveAccessibleName(`Protein 150 g ${words.locked}`);
    const glyph = screen.getByRole('img', { name: words.locked });
    expect(glyph).toHaveAttribute('data-locked');
    expect(glyph).not.toHaveAttribute('data-dimmed');
  });

  it('shows an open glyph for a value left to the automatic balance', () => {
    const { row } = renderRow(false, false);

    expect(row).toHaveAccessibleName(`Protein 150 g ${words.auto}`);
    expect(screen.getByRole('img', { name: words.auto })).not.toHaveAttribute('data-locked');
  });

  it('dims the glyph while the tune-up owns the targets and is described by the reason', () => {
    const { row } = renderRow(true, true, 'why');

    expect(screen.getByRole('img', { name: words.locked })).toHaveAttribute('data-dimmed');
    expect(row).toHaveAccessibleDescription('Explained elsewhere');
  });

  it('reports a tap, read-only or not: the page decides what it does', async () => {
    const user = userEvent.setup();
    const { onSelect, row } = renderRow(false, true);

    await user.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
