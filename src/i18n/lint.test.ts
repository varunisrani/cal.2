import { describe, expect, it } from 'vitest';
import { lookupMessage, mergePartitions } from './catalogue';
import { enPartitions } from './en';
import { lintCatalogue } from './lint';

/** Lints one message in a one-partition catalogue and returns the problem texts. */
const problemsOf = (message: unknown): string[] =>
  lintCatalogue({ sample: { area: { message } } }).map((p) => p.problem);

describe('lintCatalogue', () => {
  it('passes the real catalogue', () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
  });

  it('fails an unclosed plural', () => {
    expect(lintCatalogue({ sample: { area: { count: '{count, plural, one {x}' } } })).toEqual([
      {
        partition: 'sample',
        key: 'area.count',
        problem: expect.stringMatching(/^does not parse: unclosed "\{"/),
      },
    ]);
  });

  it('fails a key defined in two partitions', () => {
    const problems = lintCatalogue({
      first: { home: { title: 'Today' } },
      second: { home: { title: 'This day' } },
    });
    expect(problems).toEqual([
      {
        partition: 'second',
        key: 'home.title',
        problem: 'defined twice (first in partition "first")',
      },
    ]);
  });

  it('lets two partitions share an area group', () => {
    const problems = lintCatalogue({
      settingsData: { settings: { data: { title: 'Your data' } } },
      settingsAi: { settings: { ai: { title: 'AI access' } } },
    });
    expect(problems).toEqual([]);
  });

  it('fails a message in one partition that is a group in another', () => {
    const problems = lintCatalogue({
      first: { home: { title: 'Today' } },
      second: { home: { title: { short: 'Day' } } },
      third: { home: 'Home' },
    });
    expect(problems.map((p) => `${p.partition} ${p.key}: ${p.problem}`)).toEqual([
      'second home.title: a group here but a message in partition "first"',
      'third home: a message here but a group in partition "first"',
    ]);
  });

  it('fails a key that two paths of one partition both spell', () => {
    const problems = lintCatalogue({
      sample: { tabs: { home: 'Home' }, 'tabs.home': 'Start' },
    });
    expect(problems.map((p) => p.problem)).toEqual([
      'key segment "tabs.home" must be letters and digits, starting with a letter',
      'defined twice (first in partition "sample")',
    ]);
  });

  it.each([
    ['empty placeholder', '{}'],
    ['bad name', 'Hi {1st}'],
    ['bad character in a name', 'Hi {first-name}'],
    ['unclosed argument', 'Hi {name'],
    ['stray closing brace', 'Hi name}'],
    ['unsupported type', '{kind, select, a {x} other {y}}'],
    ['plural without branches', '{count, plural}'],
    ['plural without other', '{count, plural, one {x}}'],
    ['repeated category', '{count, plural, one {x} one {y} other {z}}'],
    ['unknown category', '{count, plural, lots {x} other {y}}'],
    ['exact-value selector', '{count, plural, =0 {none} other {some}}'],
    ['branch without braces', '{count, plural, one x other {y}}'],
    ['unclosed branch', '{count, plural, one {x} other {y}'],
    ['junk between branches', '{count, plural, one {x}, other {y}}'],
    ['unclosed nested placeholder', '{count, plural, one {# on {day} other {y}}'],
  ])('fails a malformed placeholder: %s', (_name, message) => {
    expect(problemsOf(message)).toEqual([expect.stringMatching(/^does not parse: /)]);
  });

  it.each([
    ['plain text', 'Today’s total'],
    ['an apostrophe', "Today's total"],
    ['# outside a plural', 'Rank #1'],
    ['an argument', 'Hello, {name}!'],
    ['an argument with spaces', 'Hello, { name }!'],
    ['a plural', '{count, plural, one {# day} other {# days}}'],
    ['a plural over lines', '{count, plural,\n  one {# day}\n  other {# days}\n}'],
    ['every category', '{n, plural, zero {a} one {b} two {c} few {d} many {e} other {f}}'],
    ['an empty branch', '{count, plural, one {} other {# more}}'],
    ['a nested argument', '{count, plural, one {# entry on {day}} other {# entries on {day}}}'],
  ])('accepts a well-formed message: %s', (_name, message) => {
    expect(problemsOf(message)).toEqual([]);
  });

  it('fails an empty message, a non-string message and an empty group', () => {
    expect(problemsOf('')).toEqual(['empty message']);
    expect(problemsOf('   ')).toEqual(['empty message']);
    expect(problemsOf(42)).toEqual(['a message must be a string']);
    expect(problemsOf(['a'])).toEqual(['a message must be a string']);
    expect(problemsOf({})).toEqual(['empty group']);
    expect(lintCatalogue({ sample: 'text' })).toEqual([
      { partition: 'sample', key: '', problem: 'a partition must be a group of messages' },
    ]);
  });
});

describe('mergePartitions', () => {
  it('merges partitions that share an area group', () => {
    const merged = mergePartitions({
      settingsData: { settings: { data: { title: 'Your data' } } },
      settingsAi: { settings: { ai: { title: 'AI access' } } },
    });
    expect(merged).toEqual({
      settings: { data: { title: 'Your data' }, ai: { title: 'AI access' } },
    });
    expect(lookupMessage(merged, 'settings.ai.title')).toBe('AI access');
  });

  it('keeps the first definition of a clashing key without throwing', () => {
    const merged = mergePartitions({
      first: { home: { title: 'Today' } },
      second: { home: { title: 'This day' } },
      third: { home: 'Home' },
    });
    expect(lookupMessage(merged, 'home.title')).toBe('Today');
  });

  it('does not change the partitions it merges', () => {
    const first = { area: { a: 'A' } };
    const second = { area: { b: 'B' } };
    mergePartitions({ first, second });
    expect(first).toEqual({ area: { a: 'A' } });
  });
});
