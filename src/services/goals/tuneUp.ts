// The weekly tune-up runner (P05-09, D-16.45): the side effects around the P01-16 reducer. It reads
// the stored switch, check day and kept plan, asks the reducer what a trigger means, sends the
// same AI plan request as a rebuild (R01.1: there is no formula corrector), and writes what the
// reducer's settlement says. One run is in flight at a time; triggers meanwhile are dropped, so a
// burst of visibility events costs one AI call (R01.5). A failure keeps the plan and still counts
// as this week's check while the switch is on. A reply is applied only over the profile it was
// built from (R01.4). The plan from before the first change is kept once and put back when the
// switch goes off (R01.14). Outcomes are kinds and numbers; the Settings page words them.

import {
  plan as decide,
  settle,
  stillWanted,
  turnOff as switchedOff,
  turnOn as switchedOn,
  type RunNow,
  type RunStart,
  type SkipReason,
  type TuneUpState,
  type TuneUpTrigger,
} from '../../domain/adaptive/cadence';
import type { DayKey } from '../../domain/dates/dayKey';
import type { Profile } from '../../domain/model';
import { planInputsKey } from '../../domain/profile/signature';
import type { AiFailure } from '../../ai/errors';
import { ProfileUnavailableError } from '../../data/repos/profileRepo';
import {
  preparePlanRequest,
  readSwitches,
  readTuneUpState,
  replaceIfUnchanged,
  sendPlanRequest,
  todayOf,
  type PlanServiceDeps,
} from './planRequest';

/** Why a trigger changed nothing: the reducer's skip reasons, or how a reply was let go. */
export type UnchangedWhy =
  | SkipReason
  /** The profile changed while the request ran; nothing applied, nothing marked. */
  | 'dropped'
  /** The switch went off or an input switch changed meanwhile; nothing applied, nothing marked. */
  | 'abandoned';

export type TuneUpOutcome =
  /** A new plan is stored; `kcal` is its daily target, `reason` the AI's short why. */
  | { readonly kind: 'changed'; readonly kcal: number; readonly reason?: string }
  | { readonly kind: 'unchanged'; readonly why: UnchangedWhy }
  /** The provider gave no usable plan: the plan stays and the week counts as checked. */
  | { readonly kind: 'failed'; readonly failure: AiFailure };

/** What the app's lifecycle reports: the app opened, or the page became visible again. */
export type TuneUpCheck = Extract<TuneUpTrigger, 'open' | 'visible'>;

export interface TurnOffOutcome {
  /** The plan kept from before the first tune-up change was put back. */
  readonly restored: boolean;
}

export interface TuneUpRunner {
  /** Runs when the switch is on, onboarding is done, no run is in flight and a check is due. */
  check(trigger: TuneUpCheck): Promise<TuneUpOutcome>;
  /** The switch went on: clears every lock, then runs whether or not a check is due. */
  turnOn(): Promise<TuneUpOutcome>;
  /** The switch went off: puts the kept plan back (locks stay as they are) and forgets it. */
  turnOff(): Promise<TurnOffOutcome>;
}

const unchanged = (why: UnchangedWhy): TuneUpOutcome => ({ kind: 'unchanged', why });

export function createTuneUpRunner(deps: PlanServiceDeps): TuneUpRunner {
  const { profileRepo, settingsRepo } = deps;
  /** A run is between its decision and its settlement. */
  let running = false;
  let writing: Promise<unknown> = Promise.resolve();

  /**
   * Runs `work` after every earlier write phase, so applying a reply and turning the switch on or
   * off never interleave in this tab.
   */
  function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
    const result = writing.then(work);
    writing = result.catch(() => undefined);
    return result;
  }

  async function readProfile(): Promise<Profile | null> {
    const read = await profileRepo.get();
    return read.kind === 'ok' ? read.value : null;
  }

  async function readNow(): Promise<RunNow> {
    const [state, profile, switches] = await Promise.all([
      readTuneUpState(deps),
      readProfile(),
      readSwitches(deps),
    ]);
    return { state, profile, switches };
  }

  async function attempt(trigger: TuneUpCheck | 'enable'): Promise<TuneUpOutcome> {
    const today = todayOf(deps);
    const [state, profile, done] = await Promise.all([
      readTuneUpState(deps),
      readProfile(),
      settingsRepo.get('onboarding.done'),
    ]);
    // Decided and claimed in one synchronous step, so two triggers never both start a run.
    const decision = decide(state, trigger, { today, ready: done && profile !== null, running });
    if (decision.kind !== 'run' || profile === null) {
      // These triggers only run or skip, and a run needs the profile it was ready with.
      return unchanged(decision.kind === 'skip' ? decision.reason : 'notReady');
    }
    running = true;
    try {
      return await run(profile, today);
    } finally {
      running = false;
    }
  }

  async function run(profile: Profile, today: DayKey): Promise<TuneUpOutcome> {
    const start: RunStart = { profile, switches: await readSwitches(deps) };
    const input = await preparePlanRequest(deps, profile, today);
    if (!stillWanted(start, await readNow())) return unchanged('abandoned');
    const result = await sendPlanRequest(deps, input);

    return oneAtATime(async () => {
      const now = await readNow();
      if (!result.ok) {
        const settlement = settle(start, now, { ok: false }, today);
        if (settlement.kind !== 'failed') return unchanged('abandoned');
        await settingsRepo.set('tuneUp.lastCheckDay', settlement.state.lastCheckDay);
        return { kind: 'failed', failure: result.error };
      }

      const settlement = settle(start, now, { ok: true, targets: result.value }, today);
      if (settlement.kind !== 'applied') {
        return unchanged(settlement.kind === 'dropped' ? 'dropped' : 'abandoned');
      }
      // The plan from before is stored first, so a failed profile write can never lose it.
      const keepsFirst = now.state.savedPlan === null;
      if (keepsFirst) await settingsRepo.set('tuneUp.savedPlan', settlement.state.savedPlan);
      if (!(await replaceIfUnchanged(deps, start.profile, settlement.profile))) {
        if (keepsFirst) await settingsRepo.set('tuneUp.savedPlan', null);
        return unchanged('dropped');
      }
      await settingsRepo.set('tuneUp.lastCheckDay', settlement.state.lastCheckDay);
      // The plan now matches these inputs, as after a rebuild.
      await settingsRepo.set('goals.rebuildBaseline', planInputsKey(settlement.profile));
      return { kind: 'changed', kcal: result.value.kcal, reason: result.value.reason };
    });
  }

  /** Puts the kept plan back onto the stored profile in its transaction; false when none. */
  async function restoreKeptPlan(state: TuneUpState): Promise<boolean> {
    if (state.savedPlan === null) return false;
    let restored = false;
    try {
      await profileRepo.update((current) => {
        const back = switchedOff(state, current).profile;
        restored = back !== null;
        return back ?? current;
      });
    } catch (error) {
      if (!(error instanceof ProfileUnavailableError)) throw error;
    }
    return restored;
  }

  return {
    check: attempt,

    async turnOn() {
      await oneAtATime(async () => {
        const today = todayOf(deps);
        const [state, profile] = await Promise.all([readTuneUpState(deps), readProfile()]);
        const next = switchedOn(state, profile, { today, ready: profile !== null, running });
        // Locks first: the tune-up owns the targets from now on, and the rows read as unlocked.
        if (profile !== null && next.profile !== null) {
          await replaceIfUnchanged(deps, profile, next.profile);
        }
        await settingsRepo.set('tuneUp.on', next.state.on);
      });
      return attempt('enable');
    },

    turnOff() {
      return oneAtATime(async () => {
        const state = await readTuneUpState(deps);
        const restored = await restoreKeptPlan(state);
        const off = switchedOff(state, null).state;
        await settingsRepo.set('tuneUp.on', off.on);
        await settingsRepo.set('tuneUp.savedPlan', off.savedPlan);
        return { restored };
      });
    },
  };
}
