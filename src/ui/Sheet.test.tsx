import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/t';
import { Sheet, SHEET_DRAG_CLOSE_PX } from './Sheet';

afterEach(cleanup);

const DONE = t('common.done');

interface HarnessProps {
  readonly dismissable?: boolean;
  readonly hideDone?: boolean;
  readonly onClose?: () => void;
}

/** A page with an opener button and a sheet holding two controls. */
function Harness({ dismissable, hideDone, onClose }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Sheet
        open={open}
        title="Pick a meal"
        data-ui="test.sheet"
        dismissable={dismissable}
        hideDone={hideDone}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <input aria-label="Name" />
        <button>Middle</button>
      </Sheet>
    </>
  );
}

async function openSheet(props: HarnessProps = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const opener = screen.getByRole('button', { name: 'Open' });
  await user.click(opener);
  return { user, opener, sheet: screen.getByRole('dialog', { name: 'Pick a meal' }) };
}

const backdropOf = () => document.querySelector<HTMLElement>('[data-ui="test.sheet.backdrop"]');
const titleRowOf = () => screen.getByRole('heading', { name: 'Pick a meal' }).parentElement!;

function drag(from: number, to: number) {
  const row = titleRowOf();
  fireEvent.pointerDown(row, { pointerId: 1, button: 0, clientY: from });
  fireEvent.pointerMove(row, { pointerId: 1, clientY: (from + to) / 2 });
  fireEvent.pointerMove(row, { pointerId: 1, clientY: to });
  fireEvent.pointerUp(row, { pointerId: 1, clientY: to });
}

describe('Sheet', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a named modal dialog with Done, and takes focus', async () => {
    const { sheet } = await openSheet();
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet).toHaveAttribute('data-ui', 'test.sheet');
    expect(sheet).toHaveFocus();
    const done = within(sheet).getByRole('button', { name: DONE });
    expect(done).toHaveAttribute('data-ui', 'test.sheet.done');
  });

  it('traps Tab and Shift+Tab inside the sheet', async () => {
    const { user, sheet } = await openSheet();
    const done = within(sheet).getByRole('button', { name: DONE });
    const name = within(sheet).getByRole('textbox', { name: 'Name' });
    const middle = within(sheet).getByRole('button', { name: 'Middle' });

    await user.tab();
    expect(done).toHaveFocus();
    await user.tab();
    expect(name).toHaveFocus();
    await user.tab();
    expect(middle).toHaveFocus();
    await user.tab();
    expect(done).toHaveFocus();
    await user.tab({ shift: true });
    expect(middle).toHaveFocus();
  });

  it('closes on Done and gives focus back to the opener', async () => {
    const { user, sheet, opener } = await openSheet();
    await user.click(within(sheet).getByRole('button', { name: DONE }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the opener', async () => {
    const { user, opener } = await openSheet();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes on a tap on the backdrop', async () => {
    const { user } = await openSheet();
    await user.click(backdropOf()!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the title row is dragged down past the threshold', async () => {
    const onClose = vi.fn();
    await openSheet({ onClose });
    drag(100, 100 + SHEET_DRAG_CLOSE_PX + 10);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('springs back after a short drag', async () => {
    const onClose = vi.fn();
    const { sheet } = await openSheet({ onClose });
    const row = titleRowOf();
    fireEvent.pointerDown(row, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(row, { pointerId: 1, clientY: 140 });
    expect(sheet.style.transform).toBe('translateY(40px)');
    fireEvent.pointerUp(row, { pointerId: 1, clientY: 140 });
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
  });

  describe('when not dismissable', () => {
    it('ignores Escape, the backdrop and a drag', async () => {
      const onClose = vi.fn();
      const { user, sheet } = await openSheet({ dismissable: false, onClose });
      await user.keyboard('{Escape}');
      await user.click(backdropOf()!);
      drag(100, 100 + SHEET_DRAG_CLOSE_PX * 2);
      expect(onClose).not.toHaveBeenCalled();
      expect(sheet).toBeInTheDocument();
      expect(sheet.style.transform).toBe('');
    });

    it('still closes through Done, and can leave Done out', async () => {
      const { user, sheet } = await openSheet({ dismissable: false });
      await user.click(within(sheet).getByRole('button', { name: DONE }));
      expect(screen.queryByRole('dialog')).toBeNull();

      cleanup();
      const second = await openSheet({ dismissable: false, hideDone: true });
      expect(within(second.sheet).queryByRole('button', { name: DONE })).toBeNull();
    });
  });

  it('closes only the top sheet on Escape when one is opened from another', async () => {
    const user = userEvent.setup();
    function Nested() {
      const [outer, setOuter] = useState(true);
      const [inner, setInner] = useState(false);
      return (
        <Sheet open={outer} title="Outer" data-ui="test.outer" onClose={() => setOuter(false)}>
          <button onClick={() => setInner(true)}>Choose</button>
          <Sheet open={inner} title="Inner" data-ui="test.inner" onClose={() => setInner(false)}>
            <button>Option</button>
          </Sheet>
        </Sheet>
      );
    }
    render(<Nested />);
    const choose = screen.getByRole('button', { name: 'Choose' });
    await user.click(choose);
    expect(screen.getByRole('dialog', { name: 'Inner' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
    expect(choose).toHaveFocus();
  });

  it('focuses the element the caller names on open', async () => {
    const user = userEvent.setup();
    function WithFocus() {
      const [open, setOpen] = useState(false);
      const field = useRef<HTMLInputElement>(null);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Sheet
            open={open}
            title="Rename"
            data-ui="test.rename"
            initialFocusRef={field}
            onClose={() => setOpen(false)}
          >
            <input aria-label="New name" ref={field} />
          </Sheet>
        </>
      );
    }
    render(<WithFocus />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('textbox', { name: 'New name' })).toHaveFocus();
  });
});
