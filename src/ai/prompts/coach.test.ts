import { describe, expect, it } from 'vitest';
import { makeBodyFat, makeProfile, makeWater } from '../../test/factories';
import {
  FIXTURE_FOOD_NAMES,
  at,
  fastFrom,
  fixtureDiary,
  makeSnapshot,
  weighInOn,
} from '../../services/coach/__fixtures__/snapshot';
import { coachContext } from '../../services/coach/context';
import { LATER_TOOL_NAMES, NUTRITION_TOOL_NAMES } from '../../services/coach/toolSchemas';
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
