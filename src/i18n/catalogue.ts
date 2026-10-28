/**
 * The shape of the message catalogue and the helpers that compose and walk it.
 *
 * A catalogue is a tree: inner nodes group messages, leaves are message texts. A key is the
 * dotted path to a leaf (`common.tabs.home`). A partition is a tree rooted at its area namespace
 * (`{ common: { … } }`), so one area can be spread over several partition files; `en.ts`
 * merges them all for the tools, and the app's `t()` reads a live catalogue of the partitions
 * registered so far (onDemand.ts).
 */

export interface MessageTree {
  readonly [segment: string]: string | MessageTree;
}

/** Every dotted path from the root of `T` to a message. */
export type MessageKey<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${MessageKey<T[K]>}`;
}[keyof T & string];

/** The message text type at key `K` of `T` (a string literal for an `as const` catalogue). */
export type MessageAt<T, K extends string> = K extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? MessageAt<T[Head], Rest>
    : never
  : K extends keyof T
    ? T[K]
    : never;

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;

/** The type of the catalogue made from a record of partitions. */
export type MergedPartitions<P extends Readonly<Record<string, MessageTree>>> = UnionToIntersection<
  P[keyof P]
>;

/**
 * Deep-merges partitions into one catalogue. When two partitions define the same key, the first
 * one wins and nothing throws (a production page must not fail on it); the catalogue lint reports
 * the clash.
 */
export function mergePartitions<P extends Readonly<Record<string, MessageTree>>>(
  partitions: P,
): MergedPartitions<P> {
  const merged: Group = {};
  for (const tree of Object.values(partitions)) mergeInto(merged, tree);
  return merged as MergedPartitions<P>;
}

/**
 * A catalogue that grows while the app runs (P18-00): it starts from the partitions of the
 * start-up download and takes in each partition fetched on demand as it arrives. `tree` is one
 * object for the catalogue's whole life, so a translator made over it sees every later partition.
 */
export interface LiveCatalogue {
  readonly tree: MessageTree;
  /** Merges a partition in, once: a name already registered is left as it is. */
  register(name: string, partition: MessageTree): void;
  has(name: string): boolean;
}

export function createLiveCatalogue(
  partitions: Readonly<Record<string, MessageTree>>,
): LiveCatalogue {
  const tree: Group = {};
  const names = new Set<string>();
  const register = (name: string, partition: MessageTree): void => {
    if (names.has(name)) return;
    names.add(name);
    mergeInto(tree, partition);
  };
  for (const [name, partition] of Object.entries(partitions)) register(name, partition);
  return { tree, register, has: (name) => names.has(name) };
}

/** The message text at a dotted key, or `undefined` when the key does not name a message. */
export function lookupMessage(catalogue: MessageTree, key: string): string | undefined {
  let node: string | MessageTree = catalogue;
  for (const segment of key.split('.')) {
    if (typeof node === 'string' || !Object.hasOwn(node, segment)) return undefined;
    const next: string | MessageTree | undefined = node[segment];
    if (next === undefined) return undefined;
    node = next;
  }
  return typeof node === 'string' ? node : undefined;
}

interface Group {
  [segment: string]: string | Group;
}

function mergeInto(target: Group, source: MessageTree): void {
  for (const [segment, value] of Object.entries(source)) {
    const existing = target[segment];
    if (typeof value === 'string') {
      if (existing === undefined) target[segment] = value;
    } else if (existing === undefined) {
      const group: Group = {};
      target[segment] = group;
      mergeInto(group, value);
    } else if (typeof existing !== 'string') {
      mergeInto(existing, value);
    }
    // Any other combination is a clash; the first definition stays.
  }
}
