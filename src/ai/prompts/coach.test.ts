import { describe, expect, it } from 'vitest';
import { makeBodyFat, makeProfile, makeWater } from '../../test/factories';
import {
  FIXTURE_FOOD_NAMES,
  SNAPSHOT_TODAY,
  activityOn,
  at,
  connectedActivity,
  fastFrom,
  fixtureDiary,
  makeSnapshot,
  weighInOn,
  workoutOn,
} from '../../services/coach/__fixtures__/snapshot';
import { coachContext } from '../../services/coach/context';
import {
  ACTIVITY_MAX_DAYS,
  LATER_TOOL_NAMES,
  NUTRITION_TOOL_NAMES,
  REMINDER_TOOL_NAME,
  coachTools,
} from '../../services/coach/toolSchemas';
import { coachSystemPrompt } from './coach';

/** The whole system text for a snapshot with every kind of data in it. */
function fullPrompt(notes?: string): string {
  const snapshot = makeSnapshot({
    profile: makeProfile({ bodyFat: 0.26 }),
    entries: fixtureDiary(),
    weighIns: [weighInOn('2026-10-19', 64.6), weighInOn('2026-10-25', 64)],
    bodyFat: [makeBodyFat({ at: at('2026-10-22') })],
    fasts: [fastFrom(at('2026-10-24', '20:00'), at('2026-10-25', '12:00'))],
    water: { on: true, goalMl: 2000, unit: 'ml', logs: [makeWater()] },
  });
  return coachSystemPrompt({ context: coachContext(snapshot), notes });
}

const CONTEXT = 'Today is Monday 2026-10-26.\n- Weight: 64.0 kg';

describe('coachSystemPrompt: who the Coach is', () => {
  it('is a coach for food, energy balance and body-weight goals in a food diary', () => {
    const text = coachSystemPrompt({ context: CONTEXT });
    expect(text).toMatch(/^You are the Coach in Platewise, a food diary app\./);
    expect(text).toContain('what they eat, their energy balance and their body-weight goal');
  });

  it('grounds answers in their numbers and gives no medical advice, pointing to a clinician', () => {
    const text = coachSystemPrompt({ context: CONTEXT });
    expect(text).toContain('Build every answer on their own numbers');
    expect(text).toContain('you give no medical advice');
    expect(text).toContain('suggest they talk to a doctor or a registered dietitian');
  });

  it('keeps answers to 2 to 5 sentences unless asked for more', () => {
    expect(coachSystemPrompt({ context: CONTEXT })).toContain(
      'Answer in 2 to 5 sentences unless they ask for more detail.',
    );
  });

  it("replies in the language of the person's message (D-16.28)", () => {
    const text = coachSystemPrompt({ context: CONTEXT });
    expect(text).toContain("Reply in the language of the person's latest message.");
    expect(text).not.toMatch(/\bEnglish\b/);
  });

  it('never claims to have logged or changed anything', () => {
    expect(coachSystemPrompt({ context: CONTEXT })).toContain(
      'You cannot log, change or delete anything, so never say that you did.',
    );
  });

  it('says photos from earlier messages are not sent again and cannot be seen (R04.2)', () => {
    const text = coachSystemPrompt({ context: CONTEXT });
    expect(text).toContain('Only a photo attached to their newest message reaches you.');
    expect(text).toContain(
      'Photos from earlier messages are not sent again and you cannot see them now',
    );
  });
});

describe('coachSystemPrompt: the facts and the tools', () => {
  it('carries the context block whole, after the role and before the tool rules', () => {
    const text = coachSystemPrompt({ context: CONTEXT });
    expect(text).toContain(`What you know about them, as of this message:\n${CONTEXT}`);
    expect(text.indexOf(CONTEXT)).toBeGreaterThan(text.indexOf('You are the Coach'));
    expect(text.indexOf(CONTEXT)).toBeLessThan(text.indexOf('Using the data tools:'));
  });

  it('answers from the facts first and calls tools only for data they lack (R04.19)', () => {
    const text = coachSystemPrompt({ context: CONTEXT });
    expect(text).toContain('Answer from the facts above whenever they are enough.');
    expect(text).toContain('Call a tool only for data they do not hold');
  });

  it('asks for every needed tool in the same round (R04.19)', () => {
    expect(coachSystemPrompt({ context: CONTEXT })).toContain(
      'ask for all of them together in the same round rather than one after another',
    );
  });

  it('names exactly the six nutrition tools of the schemas, and no later one (R04.20)', () => {
    const text = fullPrompt();
    const named = new Set(text.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g));
    expect([...named].sort()).toEqual([...NUTRITION_TOOL_NAMES].sort());
    for (const later of LATER_TOOL_NAMES) expect(text).not.toContain(later);
  });

  it('holds no workout words (R04.20)', () => {
    expect(fullPrompt()).not.toMatch(/workout|exercise|training|gym|lift|strength/i);
  });

  it('never holds a food name or note from the diary', () => {
    const text = fullPrompt();
    for (const name of FIXTURE_FOOD_NAMES) expect(text).not.toContain(name);
    expect(text).not.toContain('Second helping');
  });
});

describe('coachSystemPrompt: answer shapes', () => {
  it('asks for a daily calorie number and a concrete change on how-to questions', () => {
    expect(coachSystemPrompt({ context: CONTEXT })).toContain(
      'Asked how to lose or gain weight: give one specific daily calorie number and at least one concrete change',
    );
  });

  it('asks projection answers to quote the forecast', () => {
    expect(coachSystemPrompt({ context: CONTEXT })).toContain(
      'quote the weight forecast figures above, or say that the forecast needs more data first',
    );
  });
});

describe('coachSystemPrompt: the notes for the AI (D-16.24)', () => {
  it('puts the notes last', () => {
    const text = fullPrompt('I am vegetarian.\nNo pork.');
    expect(text.endsWith('I am vegetarian.\nNo pork.')).toBe(true);
    expect(text.indexOf('No pork.')).toBeGreaterThan(text.indexOf('Shaping answers:'));
  });

  it('adds nothing for blank or missing notes', () => {
    const bare = coachSystemPrompt({ context: CONTEXT });
    expect(coachSystemPrompt({ context: CONTEXT, notes: '  \n ' })).toBe(bare);
    expect(bare.trimEnd().endsWith('or say that the forecast needs more data first.')).toBe(true);
  });
});

describe('coachSystemPrompt: Health Connect activity (D-16.94)', () => {
  /** The system text of an Android turn with Health Connect connected. */
  function activityPrompt(notes?: string): string {
    const snapshot = makeSnapshot({
      entries: fixtureDiary(),
      activity: connectedActivity([
        activityOn(SNAPSHOT_TODAY, {
          steps: 8412,
          activeKcal: 420,
          sessions: [workoutOn(SNAPSHOT_TODAY, '07:10', 35)],
        }),
      ]),
    });
    return coachSystemPrompt({ context: coachContext(snapshot), notes, activity: true });
  }

  it('says what the activity data is and where it comes from', () => {
    const text = activityPrompt();
    expect(text).toContain('Activity from Health Connect:');
    expect(text).toContain(
      'the steps, active calories, total calories burned, distance and workouts that their phone, watch and fitness apps recorded',
    );
  });

  it('says active calories are already in the target while counting is on, so never twice', () => {
    const text = activityPrompt();
    expect(text).toContain(
      'When "Count active calories" is on, the energy target in the facts already includes today\'s active calories, and so does what is left of it.',
    );
    expect(text).toContain('Never add them a second time.');
    expect(text).toContain(
      "On any day it is on, that day's target is the goal plus that day's active calories.",
    );
    expect(text).toContain('When it is off, the target is the goal alone.');
  });

  it('says total calories include resting burn and are no extra food', () => {
    const text = activityPrompt();
    expect(text).toContain(
      'Active calories are the energy burned by moving, on top of resting burn.',
    );
    expect(text).toContain("Total calories burned are the whole day's burn, resting burn included");
    expect(text).toContain('never extra food to eat back');
  });

  it('points questions on steps, workouts, burn and trends to activity_log', () => {
    const text = activityPrompt();
    expect(text).toContain(
      'For questions about steps, workouts, calories burned or how active they have been over time, call activity_log',
    );
    expect(text).toContain(`up to ${ACTIVITY_MAX_DAYS} days per call`);
    const named = new Set(text.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g));
    expect([...named].sort()).toEqual(
      coachTools(true)
        .map((tool) => tool.name)
        .sort(),
    );
  });

  it('keeps every other rule and puts the notes last', () => {
    const text = activityPrompt('No running advice, please.');
    expect(text).toContain('you give no medical advice');
    expect(text).toContain('suggest they talk to a doctor or a registered dietitian');
    expect(text).toContain('Answer in 2 to 5 sentences unless they ask for more detail.');
    expect(text).toContain('You cannot log, change or delete anything');
    expect(text.indexOf('Activity from Health Connect:')).toBeGreaterThan(
      text.indexOf('Using the data tools:'),
    );
    expect(text.indexOf('Activity from Health Connect:')).toBeLessThan(
      text.indexOf('Shaping answers:'),
    );
    expect(text.endsWith('No running advice, please.')).toBe(true);
  });

  it('adds none of it without activity, as on the web', () => {
    for (const text of [
      coachSystemPrompt({ context: CONTEXT }),
      coachSystemPrompt({ context: CONTEXT, activity: false }),
    ]) {
      expect(text).not.toMatch(/Health Connect|activity_log|Count active calories|resting burn/);
    }
  });
});

describe('coachSystemPrompt: reminders (P13, D-16.93)', () => {
  const withReminders = (activity = false) =>
    coachSystemPrompt({ context: CONTEXT, reminders: true, activity });

  it('says to use propose_reminder when the person asks to be reminded', () => {
    const text = withReminders();
    expect(text).toContain('Reminders:');
    expect(text).toContain(
      `When they ask to be reminded of something, call ${REMINDER_TOOL_NAME} with what it should say, the time, and the days or the date.`,
    );
    expect(text).toContain('it puts a card with Add and Dismiss under your reply');
  });

  it('never lets the model say a reminder is set before the person taps Add', () => {
    const text = withReminders();
    expect(text).toContain('the reminder is set only when they tap Add');
    expect(text).toContain('Never say that a reminder is set, saved or scheduled.');
    expect(text).toContain('Say that you have proposed it and that they can tap Add');
  });

  it('asks for a missing or unclear time or day instead of guessing', () => {
    const text = withReminders();
    expect(text).toContain(
      'When the time, or the days or the date, are missing or unclear, ask them instead of guessing.',
    );
    expect(text).toContain(
      'Work out a date or a time from today and the time now in the facts above.',
    );
    expect(text).toContain('When the tool reports a problem, say what it is in plain words');
  });

  it('names exactly the tools offered with it, and sits before the answer shapes, notes last', () => {
    for (const activity of [false, true]) {
      const text = coachSystemPrompt({
        context: CONTEXT,
        reminders: true,
        activity,
        notes: 'Keep it short.',
      });
      const named = new Set(text.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g));
      expect([...named].sort()).toEqual(
        coachTools(activity, true)
          .map((tool) => tool.name)
          .sort(),
      );
      expect(text.indexOf('Reminders:')).toBeGreaterThan(text.indexOf('Using the data tools:'));
      expect(text.indexOf('Reminders:')).toBeLessThan(text.indexOf('Shaping answers:'));
      expect(text.endsWith('Keep it short.')).toBe(true);
    }
  });

  it('adds none of it without reminders', () => {
    for (const text of [
      coachSystemPrompt({ context: CONTEXT }),
      coachSystemPrompt({ context: CONTEXT, reminders: false }),
    ]) {
      expect(text).not.toMatch(/propose_reminder|Reminders:|tap Add/);
    }
  });
});
