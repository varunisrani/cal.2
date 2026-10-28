/**
 * Server-sent events as the Coach's streamed replies use them (D-16.106): the three vendors send a
 * reply as `text/event-stream`, one event per piece. This reader is pure: it turns bytes into
 * events and knows nothing of any vendor. The network may cut the bytes anywhere, inside a line,
 * between the two characters of a CRLF or inside one UTF-8 character, and the events come out the
 * same. Lines end in LF, CR or CRLF; a line starting with a colon is a comment and is skipped;
 * `data:` lines of one event are joined with newlines; `id:`, `retry:` and unknown fields are
 * ignored. A blank line ends an event. The last event of a stream that ends without its blank
 * line is still given: some servers close straight after it, and a vendor reader decides whether
 * the reply was complete.
 */

/** One event: its name (`message` when the server gave none) and its data. */
export interface SseEvent {
  readonly event: string;
  readonly data: string;
}

/** The name an event has when the server names none. */
const UNNAMED = 'message';

const LF = 10;
const CR = 13;

/** Text in, events out, across any cut of the text. */
export interface EventParser {
  /** Takes the next piece of text; gives the events it completed. */
  push(text: string): SseEvent[];
  /** The text is over: gives the last event when it lacked its blank line. */
  end(): SseEvent[];
}

export function createEventParser(): EventParser {
  /** The start of a line whose end has not arrived yet. */
  let partial = '';
  /** The last piece ended on CR: an LF opening the next piece belongs to it. */
  let afterCr = false;
  let name = '';
  let data: string[] = [];

  function dispatch(out: SseEvent[]): void {
    if (data.length > 0) out.push({ event: name === '' ? UNNAMED : name, data: data.join('\n') });
    name = '';
    data = [];
  }

  function line(text: string, out: SseEvent[]): void {
    if (text === '') {
      dispatch(out);
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') name = value;
    else if (field === 'data') data.push(value);
  }

  return {
    push(text) {
      const out: SseEvent[] = [];
      let from = 0;
      if (afterCr && text.charCodeAt(0) === LF) from = 1;
      afterCr = false;
      for (let at = from; at < text.length; at += 1) {
        const code = text.charCodeAt(at);
        if (code !== LF && code !== CR) continue;
        line(partial + text.slice(from, at), out);
        partial = '';
        if (code === CR) {
          if (at + 1 === text.length) afterCr = true;
          else if (text.charCodeAt(at + 1) === LF) at += 1;
        }
        from = at + 1;
      }
      partial += text.slice(from);
      return out;
    },
    end() {
      const out: SseEvent[] = [];
      if (partial !== '') line(partial, out);
      partial = '';
      dispatch(out);
      return out;
    },
  };
}

/** The events of a whole text at once (a stream that was read to its end). */
export function parseEvents(text: string): SseEvent[] {
  const parser = createEventParser();
  return [...parser.push(text), ...parser.end()];
}

/** Whether a whole body reads as server-sent events: its first line is a field or a comment. */
export function looksLikeEvents(text: string): boolean {
  return /^\s*(?:data:|event:|:)/.test(text);
}

/**
 * The events of `body` as they arrive. `onBytes` is called for every piece read, before its
 * events, so a caller can tell a quiet stream from a stalled one. Stopping early (a `break` in
 * `for await`) cancels the body; a failed read throws as it came.
 */
export async function* readEvents(
  body: ReadableStream<Uint8Array>,
  onBytes?: () => void,
): AsyncGenerator<SseEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createEventParser();
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onBytes?.();
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
    finished = true;
    yield* parser.push(decoder.decode());
    yield* parser.end();
  } finally {
    if (finished) reader.releaseLock();
    else await reader.cancel().catch(() => undefined);
  }
}
