// The Coach's one session for the whole app (P08-09, 04 §3.6; several chats since P16-02,
// D-16.99). It lives as long as the app, so a reply still on its way survives switching tabs and
// switching chats; it holds only which chats have a turn running, and the page reads the chats and
// their messages from the coach repository's live hooks.
//
// A turn belongs to the chat it was asked in, from Send to its end: its question and its answer
// are stored there, and only that chat's messages go with it, whatever the person opens meanwhile.
// Each chat runs at most one turn and several chats may run one at once. A send marks its chat
// waiting before it waits for anything, so two quick taps start one turn (R04.5). A photo gets its
// small stored copy first; a photo without words is stored with a fixed short request to look at
// it. The question is stored before anything is asked, starting its chat when the chat is new;
// then the data is copied into the turn's snapshot (its tools read nothing else, R04.22; the same
// facts and tools for every chat) and the engine runs, loaded on first use so the AI code stays out
// of the start-up download. The answer is stored only while its chat still is, so one that comes
// back after the chat was deleted, in this tab or another, is dropped (R04.6, D-16.34). A failure
// marks the question with its kind and the provider's message, every stored key already cut out,
// for Details; Retry asks again without storing the question twice (R04.4, D-16.31). Nothing is
// logged: provider messages can carry keys and addresses.
//
// With the custom reminders service the Coach may propose reminders (P13, D-16.93): the answer is
// stored with one card per proposal, and Add and Dismiss on a card go through here, one at a time,
// so a card is added at most once (`reminderCards.ts`, loaded on first use like the engine).
//
// In the Android app (P17, D-16.102) the Coach may act by itself (`actions`): a reminder it set is
// stored as a `set` card, whose Undo goes through here too; what it set follows the reply (taken
// back when the reply is not stored); a deleted chat's check-ins go with it; and every stored
// reply is reported (`onReply`), so a reply the person is not looking at can be announced.
//
// A reply streams in as it is written (D-16.106): the state holds each running chat's text so far,
// so whichever chat is open shows its own reply growing, and one started in another chat shows
// live when that chat is opened. The text goes when its turn ends; the stored reply (or the
// failure) takes its place.

import type { AiFailure } from '../../ai/errors';
import type { ImageBackend } from '../../ai/image';
import type { CoachRepo } from '../../data/repos/coachRepo';
import type {
  CoachChat,
  CoachMessage,
  CoachMessageState,
  CoachReminderCard,
} from '../../domain/model';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { browserImageCodec, type ImageCodec } from '../../lib/imageCodec';
import type { StoredAiAccess } from '../aiAccess';
import type { CustomRemindersService } from '../reminders/customReminders';
import type { CoachActions } from './ownTools';
import type { ReminderCardOutcome, ReminderCards } from './reminderCards';
import type { ReminderProposal } from './reminderTool';
import { takeSnapshot, type SnapshotSources } from './snapshot';

/**
 * The stored copy of an attached photo: P03-10's Coach thumbnail size (`COACH_THUMBNAIL` in
 * src/ai/image.ts, kept equal by a test), written here so that file is not part of the start-up
 * download. The model gets its own copy from the engine.
 */
export const COACH_THUMB = { maxEdge: 700, quality: 0.68 } as const;

export interface CoachSessionState {
  /**
   * The chats with a turn running, in the order they started: their Send, chips and Retry wait.
   * The same array until a turn starts or ends.
   */
  readonly waiting: readonly string[];
  /** The reply streaming in, as far as it came, by chat; a chat waiting for its first word has none. */
  readonly live: Readonly<Record<string, string>>;
}

/** How a send or a retry ended. */
export type TurnOutcome =
  /** Nothing to do: its chat was waiting, there was nothing to send, or nothing to retry. */
  | 'ignored'
  /** The photo could not be read: nothing was stored or sent. */
  | 'photoUnreadable'
  /** The answer is stored. */
  | 'answered'
  /** The turn failed: the question, when it was stored, is marked for Details and Retry. */
  | 'failed'
  /** Its chat was deleted first: nothing more was stored. */
  | 'dropped';

export interface CoachSession {
  /** The same object until something changes (for `useSyncExternalStore`). */
  getState(): CoachSessionState;
  /** Calls `listener` after every change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** An id for a chat the screen opens empty; nothing is stored until its first question. */
  newChatId(): string;
  /**
   * Asks a question in a chat, with an optional photo, starting the chat when it is new; resolves
   * once the turn is over. Never rejects.
   */
  send(chatId: string, text: string, image?: Blob): Promise<TurnOutcome>;
  /** Asks a failed question of a chat again, without storing it twice. Never rejects. */
  retry(chatId: string, id: string): Promise<TurnOutcome>;
  /**
   * Stops the chat's running turn at once and deletes the chat with its messages; a reply that
   * still arrives for it is dropped. Rejects only when storage refused the delete.
   */
  deleteChat(chatId: string): Promise<void>;
  /** Gives a chat the person's own title; null when the chat is no longer stored. */
  renameChat(chatId: string, title: string): Promise<CoachChat | null>;
  /**
   * Adds the reminder of a reply's card (`index` in its `reminders`), switched on or off, and
   * marks the card added; a card already added answers its reminder again, never adding twice.
   */
  addReminder(messageId: string, index: number, on: boolean): Promise<ReminderCardOutcome>;
  /** Hides a reply's card for good; nothing is added. */
  dismissReminder(messageId: string, index: number): Promise<void>;
  /** Takes away the reminder the Coach set on a reply's card; the card waits for Add again. */
  undoReminder(messageId: string, index: number): Promise<void>;
}

export interface CoachSessionDeps {
  readonly coachRepo: Pick<CoachRepo, 'append' | 'list' | 'get' | 'patch' | 'rename' | 'remove'>;
  /** Where each turn's snapshot is read from; its clock also stamps the messages. */
  readonly data: SnapshotSources;
  /** Read for every turn, so a key saved a moment ago is used. */
  readonly aiAccess: () => Promise<StoredAiAccess>;
  /** Handed to the AI layer; services never use the global one. */
  readonly fetch: typeof fetch;
  /** The question stored and sent for a photo without words (from the catalogue). */
  readonly photoOnlyText: () => string;
  /** Makes the stored thumbnail; the browser's by default. */
  readonly codec?: ImageCodec;
  /** Prepares the model's copy of a photo; the browser's by default. */
  readonly imageBackend?: ImageBackend;
  /**
   * The reminders the person writes (P13): checks the Coach's proposals and adds a card's
   * reminder. Without it the Coach proposes none.
   */
  readonly reminders?: Pick<
    CustomRemindersService,
    'problemWith' | 'addCustomReminder' | 'removeCustomReminder'
  >;
  /** What the Coach may do by itself: the Android app's (P17, D-16.102). */
  readonly actions?: CoachActions;
  /** A reply was stored (P17: the Android app tells the person when they are not looking). */
  readonly onReply?: (reply: CoachMessage) => void;
  /** Ids for new chats; random UUIDs by default. */
  readonly newId?: IdSource;
}

/** One running send or retry, bound to its chat. */
interface Run {
  readonly chatId: string;
  readonly controller: AbortController;
  /** Its chat was deleted: this run stores nothing more. */
  dropped: boolean;
}

/** The photo of a failed question as it was picked, with the question's chat. */
interface KeptPhoto {
  readonly chatId: string;
  readonly photo: Blob;
}

const IDLE: CoachSessionState = Object.freeze({
  waiting: Object.freeze([]),
  live: Object.freeze({}),
});

/** The stored copy of a photo; null when the browser cannot read or draw it. */
async function thumbnailOf(photo: Blob, codec: ImageCodec): Promise<Blob | null> {
  try {
    const picture = await codec.decode(photo);
    if (picture === null) return null;
    try {
      return await picture.toJpeg(COACH_THUMB.maxEdge, COACH_THUMB.quality);
    } finally {
      picture.close();
    }
  } catch {
    return null;
  }
}

/** The mark of a failed question: one kind (the standby's when both failed) and its detail. */
function failedState(failure: AiFailure): CoachMessageState {
  const shown = failure.kind === 'bothFailed' ? failure.standbyFailure : failure;
  return shown.detail === undefined
    ? { status: 'failed', kind: shown.kind }
    : { status: 'failed', kind: shown.kind, details: shown.detail };
}

function isFailedQuestion(message: CoachMessage, id: string): boolean {
  return message.id === id && message.role === 'user' && message.state?.status === 'failed';
}

/** The cards for a reply's proposals, each waiting for the person, or set by the Coach (P17). */
function cardsOf(proposals: readonly ReminderProposal[]): CoachReminderCard[] {
  return proposals.map(({ text, time, days, date, reminderId }) => {
    const card: CoachReminderCard =
      days === undefined
        ? { text, time, date: date!, status: 'proposed' }
        : { text, time, days: [...days], status: 'proposed' };
    return reminderId === undefined ? card : { ...card, status: 'set', reminderId };
  });
}

export function createCoachSession(deps: CoachSessionDeps): CoachSession {
  const { coachRepo } = deps;
  const { clock } = deps.data;
  const codec = deps.codec ?? browserImageCodec;
  const newId = deps.newId ?? randomId;
  const listeners = new Set<() => void>();
  let state = IDLE;
  /** The running turns, by chat. */
  const runs = new Map<string, Run>();
  /** The replies streaming in, by chat. */
  let live: Readonly<Record<string, string>> = IDLE.live;
  /** Photos of failed questions, by question, for Retry while the app stays open. */
  const photos = new Map<string, KeptPhoto>();
  /** Add and Dismiss on the reminder cards, made on first use. */
  let cards: Promise<ReminderCards> | null = null;

  function reminderCards(): Promise<ReminderCards> {
    cards ??= import('./reminderCards').then(({ createReminderCards }) =>
      createReminderCards({ coachRepo, reminders: deps.reminders }),
    );
    return cards;
  }

  /** Tells the listeners; `turns` when a turn started or ended (a new `waiting` list). */
  function publish(turns: boolean): void {
    const waiting = turns ? Object.freeze([...runs.keys()]) : state.waiting;
    state =
      waiting.length === 0 && Object.keys(live).length === 0
        ? IDLE
        : Object.freeze({ waiting, live });
    for (const listener of [...listeners]) listener();
  }

  /** Sets (or with '', drops) a chat's reply so far. */
  function setLive(chatId: string, text: string): boolean {
    if ((live[chatId] ?? '') === text) return false;
    const { [chatId]: _gone, ...others } = live;
    live = Object.freeze(text === '' ? others : { ...others, [chatId]: text });
    return true;
  }

  function begin(chatId: string): Run {
    const run: Run = { chatId, controller: new AbortController(), dropped: false };
    runs.set(chatId, run);
    publish(true);
    return run;
  }

  function end(run: Run): void {
    if (runs.get(run.chatId) !== run) return;
    runs.delete(run.chatId);
    setLive(run.chatId, '');
    publish(true);
  }

  /** The text so far of a run's reply, while the run is still its chat's. */
  function showLive(run: Run, text: string): void {
    if (run.dropped || runs.get(run.chatId) !== run) return;
    if (setLive(run.chatId, text)) publish(false);
  }

  async function markFailed(
    run: Run,
    question: CoachMessage,
    failure: AiFailure,
    image: Blob | undefined,
  ): Promise<TurnOutcome> {
    if (run.dropped) return 'dropped';
    const marked = await coachRepo.patch(question.id, { state: failedState(failure) });
    // Gone: the chat was deleted in another tab.
    if (marked === null) return 'dropped';
    if (image !== undefined) photos.set(question.id, { chatId: run.chatId, photo: image });
    return 'failed';
  }

  /** After a throw: marks a stored question `generic` when storage still lets us. */
  async function markBroken(
    run: Run,
    question: CoachMessage | null,
    image: Blob | undefined,
  ): Promise<TurnOutcome> {
    if (question === null) return run.dropped ? 'dropped' : 'failed';
    try {
      return await markFailed(run, question, { kind: 'generic' }, image);
    } catch {
      return 'failed';
    }
  }

  /** Runs the turn for a stored question and stores its answer, or its failure, in its chat. */
  async function answer(
    run: Run,
    question: CoachMessage,
    image: Blob | undefined,
  ): Promise<TurnOutcome> {
    const [snapshot, messages, access, engine] = await Promise.all([
      takeSnapshot(deps.data),
      coachRepo.list(run.chatId),
      deps.aiAccess(),
      import('./engine'),
    ]);
    if (snapshot === null) return markFailed(run, question, { kind: 'generic' }, image);
    if (run.dropped) return 'dropped';
    const result = await engine.runTurn(
      {
        messages,
        question: { id: question.id, text: question.text },
        ...(image === undefined ? {} : { image }),
        snapshot,
        ...(deps.reminders === undefined ? {} : { reminders: deps.reminders }),
        ...(deps.actions === undefined ? {} : { actions: deps.actions, chatId: run.chatId }),
        onText: (text) => showLive(run, text),
      },
      {
        settings: access.settings,
        keys: access.keys,
        fetch: deps.fetch,
        cancel: run.controller.signal,
        ...(deps.imageBackend === undefined ? {} : { imageBackend: deps.imageBackend }),
      },
    );
    if (!result.ok) {
      // Only a delete cancels a turn, and it has already let this one go.
      if (run.dropped || result.error.kind === 'cancelled') return 'dropped';
      return markFailed(run, question, result.error, image);
    }
    const { text, reminders, settle } = result.value;
    let reply: CoachMessage | null = null;
    try {
      // Stored only while the chat still is: a chat deleted in another tab drops it.
      if (!run.dropped) {
        reply = await coachRepo.append({
          chatId: run.chatId,
          role: 'assistant',
          text,
          at: clock.now(),
          ...(reminders.length === 0 ? {} : { reminders: cardsOf(reminders) }),
        });
      }
    } finally {
      // What the Coach set goes with its reply, and is taken back without one (P17).
      await settle?.(reply);
    }
    if (reply === null) return 'dropped';
    photos.delete(question.id);
    deps.onReply?.(reply);
    return 'answered';
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    newChatId: () => newId(),

    async send(chatId, text, image) {
      const words = text.trim();
      if (runs.has(chatId) || (words === '' && image === undefined)) return 'ignored';
      const run = begin(chatId);
      let question: CoachMessage | null = null;
      try {
        let thumb: Blob | undefined;
        if (image !== undefined) {
          const made = await thumbnailOf(image, codec);
          if (made === null) return 'photoUnreadable';
          thumb = made;
        }
        if (run.dropped) return 'dropped';
        question = await coachRepo.append(
          {
            chatId,
            role: 'user',
            text: words === '' ? deps.photoOnlyText() : words,
            at: clock.now(),
            ...(thumb === undefined ? {} : { thumb }),
          },
          { start: true },
        );
        // Deleted while the question was on its way to storage: it went with the chat.
        if (run.dropped) return 'dropped';
        return await answer(run, question, image);
      } catch {
        return await markBroken(run, question, image);
      } finally {
        end(run);
      }
    },

    async retry(chatId, id) {
      if (runs.has(chatId)) return 'ignored';
      const run = begin(chatId);
      let question: CoachMessage | null = null;
      try {
        const stored = await coachRepo.list(chatId);
        if (!stored.some((message) => isFailedQuestion(message, id))) return 'ignored';
        if (run.dropped) return 'dropped';
        // The mark goes while the question is asked again, and comes back if it fails again.
        question = await coachRepo.patch(id, { state: null });
        if (question === null || run.dropped) return 'dropped';
        return await answer(run, question, photos.get(id)?.photo ?? question.thumb);
      } catch {
        return await markBroken(run, question, photos.get(id)?.photo);
      } finally {
        end(run);
      }
    },

    async deleteChat(chatId) {
      const run = runs.get(chatId);
      if (run !== undefined) {
        run.dropped = true;
        run.controller.abort();
        end(run);
      }
      for (const [id, kept] of photos) if (kept.chatId === chatId) photos.delete(id);
      await coachRepo.remove(chatId);
      // Its check-ins have no chat to come back to (P17).
      await deps.actions?.checkIns.dropChat(chatId);
    },

    renameChat: (chatId, title) => coachRepo.rename(chatId, title),

    addReminder: async (messageId, index, on) => (await reminderCards()).add(messageId, index, on),

    dismissReminder: async (messageId, index) => (await reminderCards()).dismiss(messageId, index),

    undoReminder: async (messageId, index) => (await reminderCards()).undo(messageId, index),
  };
}
