// The Coach's `propose_reminder` (P13, D-16.93). The model hands in what a reminder should say, a
// time and the days or the date; the call reads them leniently (a one-digit hour, full or short
// English day names, "daily", "weekdays", an array where a list was asked for) and checks them the
// way Settings would, through the custom reminders service's `problemWith`. A good proposal is
// kept for the turn, once, and the model hears that it waits for the person; a bad one is answered
// with the reason in words so the model can ask the person again. Nothing is stored here: the
// session puts the turn's proposals on the reply, and the reminder is added only when the person
// taps Add on its card.

import type { DayKey } from '../../domain/dates/dayKey';
import {
  CUSTOM_REMINDER_LIMIT,
  CUSTOM_TEXT_MAX,
  WEEKDAYS,
  checkCustomReminder,
  isWeekday,
  type CustomReminderInput,
  type CustomReminderProblem,
  type Weekday,
} from '../../domain/reminders/custom';
import { MAX_PROPOSALS } from './toolSchemas';

/** What checks a proposal: the custom reminders service in the app. */
export interface ReminderChecks {
  problemWith(input: CustomReminderInput): CustomReminderProblem | null;
}

/** A reminder the Coach proposed in a turn, checked and tidied: `days` or `date`. */
export interface ReminderProposal {
  readonly text: string;
  readonly time: string;
  readonly days?: readonly Weekday[];
  readonly date?: DayKey;
}

/** One attempt's proposals: what checks them, and the good ones so far, in order. */
export interface ReminderDesk {
  readonly checks: ReminderChecks;
  readonly proposals: ReminderProposal[];
}

export function createReminderDesk(checks: ReminderChecks): ReminderDesk {
  return { checks, proposals: [] };
}

type Args = Readonly<Record<string, unknown>>;

/** Words that name a set of days ("every day" reads as its last word). */
const DAY_SETS: Readonly<Record<string, readonly Weekday[]>> = {
  daily: WEEKDAYS,
  day: WEEKDAYS,
  everyday: WEEKDAYS,
  all: WEEKDAYS,
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  weekends: ['sat', 'sun'],
  weekend: ['sat', 'sun'],
};

/** Words between day names that name nothing. */
const FILLER: ReadonlySet<string> = new Set(['and', 'every', 'each', 'on']);

function argsOf(raw: unknown): Args {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Args) : {};
}

/** A string argument trimmed; a blank one counts as left out (models send "" for optional ones). */
function textArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** `9:05` → `09:05`; anything else as it came, for the check to refuse. */
function timeArg(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(raw);
  return match ? `${match[1]!.padStart(2, '0')}:${match[2]}` : raw;
}

/** The English names, in `WEEKDAYS` order, that a day word may shorten. */
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * The days one lower-case word names: `mon`, `monday`, `tues`, `mondays` → `mon`; `daily` → all;
 * null for none (`monthly` is no Monday).
 */
function daysOfWord(word: string): readonly Weekday[] | null {
  const set = DAY_SETS[word];
  if (set) return set;
  const single = word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word;
  const at = DAY_NAMES.findIndex(
    (name) => word.length >= 3 && (name.startsWith(word) || name === single),
  );
  return at === -1 ? null : [WEEKDAYS[at]!];
}

/**
 * The days as the call gave them, Monday first, each once: a list in a string or an array, or a
 * word for a set. Undefined when left out or blank; a word that names no day is kept after them,
 * so the check answers `noDays`.
 */
function daysArg(value: unknown): readonly string[] | undefined {
  const words = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? value.split(/[\s,;/&+]+/u)
      : [];
  const tokens = words
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word !== '' && !FILLER.has(word));
  if (tokens.length === 0) return undefined;
  const meant = new Set<string>();
  for (const token of tokens) {
    const days = daysOfWord(token);
    if (days) days.forEach((day) => meant.add(day));
    else meant.add(token);
  }
  const strays = [...meant].filter((word) => !isWeekday(word));
  return [...WEEKDAYS.filter((day) => meant.has(day)), ...strays];
}

/** The reminder the call describes, as the custom reminders service takes it. */
export function readProposal(raw: unknown): CustomReminderInput {
  const args = argsOf(raw);
  const days = daysArg(args.days);
  const date = textArg(args.date);
  return {
    text: typeof args.text === 'string' ? args.text : '',
    time: timeArg(args.time),
    ...(days === undefined ? {} : { days: days as Weekday[] }),
    ...(date === undefined ? {} : { date: date as DayKey }),
  };
}

/** What the model hears for each problem: what is wrong, and what to do about it. */
const PROBLEM_TEXT: Readonly<Record<CustomReminderProblem, string>> = {
  noText: 'The reminder has no words. Ask the person what it should say.',
  textTooLong: `The words are longer than ${CUSTOM_TEXT_MAX} characters. Make them shorter.`,
  badTime:
    'The time is not a time of day in 24 hours (HH:MM). If the person gave no time, ask them ' +
    'for one rather than picking it.',
  noDays:
    'The days are not weekdays. Use three-letter English names joined by commas ' +
    '(mon,tue,wed,thu,fri,sat,sun) or "daily", or ask the person which days they mean.',
  badDate: 'The date is not a real day written YYYY-MM-DD.',
  daysOrDate:
    'Give either days, for a reminder that repeats, or one date, for a one-time reminder: not ' +
    'both and not neither. If the person did not say which, ask them.',
  past: 'That date and time have already passed. Ask the person for a time still ahead.',
  full:
    `The person already keeps ${CUSTOM_REMINDER_LIMIT} reminders, the most the app allows. ` +
    'They can delete one in Settings first.',
  notFound: 'That reminder could not be found.',
};

/** The proposal as the turn keeps it: tidied by the same rules the service keeps reminders by. */
function proposalOf(input: CustomReminderInput): ReminderProposal | null {
  const checked = checkCustomReminder(input);
  if (!checked.ok) return null;
  const { text, time, days, date } = checked.value;
  return days === undefined ? { text, time, date } : { text, time, days };
}

function sameProposal(a: ReminderProposal, b: ReminderProposal): boolean {
  return (
    a.text === b.text &&
    a.time === b.time &&
    a.date === b.date &&
    (a.days ?? []).join() === (b.days ?? []).join()
  );
}

/** The proposal as the model reads it back: the fields it will see on the card. */
function shown(proposal: ReminderProposal): Record<string, unknown> {
  return proposal.days === undefined
    ? { text: proposal.text, time: proposal.time, date: proposal.date }
    : {
        text: proposal.text,
        time: proposal.time,
        days: proposal.days.length === WEEKDAYS.length ? 'daily' : proposal.days.join(','),
      };
}

const WAITING =
  'It is shown to the person as a card under your reply, with Add and Dismiss. Nothing is set ' +
  'until they tap Add, so do not say that the reminder is set: say you have proposed it.';

/**
 * Runs one `propose_reminder` call: the answer for the model, as the text of one JSON object. A
 * good proposal is added to `desk.proposals` unless the same one is already there.
 */
export function proposeReminder(raw: unknown, desk: ReminderDesk): string {
  const input = readProposal(raw);
  const problem = desk.checks.problemWith(input);
  const proposal = problem === null ? proposalOf(input) : null;
  if (proposal === null) {
    const code = problem ?? 'noText';
    return JSON.stringify({ error: PROBLEM_TEXT[code], problem: code });
  }
  if (desk.proposals.some((each) => sameProposal(each, proposal))) {
    return JSON.stringify({ proposed: true, reminder: shown(proposal), note: WAITING });
  }
  if (desk.proposals.length >= MAX_PROPOSALS) {
    return JSON.stringify({
      error:
        `Only ${MAX_PROPOSALS} reminders can be proposed in one reply. Propose the rest after ` +
        'the person has answered.',
    });
  }
  desk.proposals.push(proposal);
  return JSON.stringify({ proposed: true, reminder: shown(proposal), note: WAITING });
}
