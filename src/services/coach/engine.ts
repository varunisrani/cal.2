// One Coach turn from question to answer (P08-08, 04 §3.11–3.12). The question picks who answers:
// with a photo the primary, without one the text provider when it is on, else the primary. A
// provider that is not set up refuses before anything is sent. The system text is built once from
// the snapshot taken when the person pressed Send, and the tools of the turn read only that
// snapshot, so a meal logged while the reply runs shows up on the next question (R04.22). The
// turn offers the six nutrition tools, `activity_log` with its rules when the snapshot holds
// Health Connect's activity (the Android app, connected: D-16.94), `walk_log` with what the walk
// score means when the snapshot holds the recorded walks (D-16.96), and `propose_reminder` with its
// rules when the turn can take reminder proposals (D-16.93). The answer comes back with the
// proposals of the attempt that gave it, for the cards under the reply. In the Android app (P17,
// D-16.102) the turn may also act: `set_reminder` in place of `propose_reminder` while Let the
// Coach set reminders is on, and `schedule_check_in`; their writes are made before the round's
// results go back, an attempt that fails takes them back, and the answer carries `settle` for what
// follows the stored reply (`ownTools.ts`).
//
// A turn is a short run of rounds on the provider's wire. Each round sends everything so far;
// tool calls are answered locally, every result cut to the 60 000-character limit (D-16.32), and
// the next round carries them. Six rounds at most, the answer's included (R04.19): a sixth reply
// that still asks for tools ends the turn as `roundLimit` (R04.11). The retry ladder and the one
// re-ask after a cut-off reply live inside a round; all of it shares the turn's one deadline
// (D-16.23). When an attempt fails for any reason but Cancel or the deadline, a standby set up for
// this kind of question runs the whole turn again from its first round, in a conversation of its
// own: nothing the failed attempt sent or received goes with it (R04.1). Failures are values.

import { PROVIDERS } from '../../ai/catalog/providers';
import { askRound, chatWireFor } from '../../ai/chat/round';
import type { ChatSetup, RunTool, ToolCall, ToolSchema } from '../../ai/chat/types';
import { withDeadline, type AiDeps } from '../../ai/client';
import type { Deadline } from '../../ai/deadline';
import { bothFailed, type AiFailure, type SingleFailure } from '../../ai/errors';
import { COACH_PHOTO, prepareImage } from '../../ai/image';
import { coachSystemPrompt } from '../../ai/prompts/coach';
import {
  keyFor,
  missingFor,
  roleFor,
  standbyFor,
  type Missing,
  type ProviderKeys,
  type RoleTarget,
} from '../../ai/settings';
import type { CoachMessage } from '../../domain/model';
import { err, ok, type Result } from '../../lib/result';
import { coachContext } from './context';
import { coachHistory, type TurnQuestion } from './history';
import { limitToolResult } from './limiter';
import { createOwnDesk, runOwnCalls, settleOwn, undoOwn, type CoachActions } from './ownTools';
import {
  createReminderDesk,
  type ReminderChecks,
  type ReminderDesk,
  type ReminderProposal,
} from './reminderTool';
import type { CoachSnapshot } from './snapshot';
import { coachTools, type OwnTools } from './toolSchemas';
import { runCoachTool } from './tools';

/** Requests one attempt may send, the one that brings the answer included (R04.19). */
export const MAX_ROUNDS = 6;

export interface TurnInput {
  /** The stored conversation, oldest first, usually with the question as its newest message. */
  readonly messages: readonly CoachMessage[];
  /** The question this turn answers: its stored id and its words. */
  readonly question: TurnQuestion;
  /** The photo sent with the question, as picked (or its stored copy on a retry). */
  readonly image?: Blob;
  /** The data as it stood when the person pressed Send. */
  readonly snapshot: CoachSnapshot;
  /** Checks reminder proposals; without it `propose_reminder` is not offered (D-16.93). */
  readonly reminders?: ReminderChecks;
  /** The chat the turn runs in: a check-in comes back to it (P17). */
  readonly chatId?: string;
  /**
   * What the Coach may do by itself (the Android app, P17): set reminders at once, schedule
   * check-ins. Used only with `reminders` and `chatId`.
   */
  readonly actions?: CoachActions;
}

/**
 * A turn's answer: the trimmed text, and the reminders it proposed or set, in order (none:
 * empty); with what the Coach set itself (P17), what follows the reply: call it with the stored
 * reply, or null when it was not stored.
 */
export interface CoachAnswer {
  readonly text: string;
  readonly reminders: readonly ReminderProposal[];
  readonly settle?: (reply: { readonly id: string } | null) => Promise<void>;
}

/** What a role that is not set up fails with, before any request (as every AI request does). */
const NOT_SET_UP: Readonly<Record<Missing, SingleFailure['kind']>> = {
  key: 'noKey',
  model: 'model',
  server: 'invalidUrl',
};

/** The tools a turn offers, in the shape the chat wires take. */
function chatTools(
  activity: boolean,
  reminders: boolean,
  walks: boolean,
  own: OwnTools,
): readonly ToolSchema[] {
  return coachTools(activity, reminders, walks, own).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: { ...tool.parameters },
  }));
}

/** What both attempts of one turn share. */
interface Turn {
  readonly input: TurnInput;
  readonly deps: AiDeps;
  readonly deadline: Deadline;
  readonly system: string;
  readonly tools: readonly ToolSchema[];
  /** The prepared photo, base64 JPEG. */
  readonly photo?: string;
  readonly secrets: readonly string[];
  /** Runs one call; each attempt hands in its own reminder desk. */
  readonly runTool: (call: ToolCall, desk: ReminderDesk | undefined) => string;
  /** Makes a desk for one attempt; undefined when the turn takes no reminders. */
  readonly desk: () => ReminderDesk | undefined;
}

/**
 * Answers one question: the trimmed answer with its reminder proposals, or one failure whose
 * detail (the provider's own message, every stored key cut out) is for Details. Never rejects.
 */
export async function runTurn(
  input: TurnInput,
  deps: AiDeps,
): Promise<Result<CoachAnswer, AiFailure>> {
  try {
    return await withDeadline(deps, (deadline) => turn(input, deps, deadline));
  } catch {
    return err({ kind: 'generic' });
  }
}

async function turn(
  input: TurnInput,
  deps: AiDeps,
  deadline: Deadline,
): Promise<Result<CoachAnswer, AiFailure>> {
  if (deadline.stoppedBy() !== undefined) return err(stopFailure(deadline));
  const { settings, keys } = deps;
  const role = roleFor({ images: input.image === undefined ? [] : [input.image] }, settings);
  const missing = missingFor(role, keys)[0];
  if (missing !== undefined) return err({ kind: NOT_SET_UP[missing] });

  let photo: string | undefined;
  if (input.image !== undefined) {
    const prepared = await prepareImage(input.image, COACH_PHOTO, deps.imageBackend);
    if (!prepared.ok) return prepared;
    photo = prepared.value.base64;
  }
  const { snapshot, actions, chatId } = input;
  const activity = snapshot.activity !== null;
  const walks = snapshot.walks !== null;
  const reminders = input.reminders !== undefined;
  // The Coach's own tools (P17): only where the app gave it actions, in a chat it can come back to.
  const acting = reminders && actions !== undefined && chatId !== undefined ? actions : null;
  const own: OwnTools = {
    setsReminders: acting !== null && (await acting.setsReminders().catch(() => false)),
    checkIns: acting !== null,
  };
  const plan: Turn = {
    input,
    deps,
    deadline,
    system: coachSystemPrompt({
      context: coachContext(snapshot),
      notes: settings.instructions,
      activity,
      reminders,
      walks,
      ...own,
    }),
    tools: chatTools(activity, reminders, walks, own),
    photo,
    secrets: storedKeys(keys),
    runTool: (call, desk) => limitToolResult(runCoachTool(call.name, call.args, snapshot, desk)),
    desk: () => {
      if (input.reminders === undefined) return undefined;
      const ownDesk =
        acting === null || chatId === undefined
          ? undefined
          : createOwnDesk(acting, chatId, own.setsReminders === true);
      return createReminderDesk(input.reminders, ownDesk);
    },
  };

  const first = await attempt(plan, role);
  if (first.ok || first.error.kind === 'cancelled') return first;
  // Cancel, or no time left: a standby would only be cut off.
  if (deadline.stoppedBy() !== undefined) return err(stopFailure(deadline));
  const standby = standbyFor(role, settings, keys);
  if (standby === null) return first;

  const second = await attempt(plan, standby);
  if (second.ok) return second;
  return err(bothFailed(nameOf(role), nameOf(standby), second.error));
}

/**
 * One provider's go at the turn, from its first round: its own wire, a conversation built from
 * the stored messages in its own format, its own reminder desk, and nothing from any earlier
 * attempt. What it set by itself is taken back when it fails (P17).
 */
async function attempt(
  plan: Turn,
  target: RoleTarget,
): Promise<Result<CoachAnswer, SingleFailure>> {
  const desk = plan.desk();
  const result = await rounds(plan, target, desk);
  if (!result.ok) {
    await undoOwn(desk);
    return result;
  }
  return desk?.own === undefined ? result : ok({ ...result.value, settle: settleOwn(desk) });
}

/** The rounds of one attempt, until the answer or a failure. */
async function rounds(
  plan: Turn,
  target: RoleTarget,
  desk: ReminderDesk | undefined,
): Promise<Result<CoachAnswer, SingleFailure>> {
  const { input, deps, deadline } = plan;
  const runTool: RunTool = (call) => plan.runTool(call, desk);
  try {
    const wire = chatWireFor(target.provider);
    const { turns, text } = coachHistory(
      input.messages,
      input.question,
      PROVIDERS[target.provider].format,
    );
    const setup: ChatSetup = {
      provider: target.provider,
      baseUrl: target.baseUrl,
      model: target.model,
      key: keyFor(target.provider, deps.keys),
      system: plan.system,
      tools: plan.tools,
      maxTokens: deps.settings.maxTokens,
      openRouterEffort: deps.settings.openRouterEffort,
    };
    let transcript = wire.open({
      history: turns,
      text,
      ...(plan.photo === undefined ? {} : { image: plan.photo }),
    });
    for (let round = 1; ; round += 1) {
      const reply = await askRound(wire, setup, transcript, {
        fetch: deps.fetch,
        deadline,
        secrets: plan.secrets,
      });
      if (!reply.ok) return reply;
      if (reply.value.kind === 'answer') {
        const answer = reply.value.text.trim();
        if (answer === '') return err({ kind: 'invalidResponse' });
        return ok({ text: answer, reminders: [...(desk?.proposals ?? [])] });
      }
      // The last round asked for more tools: their results could never be read (R04.11).
      if (round >= MAX_ROUNDS) return err({ kind: 'roundLimit' });
      // The writes the round asks for are made first, in call order (P17).
      const written = await runOwnCalls(reply.value.calls, desk);
      transcript = wire.continueWith(
        transcript,
        reply.value,
        (call) => written.get(call) ?? runTool(call),
      );
    }
  } catch (error) {
    return err(thrownFailure(error, deadline));
  }
}

/** The keys a provider's error text could echo: all of them, not only the one sent. */
function storedKeys(keys: ProviderKeys): string[] {
  return Object.values(keys).filter((key): key is string => typeof key === 'string');
}

function nameOf(target: RoleTarget): string {
  return PROVIDERS[target.provider].name;
}

/** The failure for a turn the deadline stopped: a silent cancel, or the time limit. */
function stopFailure(deadline: Deadline): SingleFailure {
  return { kind: deadline.stoppedBy() === 'cancel' ? 'cancelled' : 'timeout' };
}

/** Something threw in a wire or a tool: generic, unless the deadline stopped the turn. */
function thrownFailure(error: unknown, deadline: Deadline): SingleFailure {
  if (deadline.stoppedBy() !== undefined) return stopFailure(deadline);
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  if (name === 'AbortError') return { kind: 'cancelled' };
  if (name === 'TimeoutError') return { kind: 'timeout' };
  return { kind: 'generic' };
}
