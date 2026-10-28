import { describe, expect, it } from 'vitest';
import { createTranslator, t, type MessageParams } from './t';

// Our own test messages; the real catalogue has no placeholders yet.
const fixture = {
  greet: { hello: 'Hello, {name}!', plain: 'Nothing to fill' },
  diary: {
    entries: '{count, plural, one {# entry} other {# entries}}',
    entriesOn: '{count, plural, one {# entry on {day}} other {# entries on {day}}}',
  },
  broken: { unclosed: 'Oops {name' },
} as const;

const strict = createTranslator(fixture, { strict: true, locale: () => 'en-US' });
const production = createTranslator(fixture, { strict: false, locale: () => 'en-US' });

/** The same translators without key typing, to reach keys the compiler would refuse. */
type Loose = (key: string, params?: MessageParams) => string;
const looseStrict = strict as unknown as Loose;
const looseProduction = production as unknown as Loose;

describe('t', () => {
  it('reads messages from the real catalogue by dotted key', () => {
    expect(t('common.appName')).toBe('Platewise');
    expect(t('common.save')).toBe('Save');
    expect(t('common.tabs.progress')).toBe('Progress');
  });

  it('holds the shared words: the app name, four tabs and nine buttons', () => {
    const tabs = (['home', 'progress', 'coach', 'settings'] as const).map((tab) =>
      t(`common.tabs.${tab}`),
    );
    expect(tabs).toEqual(['Home', 'Progress', 'Coach', 'Settings']);
    const buttons = [
      'save',
      'cancel',
      'done',
      'delete',
      'back',
      'retry',
      'close',
      'edit',
      'add',
    ] as const;
    expect(buttons.map((button) => t(`common.${button}`))).toEqual([
      'Save',
      'Cancel',
      'Done',
      'Delete',
      'Back',
      'Retry',
      'Close',
      'Edit',
      'Add',
    ]);
  });

  it('refuses an unknown key at compile time and throws for it in tests', () => {
    // @ts-expect-error an unknown key does not compile
    expect(() => t('common.nope')).toThrow('Unknown message key "common.nope"');
  });

  it('throws for an unknown key when strict', () => {
    expect(() => looseStrict('greet.nope')).toThrow('Unknown message key "greet.nope"');
    expect(() => looseStrict('greet')).toThrow('Unknown message key "greet"');
    expect(() => looseStrict('greet.hello.deeper')).toThrow('Unknown message key');
    expect(() => looseStrict('greet.toString')).toThrow('Unknown message key');
  });

  it('returns the key itself for an unknown key in production', () => {
    expect(looseProduction('greet.nope')).toBe('greet.nope');
  });

  it('throws for a message that does not parse when strict, and shows it as text in production', () => {
    expect(() => looseStrict('broken.unclosed', { name: 'x' })).toThrow(
      'Message "broken.unclosed" does not parse',
    );
    expect(looseProduction('broken.unclosed', { name: 'x' })).toBe('Oops {name');
  });
});

describe('t and partitions fetched on demand (P18-00)', () => {
  // `later` stands for an on-demand partition that is not registered yet.
  const pending = (key: string) => (key.startsWith('later.') ? 'later' : undefined);
  const strictPending = createTranslator(fixture, { strict: true, pending }) as unknown as Loose;
  const productionPending = createTranslator(fixture, {
    strict: false,
    pending,
  }) as unknown as Loose;

  it('throws for a key of a partition not registered yet when strict, naming the partition', () => {
    expect(() => strictPending('later.title')).toThrow(
      'Message "later.title" is in the partition "later", which is not registered yet',
    );
  });

  it('draws nothing for it in production, never the raw key', () => {
    expect(productionPending('later.title')).toBe('');
  });

  it('keeps the unknown-key behaviour for a key of no partition, and reads registered ones', () => {
    expect(() => strictPending('greet.nope')).toThrow('Unknown message key "greet.nope"');
    expect(productionPending('greet.nope')).toBe('greet.nope');
    expect(productionPending('greet.plain')).toBe('Nothing to fill');
  });
});

describe('t interpolation', () => {
  it('replaces {name} with the param', () => {
    expect(strict('greet.hello', { name: 'Sam' })).toBe('Hello, Sam!');
  });

  it('needs no params for a message without placeholders', () => {
    expect(strict('greet.plain')).toBe('Nothing to fill');
  });

  it('formats number params with the locale', () => {
    expect(strict('greet.hello', { name: 8368 })).toBe('Hello, 8,368!');
    const german = createTranslator(fixture, { strict: true, locale: () => 'de-DE' });
    expect(german('greet.hello', { name: 8368 })).toBe('Hello, 8.368!');
  });

  it('throws when a param is missing', () => {
    expect(() => strict('greet.hello', {})).toThrow(
      'missing param "name" in message "greet.hello"',
    );
    // @ts-expect-error the message has a placeholder, so params are required
    expect(() => strict('greet.hello')).toThrow('missing param "name"');
  });

  it('leaves the placeholder when a param is missing in production', () => {
    expect(production('greet.hello', {})).toBe('Hello, {name}!');
  });
});

describe('t plurals', () => {
  it('picks one for 1 and other for 2 in en', () => {
    expect(strict('diary.entries', { count: 1 })).toBe('1 entry');
    expect(strict('diary.entries', { count: 2 })).toBe('2 entries');
    expect(strict('diary.entries', { count: 0 })).toBe('0 entries');
  });

  it('prints the count in # with the locale', () => {
    expect(strict('diary.entries', { count: 1234 })).toBe('1,234 entries');
    const german = createTranslator(fixture, { strict: true, locale: () => 'de-DE' });
    expect(german('diary.entries', { count: 1234 })).toBe('1.234 entries');
  });

  it('follows English plural rules whatever the number locale', () => {
    // French puts 0 and 1.5 in "one"; the English text must still say "entries".
    const french = createTranslator(fixture, { strict: true, locale: () => 'fr-FR' });
    expect(french('diary.entries', { count: 0 })).toBe('0 entries');
    expect(french('diary.entries', { count: 1.5 })).toBe('1,5 entries');
  });

  it('selects the branch for the count as printed', () => {
    expect(strict('diary.entries', { count: 1.0004 })).toBe('1 entry');
  });

  it('fills params inside a branch', () => {
    expect(strict('diary.entriesOn', { count: 1, day: 'Monday' })).toBe('1 entry on Monday');
    expect(strict('diary.entriesOn', { count: 3, day: 'Monday' })).toBe('3 entries on Monday');
  });

  it('throws when the plural value is missing or not a finite number', () => {
    expect(() => strict('diary.entries', {})).toThrow('missing param "count"');
    expect(() => strict('diary.entries', { count: 'two' })).toThrow(
      'param "count" must be a finite number',
    );
    expect(() => strict('diary.entries', { count: Number.NaN })).toThrow('finite number');
  });

  it('leaves the placeholder for a bad plural value in production', () => {
    expect(production('diary.entries', { count: 'two' })).toBe('{count}');
  });
});
