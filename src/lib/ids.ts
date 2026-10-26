/** Makes a new record id. Services can take one as a parameter, like a Clock. */
export type IdSource = () => string;

/** A random v4 UUID (needs a secure context in the browser, which the installed app has). */
export const newId: IdSource = () => crypto.randomUUID();

/** For tests: an id source that counts `prefix-1`, `prefix-2`, … on its own. */
export function withIdSequence(prefix: string): IdSource {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
