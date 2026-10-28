import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewCoachMessage } from '../../data/repos/coachRepo';
import { coach } from '../../i18n/en/coach';
import { formatDay, formatTime } from '../../i18n/format';
import { FACTORY_NOW } from '../../test/factories';
import { closeHarnesses, openHarness, untilShown } from '../../test/screenHarness';
import { ChatsSheet, type ChatsSheetProps } from './ChatsSheet';

const words = coach.coach;
const DAY = 86_400_000;

afterEach(async () => {
  await closeHarnesses();
});

function message(chatId: string, role: 'user' | 'assistant', text: string, at: number) {
  return { chatId, role, text, at } satisfies NewCoachMessage;
}

/** Three stored chats over the harness (today is Monday 26 October 2026 in New York). */
async function openSheet(props: Partial<ChatsSheetProps> = {}) {
  const h = await openHarness();
  const coachRepo = h.repos.coachRepo;
  // Last used last week, untitled (an upgraded conversation whose questions had no words).
  await coachRepo.append(
    message('chat-old', 'assistant', 'A reply alone.', FACTORY_NOW - 9 * DAY),
    {
      start: true,
    },
  );
  // Last used yesterday.
  await coachRepo.append(
    message('chat-yesterday', 'user', 'Which snack fits?', FACTORY_NOW - DAY),
    { start: true },
  );
  await coachRepo.append(
    message(
      'chat-yesterday',
      'assistant',
      '## Snacks\n- [Greek yoghurt](https://example.org)',
      FACTORY_NOW - DAY + 1,
    ),
  );
  // Last used today.
  await coachRepo.append(message('chat-today', 'user', 'How was my week?', FACTORY_NOW), {
    start: true,
  });
  await h.db.coachChats.update('chat-old', { title: '' });
  const handlers = {
    onClose: vi.fn(),
    onPick: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
  h.mount(<ChatsSheet openChatId="chat-today" waiting={[]} {...handlers} {...props} />);
  await untilShown('[data-ui="coach.chats.item"]');
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-ui="coach.chats.item"]'));
  return { ...h, ...handlers, rows };
}

const part = (row: HTMLElement, name: string) =>
  row.querySelector(`[data-ui="coach.chats.item.${name}"]`)?.textContent ?? null;

describe('ChatsSheet (P16-03, D-16.99)', () => {
  it('lists every chat newest first: its name, when it was last used and its last message', async () => {
    const { rows } = await openSheet();

    expect(screen.getByRole('dialog', { name: words.page.chats })).toBeVisible();
    expect(rows.map((row) => part(row, 'title'))).toEqual([
      'How was my week?',
      'Which snack fits?',
      words.chats.untitled,
    ]);
    expect(rows.map((row) => part(row, 'when'))).toEqual([
      formatTime(FACTORY_NOW),
      words.chats.yesterday,
      formatDay('2026-10-17', 'short'),
    ]);
    expect(rows.map((row) => part(row, 'last'))).toEqual([
      'How was my week?',
      'Snacks Greek yoghurt',
      'A reply alone.',
    ]);
  });

  it('marks the open chat and the chats waiting for a reply', async () => {
    const { rows } = await openSheet({ waiting: ['chat-yesterday'] });

    expect(rows.map((row) => row.hasAttribute('data-current'))).toEqual([true, false, false]);
    const opener = rows[0]!.querySelector('[data-ui="coach.chats.item.open"]');
    expect(opener).toHaveAttribute('aria-current', 'true');
    expect(rows.map((row) => row.hasAttribute('data-waiting'))).toEqual([false, true, false]);
    expect(part(rows[1]!, 'waiting')).toBe(words.chats.waiting);
    expect(rows[0]!.querySelector('[data-ui="coach.chats.item.waiting"]')).toBeNull();
  });

  it('opens a chat on a tap, and has Rename and Delete named after each chat', async () => {
    const user = userEvent.setup();
    const { rows, onPick, onRename, onDelete } = await openSheet();

    await user.click(rows[1]!.querySelector<HTMLElement>('[data-ui="coach.chats.item.open"]')!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-yesterday' }));

    await user.click(within(rows[0]!).getByRole('button', { name: 'Rename How was my week?' }));
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-today' }));
    await user.click(within(rows[2]!).getByRole('button', { name: 'Delete Earlier chat' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-old' }));
  });

  it('says there are no chats yet when none is stored', async () => {
    const h = await openHarness();
    h.mount(
      <ChatsSheet
        openChatId={null}
        waiting={[]}
        onClose={vi.fn()}
        onPick={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await untilShown('[data-ui="coach.chats.empty"]');
    expect(screen.getByText(words.chats.empty)).toBeVisible();
  });
});
