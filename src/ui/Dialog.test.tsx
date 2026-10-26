import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

afterEach(cleanup);

interface HarnessProps {
  destructive?: boolean;
  confirmDisabled?: boolean;
  cancelLabel?: string | null;
  onConfirm?: () => unknown;
  onCancel?: () => void;
  /** Close the dialog when an action fires (true by default). */
  closes?: boolean;
}

function Harness({
  destructive,
  confirmDisabled,
  cancelLabel,
  onConfirm = () => undefined,
  onCancel = () => undefined,
  closes = true,
}: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ask
      </button>
      <Dialog
        open={open}
        title="Delete this entry?"
        message={<p>It leaves today&apos;s totals.</p>}
        confirmLabel="Delete"
        destructive={destructive}
        confirmDisabled={confirmDisabled}
        cancelLabel={cancelLabel}
        onConfirm={() => {
          const result = onConfirm();
          if (closes) setOpen(false);
          return result;
        }}
        onCancel={() => {
          onCancel();
          if (closes) setOpen(false);
        }}
        data-ui="test.ask"
      />
    </>
  );
}

async function ask(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  return screen.getByRole('alertdialog', { name: 'Delete this entry?' });
}

describe('Dialog', () => {
  it('is a modal alertdialog named by its title and described by its message', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const dialog = await ask(user);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription("It leaves today's totals.");
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'data-ui',
      'test.ask.cancel',
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-ui',
      'test.ask.confirm',
    );
  });

  it('cancels on Escape and gives focus back to the opener', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />);
    await ask(user);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask' })).toHaveFocus();
  });

  it('cancels on a tap on the scrim', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    await ask(user);
    const scrim = document.querySelector('[data-ui="test.ask.scrim"]');
    if (!scrim) throw new Error('scrim missing');
    await user.click(scrim);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires the destructive action once on a double click', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness destructive onConfirm={onConfirm} closes={false} />);
    await ask(user);
    const action = screen.getByRole('button', { name: 'Delete' });
    expect(action.className).toMatch(/danger/);
    await user.dblClick(action);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('can show its action alone, still dismissed by Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness cancelLabel={null} onCancel={onCancel} />);
    const dialog = await ask(user);
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Delete']);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('answers once: Escape after the action does not also cancel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} closes={false} />);
    await ask(user);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.keyboard('{Escape}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('answers again after being opened anew', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await ask(user);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await ask(user);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('shows the action busy while its promise runs, and fires it once', async () => {
    const user = userEvent.setup();
    let finish = (): void => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Harness onConfirm={onConfirm} closes={false} />);
    await ask(user);
    const action = screen.getByRole('button', { name: 'Delete' });
    await user.click(action);
    expect(action).toHaveAttribute('aria-busy', 'true');
    await user.click(action);
    await act(async () => finish());
    expect(action).not.toHaveAttribute('aria-busy');
    await user.click(action);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('puts first focus on Cancel when destructive, on the action otherwise', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness destructive />);
    await ask(user);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    unmount();

    render(<Harness />);
    await ask(user);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  });

  it('keeps the action off while confirmDisabled', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness confirmDisabled onConfirm={onConfirm} />);
    await ask(user);
    const action = screen.getByRole('button', { name: 'Delete' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(action).toBeDisabled();
    await user.click(action);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps Tab between its two actions', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await ask(user);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const action = screen.getByRole('button', { name: 'Delete' });
    expect(action).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(action).toHaveFocus();
  });
});
