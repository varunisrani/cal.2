import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { SHEET_SWIPE_CLOSE_PX, Sheet } from './Sheet';

afterEach(cleanup);

function Harness({
  dismissable,
  leading,
  trailing,
  children,
}: {
  dismissable?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      <Sheet
        open={open}
        title="Weight unit"
        onClose={() => setOpen(false)}
        dismissable={dismissable}
        leading={leading}
        trailing={trailing}
        data-ui="test.sheet"
      >
        {children ?? (
          <>
            <input aria-label="Note" />
            <button type="button">Middle</button>
          </>
        )}
      </Sheet>
    </>
  );
}

async function openSheet(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Open' }));
  return screen.getByRole('dialog', { name: 'Weight unit' });
}

function pull(handle: Element, distance: number): void {
  fireEvent.pointerDown(handle, { pointerId: 7, clientY: 100 });
  fireEvent.pointerMove(handle, { pointerId: 7, clientY: 100 + distance });
  fireEvent.pointerUp(handle, { pointerId: 7, clientY: 100 + distance });
}

function handleOf(sheet: HTMLElement): Element {
  const handle = sheet.querySelector('[data-ui="test.sheet.handle"]');
  if (!handle) throw new Error('sheet handle missing');
  return handle;
}

function scrim(): Element {
  const element = document.querySelector('[data-ui="test.sheet.scrim"]');
  if (!element) throw new Error('scrim missing');
  return element;
}

describe('Sheet', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a modal dialog named by its title, with a Done that closes it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const sheet = await openSheet(user);
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet).toHaveAttribute('data-ui', 'test.sheet');
    expect(screen.getByRole('heading', { name: 'Weight unit' })).toBeInTheDocument();
    expect(sheet).toHaveFocus();

    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toHaveAttribute('data-ui', 'test.sheet.done');
    await user.click(done);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('keeps Tab inside the sheet, wrapping at both ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openSheet(user);
    const done = screen.getByRole('button', { name: 'Done' });
    const note = screen.getByRole('textbox', { name: 'Note' });
    const middle = screen.getByRole('button', { name: 'Middle' });

    await user.tab();
    expect(done).toHaveFocus();
    await user.tab();
    expect(note).toHaveFocus();
    await user.tab();
    expect(middle).toHaveFocus();
    await user.tab();
    expect(done).toHaveFocus();
    await user.tab({ shift: true });
    expect(middle).toHaveFocus();
  });

  it('wraps Shift+Tab from the sheet itself to its last control', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const sheet = await openSheet(user);
    expect(sheet).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Middle' })).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openSheet(user);
    await user.click(screen.getByRole('textbox', { name: 'Note' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('closes on a tap on the scrim', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openSheet(user);
    await user.click(scrim());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the header is pulled down past the threshold, and springs back from a short pull', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const sheet = await openSheet(user);
    const handle = handleOf(sheet);

    fireEvent.pointerDown(handle, { pointerId: 7, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientY: 130 });
    expect(sheet.style.transform).toBe('translateY(30px)');
    fireEvent.pointerUp(handle, { pointerId: 7, clientY: 130 });
    expect(sheet.style.transform).toBe('');
    expect(screen.getByRole('dialog')).toBe(sheet);

    pull(handle, SHEET_SWIPE_CLOSE_PX);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not take a press on Done in the header for a pull', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openSheet(user);
    const done = screen.getByRole('button', { name: 'Done' });
    fireEvent.pointerDown(done, { pointerId: 3, clientY: 100 });
    fireEvent.pointerMove(done, { pointerId: 3, clientY: 300 });
    expect(screen.getByRole('dialog').style.transform).toBe('');
  });

  it('ignores Escape, the scrim and a pull when not dismissable, but Done still closes it', async () => {
    const user = userEvent.setup();
    render(<Harness dismissable={false} />);
    const sheet = await openSheet(user);

    await user.keyboard('{Escape}');
    await user.click(scrim());
    pull(handleOf(sheet), SHEET_SWIPE_CLOSE_PX * 3);
    expect(screen.getByRole('dialog', { name: 'Weight unit' })).toBe(sheet);

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('puts a leading action in the title row and can replace Done', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        leading={<Button data-ui="test.sheet.cancel">Cancel</Button>}
        trailing={<Button data-ui="test.sheet.save">Save</Button>}
      />,
    );
    await openSheet(user);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('makes the page behind it inert while open, and lets it go after', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await openSheet(user);
    expect(container).toHaveAttribute('inert');
    expect(document.documentElement.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(container).not.toHaveAttribute('inert');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('opens with focus on the element it is given', async () => {
    function Focused() {
      const field = useRef<HTMLInputElement>(null);
      return (
        <Sheet
          open
          title="Name"
          onClose={() => undefined}
          initialFocus={field}
          data-ui="test.sheet"
        >
          <input ref={field} aria-label="Food name" />
        </Sheet>
      );
    }
    render(<Focused />);
    expect(screen.getByRole('textbox', { name: 'Food name' })).toHaveFocus();
  });

  it('lets a dialog opened above it take Escape first, then takes it back', async () => {
    function Stacked() {
      const [sheetOpen, setSheetOpen] = useState(true);
      const [askOpen, setAskOpen] = useState(false);
      return (
        <Sheet
          open={sheetOpen}
          title="Entry"
          onClose={() => setSheetOpen(false)}
          data-ui="test.entry"
        >
          <button type="button" onClick={() => setAskOpen(true)}>
            Remove
          </button>
          <Dialog
            open={askOpen}
            title="Remove this entry?"
            confirmLabel="Remove"
            destructive
            onConfirm={() => setAskOpen(false)}
            onCancel={() => setAskOpen(false)}
            data-ui="test.ask"
          />
        </Sheet>
      );
    }
    const user = userEvent.setup();
    render(<Stacked />);
    const sheet = screen.getByRole('dialog', { name: 'Entry' });
    const remove = screen.getByRole('button', { name: 'Remove' });
    await user.click(remove);
    expect(screen.getByRole('alertdialog', { name: 'Remove this entry?' })).toBeInTheDocument();
    expect(sheet.parentElement).toHaveAttribute('inert');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Entry' })).toBe(sheet);
    expect(sheet.parentElement).not.toHaveAttribute('inert');
    expect(remove).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
