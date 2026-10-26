// Weigh-ins, and the profile weight that follows the latest one (R05.8).
//
// The profile's weight feeds the energy formulas, so it must always be the latest weigh-in by
// date. Each add and delete therefore changes the weigh-in and the profile in one transaction. An
// add is also where the goal check happens (R01.11): every caller (Progress, the Settings weight
// edit, the Coach) adds through `addWeighIn`, the domain decides whether this new latest reading
// passes the goal weight, and the announcement goes on the app bus once the change has committed.

import { addDays, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import type { Profile, WeighIn } from '../../domain/model';
import { latestByTime, reachesGoalOnAdd } from '../../domain/trackers/goalCrossing';
import { WEIGHT_LIMITS } from '../../domain/units/body';
import { newId, type IdSource } from '../../lib/ids';
import { appBus, type AppBus } from '../bus';
import { decodeProfile, decodeWeighIn } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { guardKey, readAll, readOne, type GuardOptions, type ReadOptions } from '../guard';
import { live, type LiveFeed } from '../live';
import type { TableName } from '../schema';

/** The profile weight is rewritten only when the latest weigh-in differs by more than this. */
export const PROFILE_WEIGHT_TOLERANCE_KG = 0.01;

const PROFILE_ID = 'me';
const TABLES: readonly TableName[] = ['weighIns', 'profile'];

export interface WeighInInput {
  /** When the weight was taken (epoch ms). */
  at: number;
  kg: number;
}

export interface AddWeighInResult {
  entry: WeighIn;
  /** True when this new latest reading passed the goal weight; `goal-reached` was posted. */
  goalReached: boolean;
}

export interface WeightRepoOptions extends GuardOptions {
  ids?: IdSource;
  /** Where `goal-reached` goes; the app's bus by default. */
  bus?: AppBus;
}

export interface WeightRepo {
  /**
   * Stores a weigh-in, moves the profile weight to the latest weigh-in and checks the goal, in
   * one transaction. Throws a RangeError, before writing anything, for a weight outside 20–250 kg
   * or a time that is not an instant.
   */
  addWeighIn(input: WeighInInput): Promise<AddWeighInResult>;
  /** Deletes a weigh-in; the profile follows the new latest, if any is left. */
  deleteWeighIn(id: string): Promise<boolean>;
  /** Adds the first weigh-in (from onboarding) unless the history has rows already. */
  seedFirst(kg: number, at: number): Promise<WeighIn | null>;
  /** Weigh-ins on the local days `firstKey`…`lastKey`, oldest first (charts, net change). */
  between(firstKey: DayKey, lastKey: DayKey): Promise<WeighIn[]>;
  /** Every weigh-in, newest first (the history sheet). */
  history(): Promise<WeighIn[]>;
  /** The latest weigh-in by time, whatever the window. */
  latest(): Promise<WeighIn | undefined>;
  liveBetween(firstKey: DayKey, lastKey: DayKey): LiveFeed<WeighIn[]>;
  liveHistory(): LiveFeed<WeighIn[]>;
  liveLatest(): LiveFeed<WeighIn | undefined>;
}

/** A weigh-in to store, or a RangeError for values the wheels could never give. */
function checkedWeighIn(id: string, { at, kg }: WeighInInput): WeighIn {
  const { min, max } = WEIGHT_LIMITS.kg;
  if (!(kg >= min && kg <= max)) {
    throw new RangeError(`A weigh-in must be ${min}–${max} kg, not ${kg}`);
  }
  const entry: WeighIn = { id, at, kg };
  if (decodeWeighIn(entry) === null) throw new RangeError(`Not a time for a weigh-in: ${at}`);
  return entry;
}

export function createWeightRepo(db: PlatewiseDb, options: WeightRepoOptions = {}): WeightRepo {
  const ids = options.ids ?? newId;
  const bus = (): AppBus => options.bus ?? appBus();

  const readSome = async (select: ReadOptions['select']): Promise<WeighIn[]> =>
    (await readAll(db, 'weighIns', decodeWeighIn, { ...options, select })).items;

  const history = (): Promise<WeighIn[]> =>
    readSome((table) => table.orderBy('at').reverse().toArray());

  const between = (firstKey: DayKey, lastKey: DayKey): Promise<WeighIn[]> => {
    // Half-open on instants, so a weigh-in late on the last day is inside (R05.5).
    const from = startOfDay(firstKey);
    const to = startOfDay(addDays(lastKey, 1));
    return readSome((table) => table.where('at').between(from, to, true, false).toArray());
  };

  const latest = async (): Promise<WeighIn | undefined> => (await history())[0];

  /** Moves the profile weight to `newest` when it is off by more than the tolerance. */
  const follow = async (profile: Profile, newest: WeighIn | undefined): Promise<void> => {
    if (newest === undefined) return;
    if (Math.abs(profile.weightKg - newest.kg) <= PROFILE_WEIGHT_TOLERANCE_KG) return;
    // Only the one field, so whatever else the stored row holds stays as it is.
    await db.profile.update(PROFILE_ID, { weightKg: newest.kg });
  };

  /** The add itself; runs inside a transaction over `weighIns` and `profile`. */
  const addInTx = async (entry: WeighIn): Promise<boolean> => {
    const { items } = await readAll(db, 'weighIns', decodeWeighIn, options);
    // Missing (before onboarding) or unreadable (kept aside by the guard): no sync, no goal.
    const profile = await readOne(db, 'profile', PROFILE_ID, decodeProfile, options);
    await db.weighIns.add(entry);
    if (profile.kind !== 'ok') return false;
    await follow(profile.value, latestByTime([...items, entry]));
    return reachesGoalOnAdd(items, entry, profile.value);
  };

  const addWeighIn = async (input: WeighInInput): Promise<AddWeighInResult> => {
    const entry = checkedWeighIn(ids(), input);
    // An async body: Dexie keeps a transaction open across native awaits only inside one (a plain
    // arrow returning the helper's promise ends in PrematureCommitError).
    const goalReached = await transact(db, 'rw', TABLES, async () => await addInTx(entry));
    // After the commit, so a rolled-back add never announces anything.
    if (goalReached) bus().post({ type: 'goal-reached', weighInId: entry.id, kg: entry.kg });
    return { entry, goalReached };
  };

  return {
    addWeighIn,

    deleteWeighIn: (id) =>
      transact(db, 'rw', TABLES, async () => {
        if ((await db.weighIns.get(id)) === undefined) return false;
        await guardKey(db, 'weighIns', id, decodeWeighIn, options);
        await db.weighIns.delete(id);
        const profile = await readOne(db, 'profile', PROFILE_ID, decodeProfile, options);
        if (profile.kind === 'ok') {
          const { items } = await readAll(db, 'weighIns', decodeWeighIn, options);
          // Nothing left: the profile keeps its weight (the formulas still need one).
          await follow(profile.value, latestByTime(items));
        }
        return true;
      }),

    async seedFirst(kg, at) {
      const entry = checkedWeighIn(ids(), { at, kg });
      return transact(db, 'rw', TABLES, async () => {
        // Unreadable rows count too: they are history, only not readable now.
        if ((await db.weighIns.count()) > 0) return null;
        await addInTx(entry);
        return entry;
      });
    },

    between,
    history,
    latest,
    liveBetween: (firstKey, lastKey) => live(() => between(firstKey, lastKey)),
    liveHistory: () => live(history),
    liveLatest: () => live(latest),
  };
}
