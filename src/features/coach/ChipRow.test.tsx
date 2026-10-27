import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GoalKind } from '../../domain/model';
import { coach } from '../../i18n/en/coach';
import { makeProfile } from '../../test/factories';
import { closeHarnesses, openHarness, until } from '../../test/screenHarness';
import { ChipRow, type ChipRowProps } from './ChipRow';
import { chipsFor, useCoachChips, type CoachChip } from './chips';

afterEach(closeHarnesses);

const words = coach.coach.chips;

function renderRow(props: Partial<ChipRowProps> = {}) {
  const onSend = vi.fn();
  const onPhotoUsed = vi.fn();
  const view = render(
    <ChipRow
      chips={chipsFor('lose')}
      pending={false}
      onSend={onSend}
      onPhotoUsed={onPhotoUsed}
      {...props}
    />,
  );
  return { ...view, onSend, onPhotoUsed };
}

function chipTexts(): string[] {
  const group = screen.getByRole('group', { name: words.label });
  return within(group)
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
}

describe('ChipRow: what shows', () => {
  it('shows the four lose chips in a row', () => {
    renderRow();
    expect(chipTexts()).toEqual([
      words.lose.projection,
      words.lose.faster,
      words.lose.intake,
      words.lose.dinner,
    ]);
    expect(document.querySelector('[data-ui="coach.chips"]')).not.toBeNull();
  });

  it('shows only the first four of a longer list as the empty chat’s cards', () => {
    const extra: CoachChip = { id: 'extra.one', text: 'A fifth question' };
    renderRow({ chips: [...chipsFor('maintain'), extra], layout: 'cards' });

    expect(chipTexts()).toEqual([
      words.maintain.stable,
      words.maintain.average,
      words.maintain.macros,
      words.maintain.trend,
    ]);
    expect(document.querySelector('[data-ui="coach.cards"]')).not.toBeNull();
    expect(screen.queryByText('A fifth question')).toBeNull();
  });

  it('shows every chip of a longer list in the row', () => {
    const extra: CoachChip = { id: 'extra.one', text: 'A fifth question' };
    renderRow({ chips: [...chipsFor('maintain'), extra] });
    expect(chipTexts()).toHaveLength(5);
  });

  it('renders nothing without chips', () => {
    const { container } = renderRow({ chips: [] });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ChipRow: sending (D-16.33, R04.14)', () => {
  it('sends the chip’s words at once when tapped', () => {
    const { onSend, onPhotoUsed } = renderRow();

    fireEvent.click(screen.getByRole('button', { name: words.lose.dinner }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(words.lose.dinner);
    expect(onPhotoUsed).not.toHaveBeenCalled();
  });

  it('sends the attached photo with the chip and clears it (ACC-I3-2, R04.14)', () => {
    const photo = new Blob([new Uint8Array(16)], { type: 'image/jpeg' });
    const { onSend, onPhotoUsed } = renderRow({ photo, layout: 'cards' });

    fireEvent.click(screen.getByRole('button', { name: words.lose.intake }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(words.lose.intake, photo);
    expect(onPhotoUsed).toHaveBeenCalledTimes(1);
    expect(onSend.mock.invocationCallOrder[0]).toBeLessThan(
      onPhotoUsed.mock.invocationCallOrder[0]!,
    );
  });

  it.each(['row', 'cards'] as const)(
    'disables every chip while a reply is pending (%s)',
    (layout) => {
      const photo = new Blob([new Uint8Array(16)], { type: 'image/jpeg' });
      const { onSend, onPhotoUsed } = renderRow({ pending: true, layout, photo });

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(4);
      for (const button of buttons) expect(button).toBeDisabled();
      fireEvent.click(buttons[0]!);

      expect(onSend).not.toHaveBeenCalled();
      expect(onPhotoUsed).not.toHaveBeenCalled();
    },
  );
});

/** The chips of the stored goal, as the Coach page mounts them. */
function LiveChips({ onSend }: { onSend: (text: string) => void }) {
  const chips = useCoachChips();
  return <ChipRow chips={chips} pending={false} onSend={onSend} />;
}

function showsGoal(goal: GoalKind): boolean {
  const shown = Array.from(document.querySelectorAll('[data-chip]')).map((chip) =>
    chip.getAttribute('data-chip'),
  );
  return shown.length === 4 && shown.every((id) => id?.startsWith(`${goal}.`));
}

describe('useCoachChips: chips follow the goal live', () => {
  it('switches from the lose chips to the gain chips when the goal changes (ACC-I3-1)', async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile({ goal: 'lose' }));
    h.mount(<LiveChips onSend={vi.fn()} />);
    await until(() => showsGoal('lose'));
    expect(chipTexts()[1]).toBe(words.lose.faster);

    await h.repos.profileRepo.save(makeProfile({ goal: 'gain' }));
    await until(() => showsGoal('gain'));

    expect(chipTexts()).toEqual([
      words.gain.projection,
      words.gain.healthy,
      words.gain.intake,
      words.gain.protein,
    ]);
  });
});

describe('ChipRow: one sideways row (P13)', () => {
  // Tests run in Node, but the app's tsconfig has no Node types: this is all we use of node:fs.
  let stylesheet = '';
  beforeAll(async () => {
    const NODE_FS = 'node:fs';
    const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
      readFileSync(path: string, encoding: 'utf8'): string;
    };
    const here = decodeURIComponent(new URL(import.meta.url).pathname);
    stylesheet = fs.readFileSync(here.replace(/[^/]+$/, 'chips.module.css'), 'utf8');
  });

  const rule = (selector: string): string =>
    new RegExp(`\\n${selector.replace('.', '\\.')} \\{([^}]*)\\}`).exec(stylesheet)?.[1] ?? '';

  it('keeps the chips in one row that scrolls sideways when they do not fit', () => {
    renderRow();
    expect(screen.getByRole('group', { name: words.label })).toHaveAttribute(
      'data-ui',
      'coach.chips',
    );
    expect(rule('.row')).toContain('display: flex;');
    expect(rule('.row')).toContain('overflow-x: auto;');
    expect(rule('.row')).not.toContain('flex-wrap');
    expect(rule('.chip')).toContain('flex: none;');
    expect(rule('.chip')).toContain('white-space: nowrap;');
  });
});
