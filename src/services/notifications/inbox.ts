// The in-app inbox of the Android app's notifications (P17-04, D-16.103). Pure.
//
// Every notice Platewise posts goes in when it is posted. Planned notifications (the person's
// reminders, the summary, the fasting goal, the nudges) fire from Android while the app may be
// closed, so the inbox keeps the last plan handed over and, when the app starts, comes back to the
// front, hands a new plan over or hears Android show one, adds every notification of that plan
// whose time has passed since it last looked. Each notification is kept once (`<id>@<when>`); an
// item counts only from the time its notification was planned as it is (a reminder switched on at
// 15:00 for 14:00 adds nothing that day), and only after the last look, so a deleted item never
// comes back. The list is newest first, at most 100 items and 30 days.
//
// The state is a plain record in the `notify.inbox` setting (device state, out of backups): read
// field by field and item by item, so a damaged part reads as empty without losing the rest.

import { addDays, dayKeyOf, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import { NOTICE_KINDS } from '../../domain/reminders/notices';
import type { NativeRequest } from '../reminders/requests';
import { clockOn } from '../reminders/schedule';
import type { InboxItem, InboxKind } from './contract';
import { targetOf } from './open';

export const INBOX_MAX_ITEMS = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
export const INBOX_MAX_AGE_MS = 30 * DAY_MS;

/** A notification of the last plan handed over. */
export interface PlannedItem {
  readonly id: number;
  readonly kind: InboxKind;
  readonly title: string;
  readonly body: string;
  readonly open: InboxItem['open'];
  /** The request's key: the same key means planned the same way. */
  readonly key: string;
  /** Once, at this instant. */
  readonly at?: number;
  /** Repeating at a clock time, every day or on one weekday (Capacitor's numbers, Sunday 1). */
  readonly on?: { readonly hour: number; readonly minute: number; readonly weekday?: number };
  /** Since when it has been planned this way. */
  readonly since: number;
}

export interface InboxState {
  /** Newest first. */
  readonly items: readonly InboxItem[];
  readonly plan: readonly PlannedItem[];
  /** Up to when the plan has been looked at; null before the first plan. */
  readonly seenAt: number | null;
}

export const EMPTY_INBOX: InboxState = { items: [], plan: [], seenAt: null };

// ---- Reading the stored record ---------------------------------------------------------------

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isInstant = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isText = (value: unknown): value is string => typeof value === 'string';

function readKind(value: unknown): InboxKind | null {
  if (value === 'reminder') return value;
  return NOTICE_KINDS.find((kind) => kind === value) ?? null;
}

function readItem(raw: unknown): InboxItem | null {
  if (!isFields(raw)) return null;
  const kind = readKind(raw.kind);
  const { ref, id, title, body, at } = raw;
  if (!isText(ref) || !Number.isInteger(id) || !kind || !isText(title) || !isText(body))
    return null;
  if (!isInstant(at)) return null;
  return {
    ref,
    id: id as number,
    kind,
    title,
    body,
    at,
    open: targetOf(raw.open),
    read: raw.read === true,
  };
}

function readClock(raw: unknown): PlannedItem['on'] | null {
  if (!isFields(raw) || !Number.isInteger(raw.hour) || !Number.isInteger(raw.minute)) return null;
  const hour = raw.hour as number;
  const minute = raw.minute as number;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const weekday = raw.weekday;
  if (weekday === undefined) return { hour, minute };
  return Number.isInteger(weekday) && (weekday as number) >= 1 && (weekday as number) <= 7
    ? { hour, minute, weekday: weekday as number }
    : null;
}

function readPlanned(raw: unknown): PlannedItem | null {
  if (!isFields(raw)) return null;
  const kind = readKind(raw.kind);
  const { id, title, body, key, since } = raw;
  if (!Number.isInteger(id) || !kind || !isText(title) || !isText(body) || !isText(key))
    return null;
  if (!isInstant(since)) return null;
  const base = { id: id as number, kind, title, body, key, since, open: targetOf(raw.open) };
  if (isInstant(raw.at)) return { ...base, at: raw.at };
  const on = readClock(raw.on);
  return on ? { ...base, on } : null;
}

function readList<T>(raw: unknown, readOne: (one: unknown) => T | null): T[] {
  return Array.isArray(raw) ? raw.flatMap((one) => readOne(one) ?? []) : [];
}

/** The stored record as the inbox. */
export function readInbox(stored: unknown): InboxState {
  if (!isFields(stored)) return EMPTY_INBOX;
  const items = new Map<string, InboxItem>();
  for (const item of readList(stored.items, readItem)) {
    if (!items.has(item.ref)) items.set(item.ref, item);
  }
  return {
    items: [...items.values()].sort((a, b) => b.at - a.at),
    plan: readList(stored.plan, readPlanned),
    seenAt: isInstant(stored.seenAt) ? stored.seenAt : null,
  };
}

// ---- Changes ---------------------------------------------------------------------------------

/** Newest first, nothing older than 30 days, at most 100. */
function tidy(items: readonly InboxItem[], now: number): InboxItem[] {
  return items
    .filter((item) => item.at >= now - INBOX_MAX_AGE_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, INBOX_MAX_ITEMS);
}

/** `items` added (those already kept are left as they are). */
export function addItems(state: InboxState, items: readonly InboxItem[], now: number): InboxState {
  const kept = new Set(state.items.map((item) => item.ref));
  const fresh = items.filter((item) => !kept.has(item.ref));
  if (fresh.length === 0) return state;
  return { ...state, items: tidy([...state.items, ...fresh], now) };
}

function itemOf(planned: PlannedItem, at: number): InboxItem {
  const { id, kind, title, body, open } = planned;
  return { ref: `${id}@${at}`, id, kind, title, body, at, open, read: false };
}

/** Capacitor's weekday number of a day: Sunday 1 … Saturday 7. */
function weekdayNumber(day: DayKey): number {
  return new Date(startOfDay(day)).getDay() + 1;
}

const two = (n: number) => String(n).padStart(2, '0');

/** The times a repeating notification came in `(after, now]`, at most the last 30 days. */
function occurrences(on: NonNullable<PlannedItem['on']>, after: number, now: number): number[] {
  const at = `${two(on.hour)}:${two(on.minute)}`;
  const found: number[] = [];
  const last = dayKeyOf(now);
  for (let day = dayKeyOf(Math.max(after, now - INBOX_MAX_AGE_MS)); day <= last;) {
    if (on.weekday === undefined || on.weekday === weekdayNumber(day)) {
      const when = clockOn(day, at);
      if (when > after && when <= now) found.push(when);
    }
    day = addDays(day, 1);
  }
  return found;
}

/**
 * Every notification of the stored plan that came since the last look (and since it was planned
 * as it is), as inbox items. The same state when none did.
 */
export function reconcile(state: InboxState, now: number): InboxState {
  if (state.seenAt === null) return { ...state, seenAt: now };
  const seenAt = state.seenAt;
  const came: InboxItem[] = [];
  for (const planned of state.plan) {
    const after = Math.max(seenAt, planned.since);
    if (planned.at !== undefined) {
      if (planned.at > after && planned.at <= now) came.push(itemOf(planned, planned.at));
    } else if (planned.on) {
      for (const at of occurrences(planned.on, after, now)) came.push(itemOf(planned, at));
    }
  }
  if (came.length === 0) return state;
  return { ...addItems(state, came, now), seenAt: now };
}

/**
 * The plan just handed over, kept for the next look; each notification planned as before keeps
 * the time since when it was. The same state when nothing changed. Notifications shown at once
 * (no schedule) are kept by the notices themselves.
 */
export function withPlan(
  state: InboxState,
  requests: readonly NativeRequest[],
  now: number,
): InboxState {
  const before = new Map(state.plan.map((planned) => [planned.id, planned]));
  const plan: PlannedItem[] = [];
  for (const request of requests) {
    const { schedule } = request;
    if (!schedule) continue;
    const { id, title, body, extra } = request;
    const earlier = before.get(id);
    const since = earlier && earlier.key === extra.key ? earlier.since : now;
    const kind: InboxKind = extra.kind ?? 'reminder';
    const base = { id, kind, title, body, open: extra.open };
    const timing = 'at' in schedule ? { at: schedule.at.getTime() } : { on: { ...schedule.on } };
    plan.push({ ...base, key: extra.key, since, ...timing });
  }
  const same =
    plan.length === state.plan.length &&
    plan.every((planned, index) => {
      const old = state.plan[index];
      return old !== undefined && old.id === planned.id && old.key === planned.key;
    });
  return same ? state : { ...state, plan };
}

function changeItems(state: InboxState, change: (item: InboxItem) => InboxItem): InboxState {
  let changed = false;
  const items = state.items.map((item) => {
    const next = change(item);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? { ...state, items } : state;
}

export function markRead(state: InboxState, ref: string): InboxState {
  return changeItems(state, (item) =>
    item.ref === ref && !item.read ? { ...item, read: true } : item,
  );
}

export function markAllRead(state: InboxState): InboxState {
  return changeItems(state, (item) => (item.read ? item : { ...item, read: true }));
}

/** A tap on the system notification `id`: its newest item that has come is read. */
export function markTapped(state: InboxState, id: number, now: number): InboxState {
  const newest = state.items.find((item) => item.id === id && item.at <= now);
  return newest ? markRead(state, newest.ref) : state;
}

export function removeItem(state: InboxState, ref: string): InboxState {
  const items = state.items.filter((item) => item.ref !== ref);
  return items.length === state.items.length ? state : { ...state, items };
}

export function clearItems(state: InboxState): InboxState {
  return state.items.length === 0 ? state : { ...state, items: [] };
}

export function unreadCount(items: readonly InboxItem[]): number {
  return items.reduce((count, item) => count + (item.read ? 0 : 1), 0);
}
