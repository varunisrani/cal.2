import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coach } from '../../i18n/en/coach';
import { common } from '../../i18n/en/common';
import type { CoachSession } from '../../services/coach/session';
import { ServicesProvider } from '../../services/context';
import { CHAT_TITLE_MAX } from '../../domain/coach/chats';
import { makeCoachChat } from '../../test/factories';
import { closeHarnesses, openHarness, untilShown } from '../../test/screenHarness';
import { NAME_MAX, RenameChatSheet } from './RenameChatSheet';

const words = coach.coach;

afterEach(async () => {
  await closeHarnesses();
});

async function openRename(renameChat: CoachSession['renameChat']) {
  const h = await openHarness();
  const onClose = vi.fn();
  const session = { renameChat: vi.fn(renameChat) };
  const chat = makeCoachChat({ id: 'chat-a', title: 'What did I eat yesterday?' });
  h.mount(
    <ServicesProvider services={{ ...h.services, coachSession: session as never }}>
      <RenameChatSheet chat={chat} onClose={onClose} />
    </ServicesProvider>,
  );
  const sheet = screen.getByRole('dialog', { name: words.chats.renameTitle });
  const field = within(sheet).getByRole('textbox', { name: words.chats.name });
  const save = within(sheet).getByRole('button', { name: common.common.save });
  return { session, onClose, sheet, field, save, user: userEvent.setup() };
}

describe('RenameChatSheet (P16-03)', () => {
  it('holds the chat’s name, focused; Save waits for different words', async () => {
    const { field, save, user } = await openRename(async () => null);

    expect(field).toHaveValue('What did I eat yesterday?');
    await waitFor(() => expect(field).toHaveFocus());
    expect(NAME_MAX).toBe(CHAT_TITLE_MAX);
    expect(field).toHaveAttribute('maxlength', String(CHAT_TITLE_MAX));
    expect(save).toBeDisabled();

    await user.clear(field);
    await user.type(field, '   ');
    expect(save).toBeDisabled();
    await user.type(field, 'Yesterday');
    expect(save).toBeEnabled();
  });

  it('stores the words on one line and closes', async () => {
    const { session, onClose, field, save, user } = await openRename(async (id, title) =>
      makeCoachChat({ id, title, titleByPerson: true }),
    );

    await user.clear(field);
    await user.type(field, '  Weekend   plan ');
    await user.click(save);

    expect(session.renameChat).toHaveBeenCalledWith('chat-a', 'Weekend plan');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[data-ui="toast.message"]')).toBeNull();
  });

  it('says so when the name could not be stored, and Cancel stores nothing', async () => {
    const { session, onClose, field, sheet, save, user } = await openRename(async () => {
      throw new Error('storage refused');
    });

    await user.clear(field);
    await user.type(field, 'Breakfasts{Enter}');
    await untilShown('[data-ui="toast.message"]');
    expect(document.querySelector('[data-ui="toast.message"]')).toHaveTextContent(
      words.chats.renameFailed,
    );
    expect(session.renameChat).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(save).toBeDefined();

    await user.click(within(sheet).getByRole('button', { name: common.common.cancel }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(session.renameChat).toHaveBeenCalledTimes(1);
  });
});
