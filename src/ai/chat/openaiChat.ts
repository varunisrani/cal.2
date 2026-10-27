/**
 * The Coach on the OpenAI-compatible format, `chat/completions` (04 §3.11), for the fourteen
 * providers of that family. A round sends our system text as a `system` message, the conversation
 * so far, the tools as functions with `tool_choice: "auto"`, the answer limit under the name each
 * provider wants (R03.10) and the provider extras. The model asks for tools with `tool_calls`; the
 * assistant message then goes back as it came, followed by one `tool` message per call id
 * (R04.12). A reply cut at the limit, or one that only reasoned, is asked again once; only
 * OpenRouter changes the body for that (R04.18).
 */
import {
  JPEG,
  bareModelId,
  cutOff,
  endpoint,
  hasText,
  isRecord,
  joinTexts,
  openReply,
  postJson,
  tokenCap,
  unusable,
  type JsonRecord,
  type WireRequest,
} from '../adapters/request';
import { carriesError, hasReasoning, headersFor, tokenLimitField } from '../adapters/openaiCompat';
import { fromReply, type ReplyContext, type SingleFailure } from '../errors';
import { err, ok, type Result } from '../../lib/result';
import {
  NAMELESS_CALL_RESULT,
  callId,
  isUser,
  toolName,
  type ChatOpening,
  type ChatSetup,
  type ChatWire,
  type RoundReply,
  type RunTool,
  type ToolCall,
  type ToolsReply,
  type Transcript,
} from './types';

/** OpenAI's GPT-6 models that call tools only in non-reasoning mode. */
const NON_REASONING_TOOL_MODELS: readonly string[] = ['gpt-6-sol', 'gpt-6-luna'];

/**
 * `reasoning_effort: "none"` for GPT-6 Sol and Luna (and their dated `-…` variants), on OpenAI
 * itself or a Custom server: they refuse tool calls while reasoning. Nothing for anyone else.
 */
export function toolReasoningEffort(setup: Pick<ChatSetup, 'provider' | 'model'>): 'none' | null {
  if (setup.provider !== 'openai' && setup.provider !== 'custom') return null;
  const id = bareModelId(setup.model);
  return NON_REASONING_TOOL_MODELS.some((name) => id === name || id.startsWith(`${name}-`))
    ? 'none'
    : null;
}

/**
 * OpenRouter's `reasoning` for a round. A normal round names the person's effort (none for auto)
 * and leaves the reasoning in the reply, so the message we echo keeps it across tool rounds; the
 * re-ask hides it and asks for low effort, so the budget goes to the answer.
 */
export function chatReasoning(setup: ChatSetup, compact: boolean): JsonRecord | undefined {
  if (compact) return { exclude: true, effort: 'low' };
  const effort = setup.openRouterEffort ?? 'auto';
  return effort === 'auto' ? undefined : { effort };
}

/** Body fields one provider needs on top of the shared ones. */
function extras(setup: ChatSetup, compact: boolean): JsonRecord {
  const fields: Record<string, unknown> = {};
  // Qwen's hybrid models think unless told not to, which is slow and refused without streaming.
  if (setup.provider === 'qwen') fields.enable_thinking = false;
  if (setup.provider === 'openrouter') {
    const reasoning = chatReasoning(setup, compact);
    if (reasoning !== undefined) fields.reasoning = reasoning;
  }
  const effort = toolReasoningEffort(setup);
  if (effort !== null) fields.reasoning_effort = effort;
  return fields;
}

function open(opening: ChatOpening): Transcript {
  const content: string | readonly JsonRecord[] =
    opening.image === undefined
      ? opening.text
      : [
          { type: 'image_url', image_url: { url: `data:${JPEG};base64,${opening.image}` } },
          { type: 'text', text: opening.text },
        ];
  return [
    ...opening.history.map((message) => ({
      role: isUser(message) ? 'user' : 'assistant',
      content: message.text,
    })),
    { role: 'user', content },
  ];
}

function build(setup: ChatSetup, transcript: Transcript, compact: boolean): WireRequest {
  const tools = setup.tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
  return postJson(endpoint(setup.baseUrl, '/chat/completions'), headersFor(setup), {
    model: setup.model.trim(),
    messages: [
      ...(hasText(setup.system) ? [{ role: 'system', content: setup.system }] : []),
      ...transcript,
    ],
    ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
    [tokenLimitField(setup.provider, setup.model)]: tokenCap(setup.maxTokens),
    ...extras(setup, compact),
  });
}

/** The arguments of a call: a JSON object, sent as text by most servers; anything else is `{}`. */
function argumentsOf(value: unknown): JsonRecord {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** The calls that can be answered: every one with an id. One without an id cannot be. */
function callsOf(toolCalls: readonly unknown[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const entry of toolCalls) {
    if (!isRecord(entry)) continue;
    const id = callId(entry.id);
    if (id === undefined) continue;
    const fn = isRecord(entry.function) ? entry.function : {};
    calls.push({ id, name: toolName(fn.name), args: argumentsOf(fn.arguments) });
  }
  return calls;
}

/**
 * One reply. A failure reported inside a success reply is classified like an error reply, with
 * status 0. A `length` stop is cut off, tool calls or not (their arguments may be cut). Tool calls
 * then win over text; failing both, a reply that only reasoned is cut off too.
 */
function read(
  status: number,
  bodyText: string,
  context: ReplyContext = {},
): Result<RoundReply, SingleFailure> {
  const opened = openReply(status, bodyText, context);
  if (!opened.ok) return opened;

  const reply = opened.value;
  const choice: unknown = Array.isArray(reply.choices) ? reply.choices[0] : undefined;
  if (choice === undefined && carriesError(reply)) return err(fromReply(0, bodyText, context));
  if (!isRecord(choice)) return unusable();
  if (choice.finish_reason === 'error') return err(fromReply(0, bodyText, context));
  if (choice.finish_reason === 'length') return cutOff();

  const { message } = choice;
  if (!isRecord(message)) return unusable();
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (toolCalls.length > 0) {
    const calls = callsOf(toolCalls);
    // No call can be answered, so the next round could only be refused.
    if (calls.length === 0) return unusable();
    return ok({ kind: 'tools', calls, echo: { role: 'assistant', ...message } });
  }

  const { content } = message;
  const text =
    typeof content === 'string' ? content.trim() : Array.isArray(content) ? joinTexts(content) : '';
  if (text !== '') return ok({ kind: 'answer', text });
  return hasReasoning(message) ? cutOff() : unusable();
}

function continueWith(transcript: Transcript, reply: ToolsReply, run: RunTool): Transcript {
  return [
    ...transcript,
    reply.echo,
    ...reply.calls.map((call) => ({
      role: 'tool',
      tool_call_id: call.id,
      content: call.name === '' ? NAMELESS_CALL_RESULT : run(call),
    })),
  ];
}

export const openAiChat: ChatWire = { open, build, read, continueWith };
