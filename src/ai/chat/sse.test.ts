import { describe, expect, it } from 'vitest';
import { anthropicTextStream, openAiTextStream, streamOf } from '../testing/streamWire';
import { createEventParser, looksLikeEvents, parseEvents, readEvents, type SseEvent } from './sse';

/** A body that hands over `pieces` as they are, one read each. */
function bodyOf(pieces: readonly (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) {
        controller.enqueue(typeof piece === 'string' ? encoder.encode(piece) : piece);
      }
      controller.close();
    },
  });
}

async function collect(
  pieces: readonly (string | Uint8Array)[],
  onBytes?: () => void,
): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of readEvents(bodyOf(pieces), onBytes)) events.push(event);
  return events;
}

/** The bytes of `text` cut at every place in turn, into two pieces. */
function everyCut(bytes: Uint8Array): Uint8Array[][] {
  return Array.from({ length: bytes.length + 1 }, (_, at) => [bytes.slice(0, at), bytes.slice(at)]);
}

describe('createEventParser', () => {
  it('reads named events, unnamed ones as message, and data after one optional space', () => {
    const parser = createEventParser();
    expect(
      parser.push('event: ping\ndata: {"type":"ping"}\n\ndata:{"a":1}\n\ndata:  two spaces\n\n'),
    ).toEqual([
      { event: 'ping', data: '{"type":"ping"}' },
      { event: 'message', data: '{"a":1}' },
      { event: 'message', data: ' two spaces' },
    ]);
  });

  it('joins the data lines of one event with newlines', () => {
    expect(parseEvents('data: first\ndata: second\ndata:\ndata: fourth\n\n')).toEqual([
      { event: 'message', data: 'first\nsecond\n\nfourth' },
    ]);
  });

  it('skips comments, id, retry and unknown fields, and blank lines between events', () => {
    expect(
      parseEvents(': keep-alive\n\n:another\nid: 7\nretry: 3000\nfoo: bar\ndata: kept\n\n\n\n'),
    ).toEqual([{ event: 'message', data: 'kept' }]);
  });

  it('gives nothing for an event without data, and forgets its name', () => {
    expect(parseEvents('event: lonely\n\ndata: next\n\n')).toEqual([
      { event: 'message', data: 'next' },
    ]);
  });

  it('reads LF, CR and CRLF line ends alike', () => {
    const expected = [
      { event: 'delta', data: 'one' },
      { event: 'message', data: 'two' },
    ];
    expect(parseEvents('event: delta\ndata: one\n\ndata: two\n\n')).toEqual(expected);
    expect(parseEvents('event: delta\rdata: one\r\rdata: two\r\r')).toEqual(expected);
    expect(parseEvents('event: delta\r\ndata: one\r\n\r\ndata: two\r\n\r\n')).toEqual(expected);
  });

  it('counts a CRLF cut between its two characters once', () => {
    const parser = createEventParser();
    expect(parser.push('data: one\r')).toEqual([]);
    expect(parser.push('\n\r')).toEqual([{ event: 'message', data: 'one' }]);
    expect(parser.push('\ndata: two\r\n\r\n')).toEqual([{ event: 'message', data: 'two' }]);
  });

  it('gives the last event when the stream ends without its blank line', () => {
    const parser = createEventParser();
    expect(parser.push('data: whole\n\ndata: [DONE]')).toEqual([
      { event: 'message', data: 'whole' },
    ]);
    expect(parser.end()).toEqual([{ event: 'message', data: '[DONE]' }]);
    expect(parser.end()).toEqual([]);
  });
});

describe('readEvents', () => {
  const recorded = streamOf([
    ...anthropicTextStream(['Gut', 'en Morgen — 2 080 kcal ', 'gestern 🍲.']),
    ': trailing comment\r\n',
  ]);

  it('gives the same events wherever the bytes are cut, inside lines and characters', async () => {
    const bytes = new TextEncoder().encode(recorded);
    const whole = parseEvents(recorded);
    expect(whole.map((event) => event.event)).toEqual([
      'message_start',
      'ping',
      'content_block_start',
      'content_block_delta',
      'content_block_delta',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ]);
    for (const pieces of everyCut(bytes)) expect(await collect(pieces)).toEqual(whole);
  });

  it('reads a stream that arrives one byte at a time, CRLF ends included', async () => {
    const text = streamOf(openAiTextStream(['Ein ', 'Löffel'])).replaceAll('\n', '\r\n');
    const bytes = new TextEncoder().encode(text);
    const oneByOne = Array.from(bytes, (byte) => Uint8Array.of(byte));
    expect(await collect(oneByOne)).toEqual(parseEvents(text));
  });

  it('calls onBytes once per piece read, before that piece’s events', async () => {
    const seen: string[] = [];
    let reads = 0;
    for await (const event of readEvents(bodyOf(['data: a\n\nda', 'ta: b\n\n', '']), () => {
      reads += 1;
      seen.push(`read ${reads}`);
    })) {
      seen.push(event.data);
    }
    expect(seen).toEqual(['read 1', 'a', 'read 2', 'b', 'read 3']);
  });

  it('cancels the body when the reader stops early', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('data: again\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const event of readEvents(body)) {
      expect(event.data).toBe('again');
      break;
    }
    expect(cancelled).toBe(true);
  });

  it('throws a failed read as it came', async () => {
    const broken = new TypeError('connection reset');
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) controller.enqueue(new TextEncoder().encode('data: first\n\n'));
        else controller.error(broken);
      },
    });
    const events: string[] = [];
    await expect(async () => {
      for await (const event of readEvents(body)) events.push(event.data);
    }).rejects.toBe(broken);
    expect(events).toEqual(['first']);
  });
});

describe('looksLikeEvents', () => {
  it('knows server-sent events from JSON and plain text', () => {
    expect(looksLikeEvents('data: {"a":1}\n\n')).toBe(true);
    expect(looksLikeEvents('\n event: ping\ndata: {}\n\n')).toBe(true);
    expect(looksLikeEvents(': hello\n\n')).toBe(true);
    expect(looksLikeEvents('{"choices":[]}')).toBe(false);
    expect(looksLikeEvents('Internal error')).toBe(false);
    expect(looksLikeEvents('')).toBe(false);
  });
});
