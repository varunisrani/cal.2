/** Joins CSS module class names, skipping the ones that are off: `cx(styles.a, busy && styles.b)`. */
export function cx(...names: ReadonlyArray<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
