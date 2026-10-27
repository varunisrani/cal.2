/**
 * The Coach on Gemini's `generateContent` format (04 §3.11). A round sends our system text as
 * `systemInstruction`, the conversation so far as `contents`, the tools as `functionDeclarations`
 * and the answer limit with the model's thinking level (R04.15, R03.8). The model asks for tools
 * with `functionCall` parts: its parts go back exactly as they came, so thought signatures survive,
 * then one user turn holds a `functionResponse` per call, echoing the call's id when it had one
 * (R04.13). A reply stopped by the limit is cut off and asked again once with the same body.
 */
import { geminiThinkingLevel } from '../adapters/gemini';
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
import {
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
  return [
    ...opening.history.map((message) => ({
      role: isUser(message) ? 'user' : 'model',
      parts: [{ text: message.text }],
    })),
    {
      role: 'user',
      parts: [
        ...(opening.image === undefined
          ? []
          : [{ inlineData: { mimeType: JPEG, data: opening.image } }]),
        { text: opening.text },
      ],
    },
  ];
}

/** The re-ask is the same request on this format: `compact` changes nothing. */
function build(setup: ChatSetup, transcript: Transcript, _compact: boolean): WireRequest {
  const key = keyOf(setup);
  const declarations = setup.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  const level = geminiThinkingLevel(setup.model);
  return postJson(
    endpoint(setup.baseUrl, `/models/${setup.model.trim()}:generateContent`),
    key === undefined ? {} : { 'x-goog-api-key': key },
    {
      ...(hasText(setup.system) ? { systemInstruction: { parts: [{ text: setup.system }] } } : {}),
      contents: transcript,
      ...(declarations.length > 0 ? { tools: [{ functionDeclarations: declarations }] } : {}),
      generationConfig: {
        maxOutputTokens: tokenCap(setup.maxTokens),
        ...(level === undefined ? {} : { thinkingConfig: { thinkingLevel: level } }),
      },
    },
  );
}

/** The calls that can be answered: every one with a name (a response must name its tool). */
function callsOf(parts: readonly JsonRecord[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const part of parts) {
    const call = part.functionCall;
    if (!isRecord(call)) continue;
    const name = toolName(call.name);
    if (name === '') continue;
    const id = callId(call.id);
    const args = isRecord(call.args) ? call.args : {};
    calls.push(id === undefined ? { name, args } : { id, name, args });
  }
  return calls;
}

/**
 * One reply, from the first candidate. A `MAX_TOKENS` stop is cut off, calls or not. Function
 * calls then win over text; otherwise the text of every part not flagged as a thought, joined as
 * it came and trimmed. No candidate (a blocked prompt), no parts or no text is unusable.
 */
function read(
  status: number,
  bodyText: string,
  context: ReplyContext = {},
): Result<RoundReply, SingleFailure> {
  const opened = openReply(status, bodyText, context);
  if (!opened.ok) return opened;

  const { candidates } = opened.value;
  const first: unknown = Array.isArray(candidates) ? candidates[0] : undefined;
  if (!isRecord(first)) return unusable();
  if (first.finishReason === 'MAX_TOKENS') return cutOff();
  const rawParts = isRecord(first.content) ? first.content.parts : undefined;
  if (!Array.isArray(rawParts)) return unusable();
  const parts = rawParts.filter(isRecord);

  if (parts.some((part) => part.functionCall !== undefined)) {
    const calls = callsOf(parts);
    // No call can be answered, so the next round could only be refused.
    if (calls.length === 0) return unusable();
    return ok({ kind: 'tools', calls, echo: { role: 'model', parts: rawParts } });
  }

  const text = parts
    .filter((part) => part.thought !== true)
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  return text === '' ? unusable() : ok({ kind: 'answer', text });
}

/**
 * A tool result as Gemini's `response` object: the result under `content`, parsed when it is
 * JSON, else kept as text, so the response is always an object and nothing is lost (R04.13).
 */
export function responseOf(result: string): JsonRecord {
  try {
    return { content: JSON.parse(result) as unknown };
  } catch {
    return { content: result };
  }
}

function continueWith(transcript: Transcript, reply: ToolsReply, run: RunTool): Transcript {
  const parts = reply.calls.map((call) => ({
    functionResponse: {
      name: call.name,
      response: responseOf(run(call)),
      ...(call.id === undefined ? {} : { id: call.id }),
    },
  }));
  return [...transcript, reply.echo, { role: 'user', parts }];
}

export const geminiChat: ChatWire = { open, build, read, continueWith };
