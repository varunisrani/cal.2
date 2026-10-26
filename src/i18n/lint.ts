import { MessageSyntaxError, parseMessage } from './message';

export interface CatalogueProblem {
  /** The partition the problem was found in. */
  readonly partition: string;
  /** The dotted key ('' for the partition itself). */
  readonly key: string;
  readonly problem: string;
}

// Plain identifiers, so a dotted key always names one path.
const SEGMENT = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * Checks catalogue partitions (name → tree): every message is a non-empty string that parses
 * with well-formed placeholders, key segments are identifiers, groups are not empty, and no key
 * is defined twice, within a partition or across two. Partitions may share a group (two slices
 * of one area); the input is `unknown` so malformed trees are reported, not assumed away.
 */
export function lintCatalogue(partitions: Readonly<Record<string, unknown>>): CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  const messageOwner = new Map<string, string>();
  const groupOwner = new Map<string, string>();

  const walk = (partition: string, group: Readonly<Record<string, unknown>>, prefix: string) => {
    const report = (key: string, problem: string) => problems.push({ partition, key, problem });
    const entries = Object.entries(group);
    if (entries.length === 0) report(prefix, 'empty group');
    for (const [segment, value] of entries) {
      const key = prefix === '' ? segment : `${prefix}.${segment}`;
      if (!SEGMENT.test(segment)) {
        report(key, `key segment "${segment}" must be letters and digits, starting with a letter`);
      }
      if (typeof value === 'string') {
        const earlier = messageOwner.get(key);
        const asGroup = groupOwner.get(key);
        if (earlier !== undefined) report(key, `defined twice (first in partition "${earlier}")`);
        else if (asGroup !== undefined) {
          report(key, `a message here but a group in partition "${asGroup}"`);
        } else messageOwner.set(key, partition);
        const syntax = messageProblem(value);
        if (syntax) report(key, syntax);
      } else if (isGroup(value)) {
        const asMessage = messageOwner.get(key);
        if (asMessage !== undefined) {
          report(key, `a group here but a message in partition "${asMessage}"`);
        } else if (!groupOwner.has(key)) groupOwner.set(key, partition);
        walk(partition, value, key);
      } else {
        report(key, 'a message must be a string');
      }
    }
  };

  for (const [partition, tree] of Object.entries(partitions)) {
    if (isGroup(tree)) walk(partition, tree, '');
    else problems.push({ partition, key: '', problem: 'a partition must be a group of messages' });
  }
  return problems;
}

function messageProblem(message: string): string | undefined {
  if (message.trim() === '') return 'empty message';
  try {
    parseMessage(message);
    return undefined;
  } catch (error) {
    if (error instanceof MessageSyntaxError) return `does not parse: ${error.message}`;
    throw error;
  }
}

function isGroup(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
