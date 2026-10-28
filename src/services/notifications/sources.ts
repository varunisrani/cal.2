// What the Android app's nudges are planned from (P17-01, D-16.100), read from the stored data,
// and the watch that plans them again after every change to it: the diary from 14 days back (the
// usual meal times) to 6 days ahead, the water of the next 7 days and the newest weigh-in. The
// settings and the running fast are watched by the reminders already (`ports.ts`).

import type { LiveSource } from '../../data/live';
import type { DiaryRepo } from '../../data/repos/diaryRepo';
import type { WaterRepo } from '../../data/repos/waterRepo';
import type { WeightRepo } from '../../data/repos/weightRepo';
import { addDays, dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import type { MealKind } from '../../domain/model';
import { USUAL_TIME_DAYS, usualMealTime } from '../../domain/reminders/usualTimes';
import type { Clock } from '../../lib/clock';
import {
  CHECKED_MEALS,
  NUDGE_DAYS,
  nudgeDays,
  type CheckedMeal,
  type DayLog,
  type NudgeFacts,
} from '../reminders/nudgePlan';

export interface NudgeRepos {
  readonly diaryRepo: Pick<DiaryRepo, 'between'>;
  readonly waterRepo: Pick<WaterRepo, 'byDay'>;
  readonly weightRepo: Pick<WeightRepo, 'latest'>;
}

/** Reads the facts the nudges of the 7 days from `now` are planned from. */
export async function readNudgeFacts(repos: NudgeRepos, now: number): Promise<NudgeFacts> {
  const today = dayKeyOf(now);
  const days = nudgeDays(now);
  const [entries, water, newest] = await Promise.all([
    repos.diaryRepo.between(addDays(today, -USUAL_TIME_DAYS), addDays(today, NUDGE_DAYS - 1)),
    Promise.all(days.map((day) => repos.waterRepo.byDay(day))),
    repos.weightRepo.latest(),
  ]);
  const logs = new Map<DayKey, DayLog>();
  days.forEach((day, index) => {
    const meals = new Set<MealKind>();
    for (const entry of entries) if (entry.dayKey === day) meals.add(entry.meal);
    const waterLogs = water[index] ?? [];
    const waterMl = waterLogs.reduce((sum, log) => sum + log.ml, 0);
    logs.set(day, { meals: [...meals], waterMl, any: meals.size > 0 || waterLogs.length > 0 });
  });
  const usual: Partial<Record<CheckedMeal, string>> = {};
  for (const meal of CHECKED_MEALS) {
    const time = usualMealTime(entries, meal, today);
    if (time !== null) usual[meal] = time;
  }
  return { days: logs, usual, lastWeighIn: newest?.at ?? null };
}

/** Calls `onChange` after every stored change the facts depend on; returns the stop. */
export function watchNudgeFacts(
  repos: NudgeRepos,
  clock: Clock,
  live: <T>(query: () => T | Promise<T>) => LiveSource<T>,
): (onChange: () => void) => () => void {
  return (onChange) => {
    // As plain values, so a read that found the same facts is not reported as a change.
    const source = live(async () => {
      const facts = await readNudgeFacts(repos, clock.now());
      return { ...facts, days: [...facts.days] };
    });
    return source.subscribe(() => {
      if (source.getSnapshot().status === 'ready') onChange();
    });
  };
}
