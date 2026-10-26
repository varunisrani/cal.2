import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DiaryEntry } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { common } from '../../i18n/en/common';
import { home } from '../../i18n/en/home';
import { fixedClock } from '../../lib/clock';
import { ServicesProvider, type Services } from '../../services/context';
import type { DiaryService } from '../../services/diary';
import { FACTORY_NOW, makeEntry } from '../../test/factories';
import { ToastProvider } from '../../ui/Toast';
import { EntryRow } from './EntryRow';

const words = home.home.entry;

function renderRow(
  entry: DiaryEntry,
  unit: EnergyDisplayUnit = 'kcal',
  deleteEntry: DiaryService['deleteEntry'] = async () => ({
    kind: 'deleted',
    releasedPhotoIds: [],
  }),
) {
  const services: Services = {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn(deleteEntry) },
    onboarding: { complete: vi.fn() },
    aiSetup: {
      saveChoice: vi.fn(),
      savedKeyMask: vi.fn(),
      setTermsAccepted: vi.fn(),
      setUpLater: vi.fn(),
    },
    planBuilder: { build: vi.fn() },
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <ToastProvider>{children}</ToastProvider>
    </ServicesProvider>
  );
  const view = render(<EntryRow entry={entry} energyUnit={unit} />, { wrapper });
  const slide = document.querySelector<HTMLElement>('[data-part="slide"]');
  if (!slide) throw new Error('row not drawn');
  // jsdom lays nothing out: a phone-wide row.
  vi.spyOn(slide, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 72));
  return { ...view, slide, deleteEntry: services.diary.deleteEntry };
}

/** Drags the row from x 350 to `to` and lets go. */
function swipe(slide: HTMLElement, to: number) {
  fireEvent.pointerDown(slide, { pointerId: 1, clientX: 350, clientY: 30, button: 0 });
  fireEvent.pointerMove(slide, { pointerId: 1, clientX: 330, clientY: 30 });
  fireEvent.pointerMove(slide, { pointerId: 1, clientX: to, clientY: 30 });
  fireEvent.pointerUp(slide, { pointerId: 1, clientX: to, clientY: 30, button: 0 });
}

const toast = () =>
  makeEntry({
    name: 'Toast',
    kcal: 250,
    protein: 3.4,
    carbs: 30.2,
    fat: 2.4,
    source: 'manual',
    loggedAt: FACTORY_NOW,
  });

describe('EntryRow', () => {
  it('is announced by its name and its energy in the chosen unit', () => {
    const { rerender } = renderRow(toast());
    expect(screen.getByRole('group', { name: 'Toast 250 kcal' })).toBeVisible();

    rerender(<EntryRow entry={toast()} energyUnit="kJ" />);
    expect(screen.getByRole('group', { name: 'Toast 1,046 kJ' })).toBeVisible();
  });

  it('shows the time and the macros in whole grams', () => {
    renderRow(toast());
    const row = screen.getByRole('group', { name: 'Toast 250 kcal' });
    expect(within(row).getByText('12:30 PM')).toBeVisible();
    expect(within(row).getByText('P 3 · C 30 · F 2')).toBeVisible();
    expect(document.querySelector('[data-ui="entry.row"]')).not.toBeNull();
  });

  it('shows the emoji when there is one, else an icon for how the entry was logged', () => {
    const { rerender } = renderRow({ ...toast(), emoji: '🍞' });
    expect(screen.getByText('🍞')).toBeInTheDocument();
    expect(document.querySelector('[data-icon="pencil"]')).toBeNull();

    rerender(<EntryRow entry={toast()} energyUnit="kcal" />);
    expect(document.querySelector('[data-icon="pencil"]')).not.toBeNull();
    rerender(<EntryRow entry={{ ...toast(), source: 'photo' }} energyUnit="kcal" />);
    expect(document.querySelector('[data-icon="camera"]')).not.toBeNull();
  });

  it('asks before deleting when swiped past the threshold; Cancel keeps the row', () => {
    const { slide, deleteEntry } = renderRow(toast());
    swipe(slide, 100);

    const dialog = screen.getByRole('alertdialog', { name: words.deleteTitle });
    expect(dialog).toHaveAttribute('data-ui', 'entry.delete');
    expect(dialog).toHaveAccessibleDescription('Toast will be removed from your diary.');
    fireEvent.click(within(dialog).getByRole('button', { name: common.common.cancel }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Toast 250 kcal' })).toBeVisible();
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it('asks nothing after a short swipe', () => {
    const { slide } = renderRow(toast());
    swipe(slide, 250);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('deletes the entry once when Delete is confirmed', async () => {
    const entry = toast();
    const { slide, deleteEntry } = renderRow(entry);
    swipe(slide, 100);
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: common.common.delete,
    });

    await act(async () => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });

    expect(deleteEntry).toHaveBeenCalledExactlyOnceWith(entry.id);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('opens the same question from the keyboard delete button', () => {
    renderRow(toast());
    const button = screen.getByRole('button', { name: 'Delete Toast' });
    expect(button).toHaveAttribute('data-ui', 'entry.row.delete');
    fireEvent.click(button);
    expect(screen.getByRole('alertdialog', { name: words.deleteTitle })).toBeVisible();
  });

  it('keeps the row and says so when the delete fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderRow(toast(), 'kcal', async () => {
      throw new Error('disk');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Toast' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: common.common.delete }));
    });

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(words.deleteFailed);
    expect(screen.getByRole('group', { name: 'Toast 250 kcal' })).toBeVisible();
  });
});
