import { describe, expect, it } from 'vitest';
import { addDays } from '../dates/dayKey';
import type { Profile, SavedTargets, Targets } from '../model';
import { defaultProfile } from '../profile/profile';
import { inTimeZone } from '../../test/time';
import {
  TUNE_UP_EVERY_DAYS,
  decide,
  isDue,
  readTuneUpOn,
  settle,
  stillWanted,
  turnOff,
  turnOn,
  type RunNow,
  type RunStart,
  type TuneUpTrigger,
} from './cadence';

const today = '2026-10-26';
const profile: Profile = {
  ...defaultProfile(today),
  saved: { kcal: 2300, protein: 130 },
};
const plan: Targets = { kcal: 2100, protein: 140, carbs: 230, fat: 60 };

function start(overrides: Partial<RunStart> = {}): RunStart {
  return { today, profile, switches: {}, ...overrides };
}

function now(overrides: Partial<RunNow> = {}): RunNow {
  return { on: true, profile, switches: {}, savedPlan: undefined, ...overrides };
}

describe('readTuneUpOn', () => {
  it('reads an absent or unreadable setting as on', () => {
    expect(readTuneUpOn(undefined)).toBe(true);
    expect(readTuneUpOn(null)).toBe(true);
    expect(readTuneUpOn('false')).toBe(true);
    expect(readTuneUpOn(true)).toBe(true);
    expect(readTuneUpOn(false)).toBe(false);
  });
});

describe('isDue', () => {
  it.each([
    ['never checked → due', undefined, true],
    ['an unparseable day → due', 'last week', true],
    ['an impossible day → due', '2026-02-30', true],
    ['a number instead of a day → due', 20261019, true],
    ['checked today → not due', '2026-10-26', false],
    ['checked 6 days ago → not due', '2026-10-20', false],
    ['checked 7 days ago → due', '2026-10-19', true],
    ['checked 30 days ago → due', '2026-09-26', true],
    ['a check day in the future → not due', '2026-10-28', false],
  ])('%s', (_label, lastCheckDay, due) => {
    expect(isDue(lastCheckDay, today)).toBe(due);
  });

  it('counts calendar days across a DST change and in Asia/Tokyo', () => {
    expect(TUNE_UP_EVERY_DAYS).toBe(7);
    // New York leaves DST on 1 November 2026; the week is still 7 calendar days.
    expect(isDue('2026-10-29', '2026-11-04')).toBe(false);
    expect(isDue('2026-10-29', '2026-11-05')).toBe(true);
    const inTokyo = inTimeZone('Asia/Tokyo', () => [
      isDue('2026-10-20', today),
      isDue('2026-10-19', today),
    ]);
    expect(inTokyo).toEqual([false, true]);
  });
});

describe('decide', () => {
  const cases: Array<[string, boolean, unknown, TuneUpTrigger, ReturnType<typeof decide>]> = [
    [
      'open, never checked',
      true,
      undefined,
      'open',
      { kind: 'run', forced: false, clearLocks: false },
    ],
    [
      'visible, 7 days on',
      true,
      addDays(today, -7),
      'visible',
      { kind: 'run', forced: false, clearLocks: false },
    ],
    ['open, 6 days on', true, addDays(today, -6), 'open', { kind: 'skip', why: 'notDue' }],
    ['open while off', false, undefined, 'open', { kind: 'skip', why: 'off' }],
    ['visible while off', false, addDays(today, -30), 'visible', { kind: 'skip', why: 'off' }],
    [
      'enable when not due (forced)',
      true,
      today,
      'enable',
      { kind: 'run', forced: true, clearLocks: true },
    ],
    [
      'manual rebuild while on',
      true,
      addDays(today, -3),
      'manualRebuildDone',
      { kind: 'markChecked', day: today },
    ],
    [
      'manual rebuild while off',
      false,
      addDays(today, -3),
      'manualRebuildDone',
      { kind: 'skip', why: 'off' },
    ],
    ['onboarding done', true, undefined, 'onboardingDone', { kind: 'markChecked', day: today }],
    [
      'onboarding done with the plan edited (off)',
      false,
      undefined,
      'onboardingDone',
      { kind: 'markChecked', day: today },
    ],
  ];
  it.each(cases)('%s', (_label, on, lastCheckDay, trigger, decision) => {
    expect(decide({ on, lastCheckDay, today }, trigger)).toEqual(decision);
  });
});

describe('stillWanted', () => {
  it('goes on only while the tune-up is on and no switch changed', () => {
    expect(stillWanted(start(), now())).toBe(true);
    expect(stillWanted(start(), now({ on: false }))).toBe(false);
    expect(
      stillWanted(start({ switches: { energy: true } }), now({ switches: { energy: false } })),
    ).toBe(false);
    expect(stillWanted(start({ switches: { energy: true } }), now({ switches: {} }))).toBe(false);
    expect(
      stillWanted(start({ switches: { energy: true } }), now({ switches: { energy: true } })),
    ).toBe(true);
  });
});

describe('settle', () => {
  it('marks today checked after a failure while still on (R01.5)', () => {
    expect(settle(start(), now(), { kind: 'failed' })).toEqual({ kind: 'markChecked', day: today });
  });

  it('marks a failure checked even when the profile changed meanwhile', () => {
    const edited: Profile = { ...profile, weightKg: 69 };
    expect(settle(start(), now({ profile: edited }), { kind: 'failed' })).toEqual({
      kind: 'markChecked',
      day: today,
    });
  });

  it('does not mark a failure after switching off, or after a switch changed', () => {
    expect(settle(start(), now({ on: false }), { kind: 'failed' })).toEqual({ kind: 'abort' });
    expect(
      settle(start({ switches: { energy: false } }), now({ switches: { energy: true } }), {
        kind: 'failed',
      }),
    ).toEqual({ kind: 'abort' });
  });

  it('drops a result when the profile was edited during the call (R01.4)', () => {
    const edits: Array<Profile | undefined> = [
      { ...profile, weightKg: 69.5 },
      { ...profile, saved: { ...profile.saved, fat: 70 } },
      { ...profile, lockedMacros: ['protein'] },
      { ...profile, allergens: ['sesame'] },
      undefined,
    ];
    for (const edited of edits) {
      expect(settle(start(), now({ profile: edited }), { kind: 'planned', plan })).toEqual({
        kind: 'drop',
      });
    }
  });

  it('drops a result that comes back after switching off', () => {
    expect(settle(start(), now({ on: false }), { kind: 'planned', plan })).toEqual({
      kind: 'abort',
    });
  });

  it('applies a plan with all locks cleared, saves the old plan on the first success and marks today', () => {
    const locked: Profile = { ...profile, caloriesLocked: true, lockedMacros: ['fat'] };
    const result = settle(start({ profile: locked }), now({ profile: locked }), {
      kind: 'planned',
      plan,
    });
    expect(result).toEqual({
      kind: 'apply',
      profile: { ...locked, saved: plan, caloriesLocked: false, lockedMacros: [] },
      savedPlan: { kcal: 2300, protein: 130 },
      lastCheckDay: today,
    });
  });

  it('keeps the first snapshot on a second success (R01.14)', () => {
    const first = settle(start(), now(), { kind: 'planned', plan });
    if (first.kind !== 'apply') throw new Error('first run did not apply');
    const later = addDays(today, 7);
    const nextPlan: Targets = { kcal: 2000, protein: 140, carbs: 205, fat: 60 };
    const second = settle(
      start({ today: later, profile: first.profile }),
      now({ profile: first.profile, savedPlan: first.savedPlan }),
      { kind: 'planned', plan: nextPlan },
    );
    expect(second).toMatchObject({
      kind: 'apply',
      savedPlan: { kcal: 2300, protein: 130 },
      lastCheckDay: later,
    });
    if (second.kind === 'apply') expect(second.profile.saved).toEqual(nextPlan);
  });

  it('marks the day the run started, not a later one', () => {
    const result = settle(start({ today: '2026-10-25' }), now(), { kind: 'failed' });
    expect(result).toEqual({ kind: 'markChecked', day: '2026-10-25' });
  });
});

describe('turnOn and turnOff', () => {
  it('clears every lock when switching on', () => {
    const locked: Profile = { ...profile, caloriesLocked: true, lockedMacros: ['protein', 'fat'] };
    expect(turnOn(locked)).toEqual({ ...locked, caloriesLocked: false, lockedMacros: [] });
  });

  it('restores the stored plan when switching off and deletes it (R01.14)', () => {
    const tuned: Profile = { ...profile, saved: plan };
    const stored: SavedTargets = { kcal: 2300, protein: 130 };
    expect(turnOff(tuned, stored)).toEqual({
      profile: { ...tuned, saved: { kcal: 2300, protein: 130 } },
      savedPlan: undefined,
    });
  });

  it('changes nothing when switching off with no stored plan', () => {
    const tuned: Profile = { ...profile, saved: plan };
    expect(turnOff(tuned, undefined)).toEqual({ profile: tuned, savedPlan: undefined });
  });

  it('gives back the original plan after two tune-ups and a switch-off', () => {
    const first = settle(start(), now(), { kind: 'planned', plan });
    if (first.kind !== 'apply') throw new Error('first run did not apply');
    const second = settle(
      start({ profile: first.profile }),
      now({ profile: first.profile, savedPlan: first.savedPlan }),
      { kind: 'planned', plan: { kcal: 1900, protein: 140, carbs: 180, fat: 60 } },
    );
    if (second.kind !== 'apply') throw new Error('second run did not apply');
    expect(turnOff(second.profile, second.savedPlan).profile.saved).toEqual(profile.saved);
  });
});
