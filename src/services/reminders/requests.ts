// One notification as the Android app hands it to the system (P13, P17): its words, when it
// comes, its channel, its icon, and in `extra` where a tap opens the app and a key of everything
// it says and when, so a later hand-over leaves an unchanged one alone (the system would otherwise
// take it out of the notification shade while scheduling it again). Pure.

import type { NoticeKind } from '../../domain/reminders/notices';
import type { OpenTarget } from '../notifications/contract';

export type { OpenTarget } from '../notifications/contract';

/** The status-bar icon drawn by scripts/android/icons.py. */
export const SMALL_ICON = 'ic_stat_platewise';

/** The reminders' notification channel, as Android's settings list it (P13). */
export const CHANNEL_ID = 'platewise-reminders';

/** Each kind Platewise sends by itself has its own channel, so Android's settings can mute one. */
export function channelOf(kind: NoticeKind): string {
  return `platewise-${kind}`;
}

/** When the system brings one: a clock time every day (or every week on a weekday), or once. */
export type NativeSchedule =
  | {
      readonly on: { readonly hour: number; readonly minute: number; readonly weekday?: number };
      readonly allowWhileIdle: true;
    }
  | { readonly at: Date; readonly allowWhileIdle: true };

export interface NativeExtra {
  readonly open: OpenTarget;
  /** Everything the notification says and when, as one string. */
  readonly key: string;
  /** What Platewise sent by itself (P17); absent for the person's reminders. */
  readonly kind?: NoticeKind;
}

/** One notification for the system; without `schedule` it shows at once. */
export interface NativeRequest {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly schedule?: NativeSchedule;
  readonly smallIcon: string;
  readonly channelId: string;
  readonly extra: NativeExtra;
}

export interface Words {
  readonly title: string;
  readonly body: string;
}

/** A notification: the reminders' channel, or its kind's. */
export function request(
  id: number,
  words: Words,
  schedule: NativeSchedule | undefined,
  open: OpenTarget,
  kind?: NoticeKind,
): NativeRequest {
  const when =
    schedule === undefined ? null : 'at' in schedule ? schedule.at.getTime() : schedule.on;
  const said = [words.title, words.body, when, open];
  const key = JSON.stringify(kind === undefined ? said : [...said, kind]);
  return {
    id,
    title: words.title,
    body: words.body,
    ...(schedule ? { schedule } : {}),
    smallIcon: SMALL_ICON,
    channelId: kind === undefined ? CHANNEL_ID : channelOf(kind),
    extra: kind === undefined ? { open, key } : { open, key, kind },
  };
}

function clockParts(at: string): { hour: number; minute: number } {
  return { hour: Number(at.slice(0, 2)), minute: Number(at.slice(3, 5)) };
}

/** Every day at `at` (`HH:MM`), by the calendar, so it keeps its clock time across DST. */
export const daily = (at: string): NativeSchedule => ({ on: clockParts(at), allowWhileIdle: true });

/** Every week on a weekday (Capacitor's numbers, Sunday 1). */
export const weekly = (at: string, weekday: number): NativeSchedule => ({
  on: { ...clockParts(at), weekday },
  allowWhileIdle: true,
});

/** Once, at an instant. */
export const once = (at: number): NativeSchedule => ({ at: new Date(at), allowWhileIdle: true });
