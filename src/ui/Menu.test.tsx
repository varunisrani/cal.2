import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { display } from '../i18n/en/display';
import { Icon } from './icons';
import { Menu, type MenuAction, type MenuEntry } from './Menu';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BACK = display.display.menu.back;

/**
 * user-event on fake timers. Testing Library's async wrapper ends each call on a 0 ms timeout
 * that it advances only through a global `jest`; the stub hands it Vitest's clock.
 */
function setup() {
  vi.useFakeTimers();
  vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}

/** An add menu like Home's: two actions, a hairline, then a Water page. */
function addMenuEntries() {
  const chosen = vi.fn<(id: string) => void>();
  const action = (id: string, label: string): MenuAction => ({
    kind: 'action',
    id,
    label,
    onSelect: () => chosen(id),
  });
  const entries: MenuEntry[] = [
    { ...action('manual', 'Enter manually'), icon: <Icon name="pencil" /> },
    action('photo', 'Snap a photo'),
    { kind: 'separator', id: 'tools' },
    {
      kind: 'page',
      id: 'water',
      label: 'Water',
      icon: <Icon name="drop" />,
      entries: [
        action('water250', '250 ml'),
        action('water500', '500 ml'),
        action('custom', 'Custom'),
      ],
    },
  ];
  return { entries, chosen };
}

function renderMenu(extra: Partial<Parameters<typeof Menu>[0]> = {}) {
  const { entries, chosen } = addMenuEntries();
  render(
    <>
      <Menu label="Add" entries={entries} data-ui="add-menu" {...extra} />
      <button type="button">After</button>
    </>,
  );
  return { chosen, trigger: screen.getByRole('button', { name: 'Add' }) };
}

const focusedName = () => document.activeElement?.textContent;

describe('Menu', () => {
  it('opens under its button on a click with the first row focused', async () => {
    const user = setup();
    const { trigger } = renderMenu();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Add' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(menu).toHaveAttribute('data-placement', 'below');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((row) => row.textContent),
    ).toEqual(['Enter manually', 'Snap a photo', 'Water']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Enter manually' })).toHaveFocus();
  });

  it('roves the focus with the arrow keys, wrapping at both ends', async () => {
    const user = setup();
    const { trigger } = renderMenu();
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(focusedName()).toBe('Enter manually');
    await user.keyboard('{ArrowDown}');
    expect(focusedName()).toBe('Snap a photo');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(focusedName()).toBe('Enter manually');
    await user.keyboard('{ArrowUp}');
    expect(focusedName()).toBe('Water');
    await user.keyboard('{Home}');
    expect(focusedName()).toBe('Enter manually');
    await user.keyboard('{End}');
    expect(focusedName()).toBe('Water');
    // Every row stays out of the Tab order; the arrows move the focus.
    for (const row of screen.getAllByRole('menuitem'))
      expect(row).toHaveAttribute('tabindex', '-1');
  });

  it('opens on the last row with ArrowUp and on the first with ArrowDown', async () => {
    const user = setup();
    const { trigger } = renderMenu();
    trigger.focus();
    await user.keyboard('{ArrowUp}');
    expect(focusedName()).toBe('Water');
    await user.keyboard('{Escape}');
    await user.keyboard('{ArrowDown}');
    expect(focusedName()).toBe('Enter manually');
  });

  it('opens a nested page and comes back with the Back row, all by keyboard', async () => {
    const user = setup();
    const { trigger } = renderMenu();
    trigger.focus();
    await user.keyboard('{Enter}{End}{Enter}');

    const page = screen.getByRole('menu', { name: 'Water' });
    expect(
      within(page)
        .getAllByRole('menuitem')
        .map((row) => row.textContent),
    ).toEqual(['250 ml', '500 ml', 'Custom', BACK]);
    expect(focusedName()).toBe('250 ml');

    await user.keyboard('{End}');
    expect(focusedName()).toBe(BACK);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
    // Back lands on the row that opened the page.
    expect(focusedName()).toBe('Water');
  });

  it('opens a page with ArrowRight and goes back with ArrowLeft or Escape', async () => {
    const user = setup();
    const { trigger } = renderMenu();
    trigger.focus();
    await user.keyboard('{ArrowUp}{ArrowRight}');
    expect(screen.getByRole('menu', { name: 'Water' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
    expect(focusedName()).toBe('Water');
    await user.keyboard('{ArrowRight}{Escape}');
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
    expect(focusedName()).toBe('Water');
    // ArrowRight on an action row does nothing.
    await user.keyboard('{Home}{ArrowRight}');
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
  });

  it('closes on Escape from the top page and gives the focus back to the button', async () => {
    const user = setup();
    const { trigger } = renderMenu();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('runs a chosen action once, after closing and refocusing the button', async () => {
    const user = setup();
    const { entries } = addMenuEntries();
    let focusedDuringAction: Element | null = null;
    const onSelect = vi.fn(() => {
      focusedDuringAction = document.activeElement;
    });
    const withSpy = entries.map((entry) =>
      entry.id === 'manual' ? { ...entry, onSelect } : entry,
    );
    render(<Menu label="Add" entries={withSpy} />);
    const trigger = screen.getByRole('button', { name: 'Add' });

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Enter manually' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(focusedDuringAction).toBe(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs an action in a nested page by keyboard and reopens on the top page', async () => {
    const user = setup();
    const { trigger, chosen } = renderMenu();
    trigger.focus();
    await user.keyboard('{ArrowUp}{Enter}{ArrowDown}{Enter}');
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(chosen).toHaveBeenCalledWith('water500');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
    expect(focusedName()).toBe('Enter manually');
  });

  it('activates a row with Space', async () => {
    const user = setup();
    const { trigger, chosen } = renderMenu();
    trigger.focus();
    await user.keyboard('{Enter}{ArrowDown} ');
    expect(chosen).toHaveBeenCalledExactlyOnceWith('photo');
  });

  it('shows the selected choice as a checked radio row', async () => {
    const user = setup();
    const sort = vi.fn();
    render(
      <Menu
        label="Sort"
        icon={<Icon name="sort" size={18} />}
        entries={[
          { kind: 'action', id: 'byMeal', label: 'By meal', selected: true, onSelect: sort },
          {
            kind: 'action',
            id: 'newestFirst',
            label: 'Newest first',
            selected: false,
            onSelect: sort,
          },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    expect(screen.getByRole('menuitemradio', { name: 'By meal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Newest first' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('closes on a press outside without taking the focus back', async () => {
    const user = setup();
    const { trigger } = renderMenu();
    await user.click(trigger);
    const after = screen.getByRole('button', { name: 'After' });
    await user.click(after);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(after).toHaveFocus();
  });

  it('closes on a second click of its button', async () => {
    const user = setup();
    const { trigger } = renderMenu();
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Tab and lets the focus move on', async () => {
    const user = setup();
    const { trigger } = renderMenu();
    await user.click(trigger);
    await user.tab();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(trigger).not.toHaveFocus();
  });

  it('opens over the button and lines up with its end when asked', async () => {
    const user = setup();
    const { trigger } = renderMenu({ placement: 'above', align: 'end' });
    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Add' });
    expect(menu).toHaveAttribute('data-placement', 'above');
    expect(menu).toHaveAttribute('data-align', 'end');
  });

  it('names an icon-only button by its label and tags every row', async () => {
    const user = setup();
    renderMenu({ hideLabel: true, icon: <Icon name="plus" />, backLabel: 'Return' });
    const trigger = screen.getByRole('button', { name: 'Add' });
    expect(trigger).toHaveAttribute('aria-label', 'Add');
    expect(trigger.textContent).toBe('');
    expect(trigger).toHaveAttribute('data-ui', 'add-menu');

    await user.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Enter manually' })).toHaveAttribute(
      'data-ui',
      'add-menu.manual',
    );
    await user.click(screen.getByRole('menuitem', { name: 'Water' }));
    expect(screen.getByRole('menu', { name: 'Water' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Return' })).toHaveAttribute(
      'data-ui',
      'add-menu.back',
    );
  });
});
