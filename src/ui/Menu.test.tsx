import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/t';
import { Menu, type MenuEntry } from './Menu';

afterEach(cleanup);

const BACK = t('common.back');

function entriesWith(onSelect: (id: string) => void = () => {}): MenuEntry[] {
  const action = (id: string, label: string, extra: object = {}): MenuEntry => ({
    kind: 'action',
    id,
    label,
    onSelect: () => onSelect(id),
    ...extra,
  });
  return [
    action('manual', 'Enter manually'),
    action('scan', 'Scan', { disabled: true }),
    { kind: 'separator', id: 'line' },
    {
      kind: 'page',
      id: 'water',
      label: 'Water',
      entries: [action('250', '250 ml'), action('500', '500 ml'), action('custom', 'Custom')],
    },
    {
      kind: 'page',
      id: 'fast',
      label: 'Fasting',
      entries: [action('end', 'End fast')],
    },
  ];
}

function renderMenu(onSelect?: (id: string) => void, entries = entriesWith(onSelect)) {
  const user = userEvent.setup();
  const view = render(
    <>
      <Menu data-ui="test.add" label="Add" entries={entries} placement="above" align="end" />
      <input aria-label="After" />
    </>,
  );
  const button = screen.getByRole('button', { name: 'Add' });
  return { user, button, view };
}

const menu = () => screen.getByRole('menu');
const row = (name: string) => within(menu()).getByRole('menuitem', { name });

describe('Menu', () => {
  it('is a menu button that opens with focus on the first row', async () => {
    const { user, button } = renderMenu();
    expect(button).toHaveAttribute('data-ui', 'test.add');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(button);
    const list = screen.getByRole('menu', { name: 'Add' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', list.id);
    expect(list).toHaveAttribute('data-ui', 'test.add.menu');
    expect(list).toHaveAttribute('data-placement', 'above');
    expect(list).toHaveAttribute('data-align', 'end');
    expect(row('Enter manually')).toHaveFocus();
    expect(within(list).getAllByRole('separator')).toHaveLength(1);
  });

  it('keeps its rows out of the tab order', async () => {
    const { user, button } = renderMenu();
    await user.click(button);
    for (const item of within(menu()).getAllByRole('menuitem')) {
      expect(item).toHaveAttribute('tabindex', '-1');
    }
  });

  it('moves through the rows with the arrow keys, wrapping at both ends', async () => {
    const { user, button } = renderMenu();
    await user.click(button);
    await user.keyboard('{ArrowDown}');
    expect(row('Scan')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(row('Water')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(row('Enter manually')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(row('Fasting')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(row('Enter manually')).toHaveFocus();
    await user.keyboard('{End}');
    expect(row('Fasting')).toHaveFocus();
  });

  it('runs an action once, after closing and giving focus back to the button', async () => {
    let focusedAtSelect: Element | null = null;
    const onSelect = vi.fn(() => {
      focusedAtSelect = document.activeElement;
    });
    const { user, button } = renderMenu(onSelect);
    await user.click(button);
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('manual');
    expect(focusedAtSelect).toBe(button);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a nested page and comes back with the keyboard', async () => {
    const onSelect = vi.fn();
    const { user, button } = renderMenu(onSelect);
    await user.click(button);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(row('Water')).toHaveAttribute('aria-haspopup', 'menu');

    // Enter opens the page on its first row; the page ends with Back.
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: 'Water' })).toBeInTheDocument();
    expect(row('250 ml')).toHaveFocus();
    const names = within(menu())
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(names).toEqual(['250 ml', '500 ml', 'Custom', BACK]);

    // ArrowLeft goes back to the row that opened the page.
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
    expect(row('Water')).toHaveFocus();

    // ArrowRight opens it again; Back, reached with End, returns the same way.
    await user.keyboard('{ArrowRight}');
    expect(row('250 ml')).toHaveFocus();
    await user.keyboard('{End}');
    expect(row(BACK)).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(row('Water')).toHaveFocus();

    // An action on a nested page runs and closes the whole menu.
    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('500');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('opens nested pages and goes back by pointer too', async () => {
    const { user, button } = renderMenu();
    await user.click(button);
    await user.click(row('Fasting'));
    expect(screen.getByRole('menu', { name: 'Fasting' })).toBeInTheDocument();
    await user.click(row(BACK));
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
    expect(row('Fasting')).toHaveFocus();
  });

  it('gives every row a hook under its page', async () => {
    const { user, button } = renderMenu();
    await user.click(button);
    expect(row('Enter manually')).toHaveAttribute('data-ui', 'test.add.manual');
    expect(row('Water')).toHaveAttribute('data-ui', 'test.add.water');
    await user.click(row('Water'));
    expect(row('250 ml')).toHaveAttribute('data-ui', 'test.add.water.250');
    expect(row(BACK)).toHaveAttribute('data-ui', 'test.add.water.back');
  });

  it('closes on Escape, gives focus back to the button and keeps the key to itself', async () => {
    const onOuterKey = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={(event) => onOuterKey(event.key)}>
        <Menu data-ui="test.add" label="Add" entries={entriesWith()} />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Add' });
    await user.click(button);
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
    expect(onOuterKey).not.toHaveBeenCalledWith('Escape');
    expect(onOuterKey).not.toHaveBeenCalledWith('ArrowDown');
  });

  it('closes when Tab moves on, and focus goes to what follows the button', async () => {
    const { user, button } = renderMenu();
    await user.click(button);
    await user.tab();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'After' })).toHaveFocus();
  });

  it('closes on a press outside and leaves focus where the press put it', async () => {
    const { user, button } = renderMenu();
    await user.click(button);
    const after = screen.getByRole('textbox', { name: 'After' });
    await user.click(after);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(after).toHaveFocus();
  });

  it('closes when its button is pressed again', async () => {
    const { user, button } = renderMenu();
    await user.click(button);
    await user.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on the first row with ArrowDown and on the last with ArrowUp', async () => {
    const { user, button } = renderMenu();
    button.focus();
    await user.keyboard('{ArrowUp}');
    expect(row('Fasting')).toHaveFocus();
    await user.keyboard('{Escape}');
    await user.keyboard('{ArrowDown}');
    expect(row('Enter manually')).toHaveFocus();
  });

  it('starts on the first page every time it opens', async () => {
    const { user, button } = renderMenu();
    await user.click(button);
    await user.click(row('Water'));
    await user.keyboard('{Escape}');
    await user.click(button);
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
    expect(row('Enter manually')).toHaveFocus();
  });

  it('reaches a disabled row but does nothing with it', async () => {
    const onSelect = vi.fn();
    const { user, button } = renderMenu(onSelect);
    await user.click(button);
    await user.keyboard('{ArrowDown}');
    const scan = row('Scan');
    expect(scan).toHaveFocus();
    expect(scan).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Enter}');
    await user.click(scan);
    expect(onSelect).not.toHaveBeenCalled();
    expect(menu()).toBeInTheDocument();
  });

  it('marks the chosen mode of a set with a check', async () => {
    const user = userEvent.setup();
    const choose = vi.fn();
    render(
      <Menu
        data-ui="test.sort"
        label="Sort"
        entries={[
          { kind: 'action', id: 'meal', label: 'By meal', checked: true, onSelect: choose },
          { kind: 'action', id: 'newest', label: 'Newest first', checked: false, onSelect: choose },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    expect(screen.getByRole('menuitemradio', { name: 'By meal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const newest = screen.getByRole('menuitemradio', { name: 'Newest first' });
    expect(newest).toHaveAttribute('aria-checked', 'false');
    await user.click(newest);
    expect(choose).toHaveBeenCalledTimes(1);
  });

  it('can be an icon button named by its label', async () => {
    const user = userEvent.setup();
    render(
      <Menu
        data-ui="test.fab"
        label="Add"
        icon={<svg data-testid="glyph" />}
        entries={entriesWith()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toHaveAttribute('data-ui', 'test.fab');
    expect(button).not.toHaveTextContent('Add');
    await user.click(button);
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
  });

  it('falls back to the first page when the open page goes away', async () => {
    const { user, button, view } = renderMenu();
    await user.click(button);
    await user.click(row('Water'));
    const withoutWater = entriesWith().filter((entry) => entry.id !== 'water');
    view.rerender(
      <>
        <Menu data-ui="test.add" label="Add" entries={withoutWater} />
        <input aria-label="After" />
      </>,
    );
    expect(screen.getByRole('menu', { name: 'Add' })).toBeInTheDocument();
    expect(within(menu()).queryByRole('menuitem', { name: BACK })).toBeNull();
  });

  it('closes when focus leaves for something else on the page', async () => {
    const { user, button } = renderMenu();
    await user.click(button);
    fireEvent.focusOut(row('Enter manually'), {
      relatedTarget: screen.getByRole('textbox', { name: 'After' }),
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
