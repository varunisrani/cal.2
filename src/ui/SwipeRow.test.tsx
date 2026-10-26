import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SWIPE_DELETE_PX, SWIPE_MAX_SHARE, SwipeRow } from './SwipeRow';

afterEach(cleanup);

/** jsdom lays nothing out: give every element the row's width. */
function rowWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 64,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 64,
    toJSON: () => ({}),
  } as DOMRect);
}

interface Options {
  readonly onRequestDelete?: () => void;
  readonly onTap?: () => void;
  readonly deleteButton?: 'always' | 'focus';
  readonly disabled?: boolean;
}

function renderRow({ onRequestDelete = vi.fn(), onTap, deleteButton, disabled }: Options = {}) {
  render(
    <SwipeRow
      data-ui="test.row"
      deleteLabel="Delete Oatmeal"
      onRequestDelete={onRequestDelete}
      deleteButton={deleteButton}
      disabled={disabled}
    >
      <button onClick={onTap}>Oatmeal</button>
    </SwipeRow>,
  );
  const root = document.querySelector<HTMLElement>('[data-ui="test.row"]');
  const content = screen.getByRole('button', { name: 'Oatmeal' }).parentElement?.parentElement;
  if (!root || !content) throw new Error('row not drawn');
  return { root, content, onRequestDelete };
}

const START_X = 380;

/** Presses at START_X, moves through `path` (x positions) and lets go at the last one. */
function swipe(target: HTMLElement, path: readonly number[], { release = true, y = 20 } = {}) {
  fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: START_X, clientY: y });
  for (const x of path) fireEvent.pointerMove(target, { pointerId: 1, clientX: x, clientY: y });
  if (release) {
    const last = path[path.length - 1] ?? START_X;
    fireEvent.pointerUp(target, { pointerId: 1, clientX: last, clientY: y });
  }
}

const strip = () => document.querySelector<HTMLElement>('[data-ui="test.row.strip"]');

describe('SwipeRow', () => {
  it('asks once when released past the threshold, then springs back', () => {
    rowWidth(400);
    const { content, onRequestDelete } = renderRow();
    swipe(content, [START_X - 60, START_X - 160, START_X - 230]);
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(content.style.transform).toBe('');
    expect(strip()).toBeNull();
  });

  it('springs back without asking after a short release', () => {
    rowWidth(400);
    const { content, onRequestDelete } = renderRow();
    swipe(content, [START_X - 100, START_X - (SWIPE_DELETE_PX - 1)], { release: false });
    expect(content.style.transform).toBe(`translateX(-${SWIPE_DELETE_PX - 1}px)`);
    fireEvent.pointerUp(content, { pointerId: 1, clientX: START_X - (SWIPE_DELETE_PX - 1) });
    expect(onRequestDelete).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
  });

  it('stops at 72 % of the row width', () => {
    rowWidth(400);
    const { content, onRequestDelete } = renderRow();
    expect(SWIPE_MAX_SHARE).toBe(0.72);
    swipe(content, [START_X - 200, START_X - 360], { release: false });
    expect(content.style.transform).toBe('translateX(-288px)');
    expect(strip()?.style.inlineSize).toBe('288px');
    fireEvent.pointerUp(content, { pointerId: 1, clientX: START_X - 360 });
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('asks at the cap on a row too narrow to reach the usual threshold', () => {
    rowWidth(250);
    const { content, onRequestDelete } = renderRow();
    swipe(content, [START_X - 100, START_X - 179]);
    expect(onRequestDelete).not.toHaveBeenCalled();
    swipe(content, [START_X - 100, START_X - 240]);
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('uncovers the delete strip as it moves, with its icon once there is room', () => {
    rowWidth(400);
    const { content } = renderRow();
    expect(strip()).toBeNull();
    swipe(content, [START_X - 20], { release: false });
    expect(strip()?.style.inlineSize).toBe('20px');
    expect(strip()?.querySelector('svg')).toBeNull();
    fireEvent.pointerMove(content, { pointerId: 1, clientX: START_X - 90, clientY: 20 });
    expect(strip()?.style.inlineSize).toBe('90px');
    expect(strip()?.querySelector('svg')).not.toBeNull();
    expect(strip()).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not move toward the trailing edge', () => {
    rowWidth(400);
    const { content, onRequestDelete } = renderRow();
    swipe(content, [START_X + 40, START_X + 300]);
    expect(content.style.transform).toBe('');
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it('leaves a mostly vertical move to the page', () => {
    rowWidth(400);
    const { content, onRequestDelete } = renderRow();
    fireEvent.pointerDown(content, { pointerId: 1, button: 0, clientX: START_X, clientY: 20 });
    fireEvent.pointerMove(content, { pointerId: 1, clientX: START_X - 6, clientY: 60 });
    fireEvent.pointerMove(content, { pointerId: 1, clientX: START_X - 260, clientY: 70 });
    fireEvent.pointerUp(content, { pointerId: 1, clientX: START_X - 260, clientY: 70 });
    expect(content.style.transform).toBe('');
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it('springs back without asking when the pointer is cancelled', () => {
    rowWidth(400);
    const { content, onRequestDelete } = renderRow();
    swipe(content, [START_X - 260], { release: false });
    fireEvent.pointerCancel(content, { pointerId: 1 });
    expect(content.style.transform).toBe('');
    fireEvent.pointerUp(content, { pointerId: 1, clientX: START_X - 260 });
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it('swallows the click that ends a drag, but not a plain tap', () => {
    rowWidth(400);
    const onTap = vi.fn();
    const { content } = renderRow({ onTap });
    const row = screen.getByRole('button', { name: 'Oatmeal' });
    swipe(row, [START_X - 50]);
    fireEvent.click(row, { detail: 1 });
    expect(onTap).not.toHaveBeenCalled();
    fireEvent.pointerDown(row, { pointerId: 2, button: 0, clientX: 100, clientY: 20 });
    fireEvent.pointerUp(row, { pointerId: 2, clientX: 102, clientY: 21 });
    fireEvent.click(row, { detail: 1 });
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(content.style.transform).toBe('');
  });

  it('never swallows a click from the keyboard', () => {
    rowWidth(400);
    const onTap = vi.fn();
    renderRow({ onTap });
    const row = screen.getByRole('button', { name: 'Oatmeal' });
    swipe(row, [START_X - 50]);
    fireEvent.click(row, { detail: 0 });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('drags toward the left edge on right-to-left pages too, mirrored', () => {
    rowWidth(400);
    const real = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = real(element);
      return element instanceof HTMLElement && element.dataset.ui === 'test.row'
        ? ({ ...style, direction: 'rtl' } as CSSStyleDeclaration)
        : style;
    });
    const { content, onRequestDelete } = renderRow();
    swipe(content, [START_X - 100], { release: false });
    expect(content.style.transform).toBe('');
    fireEvent.pointerUp(content, { pointerId: 1, clientX: START_X - 100 });
    fireEvent.pointerDown(content, { pointerId: 1, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(content, { pointerId: 1, clientX: 120, clientY: 20 });
    expect(content.style.transform).toBe('translateX(100px)');
    fireEvent.pointerMove(content, { pointerId: 1, clientX: 260, clientY: 20 });
    fireEvent.pointerUp(content, { pointerId: 1, clientX: 260, clientY: 20 });
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('asks from its visible delete button, with the keyboard', async () => {
    const user = userEvent.setup();
    const { root, onRequestDelete } = renderRow();
    expect(root).toHaveAttribute('data-delete', 'always');
    const button = screen.getByRole('button', { name: 'Delete Oatmeal' });
    expect(button).toHaveAttribute('data-ui', 'test.row.delete');
    await user.tab();
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps the delete button reachable in focus mode', async () => {
    const user = userEvent.setup();
    const { root, onRequestDelete } = renderRow({ deleteButton: 'focus' });
    expect(root).toHaveAttribute('data-delete', 'focus');
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete Oatmeal' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('neither swipes nor offers delete while disabled', () => {
    rowWidth(400);
    const { root, content, onRequestDelete } = renderRow({ disabled: true });
    swipe(content, [START_X - 100, START_X - 300]);
    expect(content.style.transform).toBe('');
    expect(onRequestDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Delete Oatmeal' })).toBeNull();
    expect(root).not.toHaveAttribute('data-delete');
  });
});
