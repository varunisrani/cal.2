import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiaryEntry } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { common } from '../../i18n/en/common';
import { home } from '../../i18n/en/home';
import { fixedClock } from '../../lib/clock';
import { ServicesProvider, type Services } from '../../services/context';
import type { DiaryService } from '../../services/diary';
import { FACTORY_NOW, makeEntry } from '../../test/factories';
import { ToastProvider } from '../../ui/Toast';
import { EntryRow, LONG_PRESS_MS, type FoodRowActions } from './EntryRow';

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

  it('shows its price quietly before the time, and nothing for an entry without one (D-16.107)', () => {
    const { rerender } = renderRow({ ...toast(), price: { amount: 120, currency: 'INR' } });
    const row = screen.getByRole('group', { name: 'Toast 250 kcal' });
    const price = within(row).getByText('₹120');
    expect(price).toHaveAttribute('data-ui', 'price.row');
    expect(price.nextElementSibling).toHaveTextContent('12:30 PM');

    rerender(
      <EntryRow
        entry={{ ...toast(), price: { amount: 4.5, currency: 'USD' } }}
        energyUnit="kcal"
      />,
    );
    expect(within(row).getByText('$4.50')).toBeVisible();

    rerender(<EntryRow entry={toast()} energyUnit="kcal" />);
    expect(document.querySelector('[data-ui="price.row"]')).toBeNull();
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

// ---- On Home: tap, long-press, Select and the heart (P06-19) ----------------------------------

const FAKED = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] as const;

afterEach(() => {
  vi.useRealTimers();
});

interface HomeRowSetup {
  readonly picked?: ReadonlySet<string> | null;
  readonly saved?: ReadonlySet<string> | null;
  readonly toggleSaved?: DiaryService['toggleSaved'];
}

/** The row as Home draws it, with stand-in row actions and a diary that can save. */
function renderHomeRow(entry: DiaryEntry, setup: HomeRowSetup = {}) {
  const toggleSaved = vi.fn<NonNullable<DiaryService['toggleSaved']>>(
    setup.toggleSaved ?? (async () => ({ kind: 'saved' })),
  );
  const services: Services = {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn(), toggleSaved },
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
  const actions = {
    picked: setup.picked ?? null,
    saved: setup.saved === undefined ? new Set<string>() : setup.saved,
    onOpen: vi.fn<FoodRowActions['onOpen']>(),
    onPick: vi.fn<FoodRowActions['onPick']>(),
    onToggle: vi.fn<FoodRowActions['onToggle']>(),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <ToastProvider>{children}</ToastProvider>
    </ServicesProvider>
  );
  const view = render(<EntryRow entry={entry} energyUnit="kcal" actions={actions} />, { wrapper });
  const slide = document.querySelector<HTMLElement>('[data-part="slide"]');
  if (!slide) throw new Error('row not drawn');
  vi.spyOn(slide, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 72));
  return { ...view, slide, actions, toggleSaved };
}

/** The row's tap target. */
const target = () =>
  document.querySelector<HTMLElement>('[data-ui="entry.row.open"]') as HTMLElement;

/** Presses the row at (100, 30) and holds it for `ms`. */
function hold(ms: number) {
  fireEvent.pointerDown(target(), { pointerId: 7, button: 0, clientX: 100, clientY: 30 });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('EntryRow: on Home (P06-19)', () => {
  it('keeps the row announced by its name and energy, and opens the entry on a tap', () => {
    const entry = toast();
    const { actions } = renderHomeRow(entry);
    const row = screen.getByRole('group', { name: 'Toast 250 kcal' });
    expect(within(row).getByText('12:30 PM')).toBeVisible();

    fireEvent.click(within(row).getByRole('button', { name: 'Edit Toast' }));

    expect(actions.onOpen).toHaveBeenCalledExactlyOnceWith(entry);
    expect(actions.onPick).not.toHaveBeenCalled();
  });

  it('starts picking after a press held still for half a second, and the click that ends it does nothing more (ACC-F12-1)', () => {
    vi.useFakeTimers({ toFake: [...FAKED] });
    const entry = toast();
    const { actions } = renderHomeRow(entry);

    hold(LONG_PRESS_MS - 1);
    expect(actions.onPick).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(actions.onPick).toHaveBeenCalledExactlyOnceWith(entry);

    fireEvent.pointerUp(target(), { pointerId: 7, button: 0, clientX: 100, clientY: 30 });
    fireEvent.click(target());
    expect(actions.onOpen).not.toHaveBeenCalled();
    expect(actions.onToggle).not.toHaveBeenCalled();

    // The next tap is an ordinary one again.
    fireEvent.click(target());
    expect(actions.onOpen).toHaveBeenCalledOnce();
  });

  it('keeps a press that moves, or is let go early, an ordinary press', () => {
    vi.useFakeTimers({ toFake: [...FAKED] });
    const { actions } = renderHomeRow(toast());

    hold(100);
    fireEvent.pointerMove(target(), { pointerId: 7, clientX: 100, clientY: 45 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    hold(300);
    fireEvent.pointerUp(target(), { pointerId: 7, button: 0, clientX: 100, clientY: 30 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });

    expect(actions.onPick).not.toHaveBeenCalled();
    fireEvent.click(target());
    expect(actions.onOpen).toHaveBeenCalledOnce();
  });

  it('starts picking from the keyboard Select button and keeps the focus on the row', () => {
    const entry = toast();
    const { actions } = renderHomeRow(entry);
    const select = screen.getByRole('button', { name: 'Select Toast' });
    expect(select).toHaveAttribute('data-ui', 'entry.row.select');

    select.focus();
    fireEvent.click(select);

    expect(actions.onPick).toHaveBeenCalledExactlyOnceWith(entry);
    expect(target()).toHaveFocus();
  });

  it('while picking, shows whether the row is picked, toggles it on a tap and offers no swipe, delete or heart', () => {
    const entry = toast();
    const { actions, slide, rerender } = renderHomeRow(entry, {
      picked: new Set([entry.id]),
      saved: new Set([entry.id]),
    });
    const row = screen.getByRole('button', { name: 'Select Toast' });
    expect(row).toBe(target());
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Delete Toast' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Toast' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Toast' })).toBeNull();

    fireEvent.click(row);
    expect(actions.onToggle).toHaveBeenCalledExactlyOnceWith(entry);
    expect(actions.onOpen).not.toHaveBeenCalled();
    swipe(slide, 100);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    rerender(
      <EntryRow entry={entry} energyUnit="kcal" actions={{ ...actions, picked: new Set() }} />,
    );
    expect(target()).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the heart pressed for an entry with a saved copy, and toggles the saved meal from the row', async () => {
    const entry = toast();
    const { toggleSaved, actions, rerender } = renderHomeRow(entry, { saved: new Set([entry.id]) });
    const heart = screen.getByRole('button', { name: 'Save Toast' });
    expect(heart).toHaveAttribute('data-ui', 'entry.row.saved');
    expect(heart).toHaveAttribute('aria-pressed', 'true');

    await act(async () => {
      fireEvent.click(heart);
    });
    expect(toggleSaved).toHaveBeenCalledExactlyOnceWith(entry);
    expect(actions.onOpen).not.toHaveBeenCalled();

    rerender(
      <EntryRow entry={entry} energyUnit="kcal" actions={{ ...actions, saved: new Set() }} />,
    );
    expect(screen.getByRole('button', { name: 'Save Toast' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('draws no heart until the saved meals have been read', () => {
    renderHomeRow(toast(), { saved: null });
    expect(screen.queryByRole('button', { name: 'Save Toast' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Toast' })).toBeVisible();
  });

  it('says so when the saved meals cannot be changed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHomeRow(toast(), {
      toggleSaved: async () => {
        throw new Error('disk');
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Toast' }));
    });

    expect(screen.getByRole('status')).toHaveTextContent(words.saveFailed);
  });
});
