/** Small helpers the UI primitives share. */

/** Joins the class names that are set: `cx(styles.a, busy && styles.b)`. */
export function cx(...names: ReadonlyArray<string | false | null | undefined>): string {
  return names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ');
}

/** The `data-ui` hook of a part of a composite control: `partHook('log.manual', 'done')`. */
export function partHook(hook: string, part: string | number): string {
  return `${hook}.${part}`;
}

/** True for a promise or any other thenable a handler may hand back. */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/** Keeps `n` within `low…high`. */
export function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}
