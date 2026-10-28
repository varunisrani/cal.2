// The events behind the Android app's notices (P17-02, D-16.101). Each watch reads what it needs
// live (every stored change that touches it, in this tab or another) and posts through `Notices`,
// whose onceKey makes each at most once a day (the week's once a week, an analysis once):
// - the day's sugar passed the limit from Nutrient goals (only foods with a sugar figure count);
// - the day's calories passed the day's target (the goal plus the burn counted in, as Home shows
//   it) by 10 %;
// - the day's protein reached its target;
// - the week, from the person's week start, reached 150 active minutes (recorded walks and other
//   apps' walking sessions from Health Connect, P15);
// - a photo analysis finished while the app was in the background: a tap opens its review;
// - an automatic or Google Drive backup failed twice in a row (each stored failure time counts
//   one, a success starts again): a tap opens Settings › Your data.
// The fasting goal is planned ahead with the reminders (`nativePlan.ts`), not posted here.
//
// The Coach's notices (coachReplied, coachCheckIn: P17 S2) post through the same
// `NotifyService.notices.post`, with `open: { coachChat: id }`; nothing here watches the Coach.

import type { LiveSource } from '../../data/live';
import type { DiaryRepo } from '../../data/repos/diaryRepo';
import type { HealthRepo } from '../../data/repos/healthRepo';
import type { ProfileRepo } from '../../data/repos/profileRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { WalkRepo } from '../../data/repos/walkRepo';
import { addDays, dayKeyOf, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import { weekStart } from '../../domain/dates/week';
import { formulaPlan } from '../../domain/goals/formulas';
import { effectiveTargets } from '../../domain/goals/targets';
import { toDisplay, type EnergyDisplayUnit } from '../../domain/units/energy';
import { weekWalkingMinutes } from '../../domain/walks/week';
import { burnSource, countedBurn, walkBurn } from '../../features/home/burn';
import { t } from '../../i18n/t';
import type { Clock } from '../../lib/clock';
import type { AnalysisService } from '../analysis';
import type { PageVisibility } from '../reminders/engine';
import type { Notice, Notices } from './contract';
import { nextStreak, type BackupSource } from './device';
import { caloriesPassed, proteinReached, sugarPassed, sugarTotal, weekReached } from './events';
import type { NotifyStore } from './store';

export interface EventDeps {
  readonly notices: Notices;
  readonly store: NotifyStore;
  readonly clock: Clock;
  readonly visibility: PageVisibility;
  readonly diaryRepo: Pick<DiaryRepo, 'byDay'>;
  readonly profileRepo: Pick<ProfileRepo, 'get'>;
  readonly settingsRepo: Pick<SettingsRepo, 'snapshot' | 'get'>;
  /** Health Connect's copy, where the app has it. */
  readonly activityRepo?: Pick<HealthRepo, 'between'>;
  /** The recorded walks, where the app records them. */
  readonly walkRepo?: Pick<WalkRepo, 'between'>;
  readonly analysis?: Pick<AnalysisService, 'subscribe' | 'getSnapshot'>;
  /** Live reads (`src/data/live`). */
  live<T>(query: () => T | Promise<T>): LiveSource<T>;
  /** A watch that failed; the console by default. */
  onError?(error: unknown): void;
}

/** What the day's and the week's notices are decided from. */
export interface DayFacts {
  readonly day: DayKey;
  readonly sugarG: number | null;
  readonly sugarLimitG: number;
  readonly eatenKcal: number;
  /** The day's energy target with the burn counted in; null without a readable plan. */
  readonly targetKcal: number | null;
  readonly proteinG: number;
  readonly proteinGoalG: number | null;
  readonly unit: EnergyDisplayUnit;
  /** The week's first day, and its active minutes so far. */
  readonly weekFirst: DayKey;
  readonly weekMinutes: number;
}

function reportToConsole(error: unknown): void {
  console.error('Platewise: a notification event could not be checked', error);
}

/** Reads the day's facts (inside a live query, so every change to them reads them again). */
async function readFacts(deps: EventDeps, now: number): Promise<DayFacts> {
  const { diaryRepo, profileRepo, settingsRepo, activityRepo, walkRepo } = deps;
  const day = dayKeyOf(now);
  const [entries, settings, profile] = await Promise.all([
    diaryRepo.byDay(day),
    settingsRepo.snapshot(),
    profileRepo.get(),
  ]);
  const connected = activityRepo !== undefined && settings['health.connected'];
  const weekFirst = weekStart(day, settings['display.weekStart']);
  const weekLast = addDays(weekFirst, 6);
  const walks = walkRepo ? await walkRepo.between(weekFirst, weekLast) : [];
  const activity = connected ? await activityRepo.between(weekFirst, weekLast) : [];

  let targetKcal: number | null = null;
  let proteinGoalG: number | null = null;
  if (profile.kind === 'ok') {
    const plan = effectiveTargets(profile.value.saved, formulaPlan(profile.value, day));
    let burned: number | null = null;
    if (settings['health.countActiveCalories']) {
      const source = burnSource(connected, walkRepo !== undefined);
      if (source === 'health') {
        burned = countedBurn(plan.kcal, activity.find((row) => row.day === day) ?? null);
      } else if (source === 'walks') {
        burned = walkBurn(
          plan.kcal,
          walks.filter((walk) => dayKeyOf(walk.startedAt) === day),
        );
      }
    }
    targetKcal = plan.kcal + (burned ?? 0);
    proteinGoalG = plan.protein;
  }

  const week = weekWalkingMinutes({
    walks,
    sessions: activity.flatMap((row) => row.sessions),
    from: startOfDay(weekFirst),
    to: startOfDay(addDays(weekFirst, 7)),
  });
  return {
    day,
    sugarG: sugarTotal(entries),
    sugarLimitG: settings['goals.nutrients'].sugar,
    eatenKcal: entries.reduce((sum, entry) => sum + entry.kcal, 0),
    targetKcal,
    proteinG: entries.reduce((sum, entry) => sum + entry.protein, 0),
    proteinGoalG,
    unit: settings['units.energy'],
    weekFirst,
    weekMinutes: week.total,
  };
}

/** The notices the facts call for (each posted once by its onceKey). */
export function dayNotices(facts: DayFacts): Notice[] {
  const { day, unit } = facts;
  const list: Notice[] = [];
  if (sugarPassed(facts.sugarG, facts.sugarLimitG)) {
    list.push({
      kind: 'sugarOver',
      title: t('reminders.notice.sugarOver'),
      body: t('reminders.notice.grams', {
        eaten: Math.round(facts.sugarG ?? 0),
        goal: facts.sugarLimitG,
      }),
      open: 'home',
      onceKey: `sugarOver:${day}`,
    });
  }
  if (facts.targetKcal !== null && caloriesPassed(facts.eatenKcal, facts.targetKcal)) {
    list.push({
      kind: 'caloriesOver',
      title: t('reminders.notice.caloriesOver'),
      body: t('reminders.notice.calories', {
        eaten: toDisplay(facts.eatenKcal, unit),
        goal: toDisplay(facts.targetKcal, unit),
        unit,
      }),
      open: 'home',
      onceKey: `caloriesOver:${day}`,
    });
  }
  if (facts.proteinGoalG !== null && proteinReached(facts.proteinG, facts.proteinGoalG)) {
    list.push({
      kind: 'proteinReached',
      title: t('reminders.notice.proteinReached'),
      body: t('reminders.notice.grams', {
        eaten: Math.round(facts.proteinG),
        goal: facts.proteinGoalG,
      }),
      open: 'home',
      onceKey: `proteinReached:${day}`,
    });
  }
  if (weekReached(facts.weekMinutes)) {
    list.push({
      kind: 'activeWeek',
      title: t('reminders.notice.activeWeek'),
      body: t('reminders.notice.activeBody'),
      open: 'home',
      onceKey: `activeWeek:${facts.weekFirst}`,
    });
  }
  return list;
}

const BACKUP_KEYS = { auto: 'backup.autoState', drive: 'backup.drive' } as const;

/** Starts every watch; returns the stop. */
export function watchEvents(deps: EventDeps): () => void {
  const { notices, store, clock, visibility } = deps;
  const onError = deps.onError ?? reportToConsole;
  let stopped = false;
  const stops: (() => void)[] = [];

  const post = (notice: Notice): void => {
    if (stopped) return;
    notices.post(notice).catch(onError);
  };

  /** Calls `onValue` with each new value of a live read. */
  function follow<T>(source: LiveSource<T>, onValue: (value: T) => void): void {
    stops.push(
      source.subscribe(() => {
        const state = source.getSnapshot();
        if (state.status === 'ready') onValue(state.value);
        else if (state.status === 'error') onError(state.error);
      }),
    );
  }

  follow(
    deps.live(() => readFacts(deps, clock.now())),
    (facts) => dayNotices(facts).forEach(post),
  );

  // Two failed backups in a row, of either kind.
  for (const source of ['auto', 'drive'] as const satisfies readonly BackupSource[]) {
    follow(
      deps.live(() => deps.settingsRepo.get(BACKUP_KEYS[source])),
      (state) => void countFailure(source, state.problem?.at ?? null),
    );
  }

  async function countFailure(source: BackupSource, problemAt: number | null): Promise<void> {
    let reached = false;
    try {
      await store.device.change((state) => {
        const streak = nextStreak(state.fails[source], problemAt);
        reached = streak !== state.fails[source] && streak.count >= 2;
        return streak === state.fails[source]
          ? state
          : { ...state, fails: { ...state.fails, [source]: streak } };
      });
    } catch (error) {
      onError(error);
      return;
    }
    if (!reached) return;
    post({
      kind: 'backupFailed',
      title: t('reminders.notice.backupFailed'),
      body: t('reminders.notice.backupBody'),
      open: 'data',
      onceKey: `backupFailed:${dayKeyOf(clock.now())}`,
    });
  }

  // A photo analysis that finished while the app was in the background.
  const { analysis } = deps;
  if (analysis) {
    let phase = analysis.getSnapshot().phase;
    stops.push(
      analysis.subscribe(() => {
        const state = analysis.getSnapshot();
        const was = phase;
        phase = state.phase;
        if (was !== 'analysing' || state.phase !== 'reviewReady' || visibility.isVisible()) return;
        post({
          kind: 'analysisReady',
          title: t('reminders.notice.analysisReady'),
          body: t('reminders.notice.analysisBody'),
          open: 'review',
          onceKey: `analysisReady:${state.draft.createdAt}`,
        });
      }),
    );
  }

  return () => {
    stopped = true;
    for (const stop of stops.splice(0)) stop();
  };
}
