// The cap on a Coach tool result (04 §3.10, D-16.32, R04.9). Every result goes through it before
// it is sent back to the model, on every provider: a long food log with its nutrients can run to
// hundreds of kilobytes, which would crowd out the context window and cost the person money.
//
// A result within the cap is returned as it is. A longer one must be a JSON object with at least
// one array: the array whose JSON text is longest is cut to its newest rows (its tail, since tool
// lists run oldest first), as many as still fit once the markers are added. A binary search
// finds that number; nothing else in the object changes, so a `count` the tool wrote still says
// how many rows it found. Anything that cannot be cut to fit becomes a short error object.

/** The most characters a tool result may have (JavaScript string length). */
export const TOOL_RESULT_MAX_CHARS = 60_000;

const CUT_NOTE =
  'This result was too long, so its oldest rows were left out. Ask again with a narrower ' +
  'date range to see them.';

const TOO_LARGE = JSON.stringify({
  error: 'result too large',
  note: 'This result was too long to send. Ask again with a narrower date range.',
});

type JsonObject = Record<string, unknown>;

function readObject(text: string): JsonObject | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

/** The key of the array field with the longest JSON text (the first one on a tie), or null. */
function longestArrayKey(result: JsonObject): string | null {
  let found: string | null = null;
  let longest = -1;
  for (const [key, value] of Object.entries(result)) {
    if (!Array.isArray(value)) continue;
    const size = JSON.stringify(value).length;
    if (size > longest) {
      found = key;
      longest = size;
    }
  }
  return found;
}

/**
 * `text` when it has at most `maxChars` characters; otherwise the result with its biggest list
 * cut to the newest rows that fit, marked `truncated` with the number of `omittedItems` and a
 * note, or an error object when no cut fits.
 */
export function limitToolResult(text: string, maxChars: number = TOOL_RESULT_MAX_CHARS): string {
  if (text.length <= maxChars) return text;
  const result = readObject(text);
  if (result === null) return TOO_LARGE;
  const key = longestArrayKey(result);
  if (key === null) return TOO_LARGE;
  const rows = result[key] as unknown[];

  const keepingNewest = (kept: number): string =>
    JSON.stringify({
      ...result,
      [key]: rows.slice(rows.length - kept),
      truncated: true,
      omittedItems: rows.length - kept,
      note: CUT_NOTE,
    });

  // The longest text that fits keeps between 0 and n − 1 rows; more rows never make it shorter.
  let fits: string | null = null;
  let low = 0;
  let high = rows.length - 1;
  while (low <= high) {
    const kept = Math.floor((low + high) / 2);
    const candidate = keepingNewest(kept);
    if (candidate.length <= maxChars) {
      fits = candidate;
      low = kept + 1;
    } else {
      high = kept - 1;
    }
  }
  return fits ?? TOO_LARGE;
}
