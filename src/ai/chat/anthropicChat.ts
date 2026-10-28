/**
 * The Coach on Anthropic's `messages` format (04 §3.11). A round sends the answer limit, our system
 * text in `system`, the tools with their schemas as `input_schema` and the conversation so far,
 * with the same headers as the landed adapter (the browser-access one included, R03.1). The model
 * asks for tools with `tool_use` blocks: its content goes back as it came, then one user message
 * answers every id with a `tool_result` block (R04.12). A reply stopped by the limit is cut off and
 * asked again once with the same body (R04.15). A streamed round adds `stream: true` (D-16.106,
 * `anthropicStream.ts`).
 */
import { ANTHROPIC_VERSION } from '../adapters/anthropic';
import {
  JPEG,
  cutOff,
  endpoint,
  hasText,
  isRecord,
  keyOf,
  openReply,
  postJson,
  tokenCap,
  unusable,
  type JsonRecord,
  type WireRequest,
} from '../adapters/request';
import type { ReplyContext, SingleFailure } from '../errors';
import { ok, type Result } from '../../lib/result';
import { anthropicStream } from './anthropicStream';
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

function open(opening: ChatOpening): Transcript {
  const content: string | readonly JsonRecord[] =
    opening.image === undefined
      ? opening.text
      : [
          { type: 'image', source: { type: 'base64', media_type: JPEG, data: opening.image } },
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

/** The re-ask is the same request on this format: `compact` changes nothing. */
function build(
  setup: ChatSetup,
  transcript: Transcript,
  _compact: boolean,
  stream = false,
): WireRequest {
  const key = keyOf(setup);
  const tools = setup.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
  return postJson(
    endpoint(setup.baseUrl, '/messages'),
    {
      ...(key === undefined ? {} : { 'x-api-key': key }),
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    {
      model: setup.model.trim(),
      max_tokens: tokenCap(setup.maxTokens),
      ...(hasText(setup.system) ? { system: setup.system } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      messages: transcript,
      ...(stream ? { stream: true } : {}),
    },
  );
}

const isBlock =
  (type: string) =>
  (block: unknown): block is JsonRecord =>
    isRecord(block) && block.type === type;

/** The `tool_use` blocks that can be answered: every one with an id. */
function callsOf(blocks: readonly JsonRecord[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const block of blocks) {
    const id = callId(block.id);
    if (id === undefined) continue;
    calls.push({ id, name: toolName(block.name), args: isRecord(block.input) ? block.input : {} });
  }
  return calls;
}

/**
 * One reply. A `max_tokens` stop is cut off, tool blocks or not (a cut `tool_use` holds partial
 * input). `tool_use` blocks then win over text; otherwise the first text block that is not blank
 * is the answer, trimmed.
 */
function read(
  status: number,
  bodyText: string,
  context: ReplyContext = {},
): Result<RoundReply, SingleFailure> {
  const opened = openReply(status, bodyText, context);
  if (!opened.ok) return opened;

  const { content, stop_reason: stopReason } = opened.value;
  if (stopReason === 'max_tokens') return cutOff();
  if (!Array.isArray(content)) return unusable();

  const uses = content.filter(isBlock('tool_use'));
  if (uses.length > 0) {
    const calls = callsOf(uses);
    // No call can be answered, so the next round could only be refused.
    if (calls.length === 0) return unusable();
    return ok({ kind: 'tools', calls, echo: { role: 'assistant', content } });
  }

  for (const block of content.filter(isBlock('text'))) {
    const text = typeof block.text === 'string' ? block.text.trim() : '';
    if (text !== '') return ok({ kind: 'answer', text });
  }
  return unusable();
}

function continueWith(transcript: Transcript, reply: ToolsReply, run: RunTool): Transcript {
  const results = reply.calls.map((call) =>
    call.name === ''
      ? { type: 'tool_result', tool_use_id: call.id, content: NAMELESS_CALL_RESULT, is_error: true }
      : { type: 'tool_result', tool_use_id: call.id, content: run(call) },
  );
  return [...transcript, reply.echo, { role: 'user', content: results }];
}

export const anthropicChat: ChatWire = {
  open,
  build,
  read,
  stream: anthropicStream,
  continueWith,
};
