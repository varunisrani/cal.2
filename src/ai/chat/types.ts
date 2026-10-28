/**
 * What the three Coach chat wires share (04 §3.11). A Coach turn is a short conversation of
 * rounds: every round sends the whole transcript so far, and the model answers either with text or
 * with tool calls. A wire speaks one vendor format and keeps the transcript in that format; the
 * engine (P08-08) drives the rounds through `askRound` (round.ts), runs the tools, caps their
 * results and stops after six rounds. Nothing here knows the Coach's tools: their names and
 * schemas come in with the setup, and their results come back through `run`. A round's reply comes
 * as a stream when the provider sends one (D-16.106): the wire's `stream` reads it piece by piece
 * into the same reply `read` gives for a whole answer.
 */
import {
  isRecord,
  type JsonRecord,
  type OpenRouterEffort,
  type ProviderId,
  type WireRequest,
} from '../adapters/request';
import type { ReplyContext, SingleFailure } from '../errors';
import type { Result } from '../../lib/result';
import type { SseEvent } from './sse';

/** One read-only tool as the model sees it (names and schemas from the Coach, P08-02). */
export interface ToolSchema {
  readonly name: string;
  /** What the tool returns and when to call it, in our words. */
  readonly description: string;
  /** The arguments as a JSON Schema object. */
  readonly parameters: JsonRecord;
}

/**
 * One earlier message as plain text (photos are never sent again, R04.2). The history arrives
 * normalised (P08-04); `model` is Gemini's name for the assistant and is read as one.
 */
export interface PastMessage {
  readonly role: 'user' | 'assistant' | 'model';
  readonly text: string;
}

/** What opens a turn: the earlier messages and the new one. */
export interface ChatOpening {
  readonly history: readonly PastMessage[];
  /** The person's message. */
  readonly text: string;
  /** One photo as base64 JPEG without a `data:` prefix. */
  readonly image?: string;
}

/** Everything each round of a turn sends besides the conversation. */
export interface ChatSetup {
  readonly provider: ProviderId;
  /** The provider's base address; trailing slashes are ignored. */
  readonly baseUrl: string;
  readonly model: string;
  /** Undefined or blank sends no key (Ollama, a Custom server without one). */
  readonly key?: string;
  /** The Coach system text with the person's notes already in it (D-16.24). */
  readonly system: string;
  readonly tools: readonly ToolSchema[];
  /** The answer token limit from the settings. */
  readonly maxTokens: number;
  /** OpenRouter only; `auto` when left out. */
  readonly openRouterEffort?: OpenRouterEffort;
}

/** The conversation in one wire's own message format, oldest first, without the system text. */
export type Transcript = readonly JsonRecord[];

/** One tool call the model asked for. */
export interface ToolCall {
  /** The provider's id for the call; undefined when it gave none (Gemini before 3). */
  readonly id?: string;
  /** The tool's name; '' when the model left it out (answered with an error, never run). */
  readonly name: string;
  /** The arguments; missing or malformed ones read as `{}`. */
  readonly args: JsonRecord;
}

/** The model answered: the trimmed text. */
export interface AnswerReply {
  readonly kind: 'answer';
  readonly text: string;
}

/** The model asked for tools; tool calls win over any text in the same reply. */
export interface ToolsReply {
  readonly kind: 'tools';
  /** Every call that can be answered, in the model's order. */
  readonly calls: readonly ToolCall[];
  /** The model's message as it came: it goes back into the transcript before the results. */
  readonly echo: JsonRecord;
}

export type RoundReply = AnswerReply | ToolsReply;

/** Runs one named tool call and gives its result: a JSON object as text. */
export type RunTool = (call: ToolCall) => string;

/**
 * One round's streamed reply, read event by event (D-16.106). Thinking is never part of the
 * text; it is kept only where the reply must go back as it came (a tool round's echo).
 */
export interface RoundStream {
  /** Takes the next event; one that cannot be read is skipped. */
  take(event: SseEvent): void;
  /** The answer as far as it came, trimmed: what the chat shows while the reply is written. */
  text(): string;
  /** Nothing more is to come: the reply said it is over, or it reported a failure. */
  done(): boolean;
  /**
   * The round's reply once the events are over: the same answer, tool calls or failure as `read`
   * gives for a whole reply. A stream that stopped before the reply said it was over failed as a
   * broken connection.
   */
  finish(): Result<RoundReply, SingleFailure>;
}

/** One vendor format's half of a Coach turn: four pure functions. */
export interface ChatWire {
  /** The transcript before the first round: the earlier messages, then the new one. */
  open(opening: ChatOpening): Transcript;
  /**
   * The request for one round. `compact` marks the one re-ask after a cut-off reply; only some
   * providers send anything different for it (R04.18). `stream` asks for the reply as a stream.
   */
  build(setup: ChatSetup, transcript: Transcript, compact: boolean, stream?: boolean): WireRequest;
  /**
   * Reads a round's reply: the answer, the tool calls, or one failure. A reply cut at the token
   * limit is `truncated`; `context.secrets` are cut out of a classified failure's detail.
   */
  read(status: number, bodyText: string, context?: ReplyContext): Result<RoundReply, SingleFailure>;
  /** A reader for one streamed reply; `context.secrets` are cut out of a failure's detail. */
  stream(context?: ReplyContext): RoundStream;
  /**
   * The transcript for the next round: the model's message as it came, then exactly one result
   * per call (R04.12). `run` is called once per named call, in the model's order; a call without
   * a name gets an error result instead.
   */
  continueWith(transcript: Transcript, reply: ToolsReply, run: RunTool): Transcript;
}

/** The result for a call that named no tool: an error the model can act on, as a JSON object. */
export const NAMELESS_CALL_RESULT = JSON.stringify({
  error: 'This call named no tool, so nothing ran. Call one of the listed tools by its name.',
});

/** Whether a past message is the person's. */
export function isUser(message: PastMessage): boolean {
  return message.role === 'user';
}

/** A call id as the provider wrote it (ids are echoed exactly, never trimmed); undefined if none. */
export function callId(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** A tool name, trimmed; '' when missing or blank. */
export function toolName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A call's arguments: a JSON object, or its text (most servers send text); anything else `{}`. */
export function argumentsOf(value: unknown): JsonRecord {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** A stream that stopped before the reply said it was over: the connection broke mid-reply. */
export const CUT_STREAM: SingleFailure = { kind: 'connection' };
