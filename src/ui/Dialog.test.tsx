import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/t';
import { Dialog, type DialogProps } from './Dialog';

afterEach(cleanup);

const CANCEL = t('common.cancel');

type HarnessProps = Partial<Pick<DialogProps, 'onConfirm' | 'onCancel' | 'destructive'>> & {
  /** Keep the dialog open after an answer, as a caller with a slow action would. */
  readonly stayOpen?: boolean;
};

function Harness({ onConfirm, onCancel, destructive, stayOpen = false }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Remove</button>
      <Dialog
        open={open}
        title="Remove this row?"
        message="It goes for good."
        confirmLabel="Remove it"
        destructive={destructive}
        data-ui="test.confirm"
        onConfirm={() => {
          const outcome = onConfirm?.();
          if (!stayOpen) setOpen(false);
          return outcome;
        }}
        onCancel={() => {
          onCancel?.();
          setOpen(false);
        }}
      />
    </>
  );
}

async function openDialog(props: HarnessProps = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const opener = screen.getByRole('button', { name: 'Remove' });
  await user.click(opener);
  return { user, opener, dialog: screen.getByRole('alertdialog', { name: 'Remove this row?' }) };
}

describe('Dialog', () => {
  it('shows a named alert dialog with its message and both actions', async () => {
    const { dialog } = await openDialog({ destructive: true });
    expect(dialog).toHaveAccessibleDescription('It goes for good.');
    expect(dialog).toHaveAttribute('data-ui', 'test.confirm');
    const cancel = within(dialog).getByRole('button', { name: CANCEL });
    const confirm = within(dialog).getByRole('button', { name: 'Remove it' });
    expect(cancel).toHaveAttribute('data-ui', 'test.confirm.cancel');
    expect(confirm).toHaveAttribute('data-ui', 'test.confirm.confirm');
    // Focus starts on the safe action.
    expect(cancel).toHaveFocus();
  });

  it('fires its destructive action once on a double click', async () => {
    const onConfirm = vi.fn();
    const { user, dialog } = await openDialog({ destructive: true, onConfirm, stayOpen: true });
    const confirm = within(dialog).getByRole('button', { name: 'Remove it' });
    await user.dblClick(confirm);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape and gives focus back to the opener', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { user, opener } = await openDialog({ onCancel, onConfirm });
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('cancels on Cancel and on a tap on the backdrop', async () => {
    const onCancel = vi.fn();
    const first = await openDialog({ onCancel });
    await first.user.click(within(first.dialog).getByRole('button', { name: CANCEL }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await first.user.click(first.opener);
    await first.user.click(
      document.querySelector<HTMLElement>('[data-ui="test.confirm.backdrop"]')!,
    );
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('answers once: Cancel and Escape do nothing after the action', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { user, dialog } = await openDialog({ onCancel, onConfirm, stayOpen: true });
    await user.click(within(dialog).getByRole('button', { name: 'Remove it' }));
    await user.click(within(dialog).getByRole('button', { name: CANCEL }));
    await user.keyboard('{Escape}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows the action busy while it runs and lets it be retried after a failure', async () => {
    let fail!: (reason: unknown) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const { user, dialog } = await openDialog({ onConfirm, stayOpen: true });
    const confirm = within(dialog).getByRole('button', { name: 'Remove it' });
    await user.click(confirm);
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => fail(new Error('locked')));
    expect(confirm).not.toHaveAttribute('aria-busy');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('can leave the secondary action out; Escape still cancels', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <Dialog
        open
        title="Photo not readable"
        confirmLabel="OK"
        cancelLabel={null}
        data-ui="test.notice"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Photo not readable' });
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'OK' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('holds the primary action back while confirmDisabled is set', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <Dialog
        open
        title="Name this meal"
        confirmLabel="Save"
        confirmDisabled
        data-ui="test.name"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    await user.click(save);
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(
      <Dialog
        open
        title="Name this meal"
        confirmLabel="Save"
        data-ui="test.name"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await user.click(save);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', async () => {
    const { user, dialog } = await openDialog();
    const cancel = within(dialog).getByRole('button', { name: CANCEL });
    const confirm = within(dialog).getByRole('button', { name: 'Remove it' });
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });
});
