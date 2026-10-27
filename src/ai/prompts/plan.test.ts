import { describe, expect, it } from 'vitest';
import {
  FIXTURE_TODAY,
  defaultProfile,
  katchProfile,
  lose100Profile,
  profileWith,
} from '../../domain/goals/__fixtures__/profiles';
import { SECRETS, evidenceProfile, secretEvidence } from './__fixtures__/evidence';
import { EVIDENCE_PRIVACY_LINE, evidenceText } from './evidenceText';
import { PLAN_REPLY_KEYS, planPrompt, type PlanPromptInput } from './plan';
import type { DisplayUnits } from './shared';

const today = FIXTURE_TODAY;
const METRIC: DisplayUnits = { energy: 'kcal', weight: 'kg', height: 'cm' };
const FEET_INCHES_KJ: DisplayUnits = { energy: 'kJ', weight: 'kg', height: 'ftIn' };

function promptFor(changes: Partial<PlanPromptInput> = {}): string {
  return planPrompt({ profile: defaultProfile, today, units: METRIC, ...changes }).prompt;
}

describe('planPrompt: the formula set and its constants', () => {
  it('gives every activity level with its multiplier and protein rate, moderate at 1.465', () => {
    const prompt = promptFor();
    const table: [string, number, string][] = [
      ['sedentary', 1.2, '0.8'],
      ['light', 1.375, '1.2'],
      ['moderate', 1.465, '1.6'],
      ['active', 1.55, '1.8'],
      ['hard', 1.725, '2.0'],
      ['athlete', 1.9, '2.2'],
    ];
    for (const [level, multiplier, protein] of table) {
      expect(prompt).toContain(`- ${level}: daily burn × ${multiplier}; protein ${protein} g/kg\n`);
    }
  });

  it('gives protein per kg of full body weight and the extra 0.2 while losing', () => {
    const prompt = promptFor();
    expect(prompt).toContain('in g per kg of full body weight, plus 0.2 g/kg while losing');
  });

  it('gives 7700 kcal per kg, the pace change, 0.6 g/kg fat, carbs as the rest and 4/4/9', () => {
    const prompt = promptFor();
    expect(prompt).toContain('7700 kcal per kg of body weight');
    expect(prompt).toContain('pace × 7700 ÷ 7');
    expect(prompt).toContain('Without a set pace it is 0.5 kg a week');
    expect(prompt).toContain('Fat: 0.6 g per kg of body weight');
    expect(prompt).toContain('Carbs: the energy left after protein and fat');
    expect(prompt).toContain('protein 4 kcal, carbs 4 kcal, fat 9 kcal');
  });

  it('gives both resting-burn equations', () => {
    const prompt = promptFor();
    expect(prompt).toContain(
      '370 + 21.6 × kg × lean share, where lean share = 1 − the body fat fraction',
    );
    expect(prompt).toContain('10 × kg + 6.25 × cm − 5 × age in years − 161, and men add 166');
  });

  it('names the equation that applies to this person', () => {
    expect(promptFor()).toContain('the Mifflin-St Jeor equation applies: no body fat is set');
    expect(promptFor({ profile: katchProfile })).toContain(
      'the Katch-McArdle equation applies: their body fat is known',
    );
  });
});

describe('planPrompt: the rules', () => {
  it('keeps kcal within 800–6000, the 4/4/9 sum close, and protein near the formula', () => {
    const prompt = promptFor();
    expect(prompt).toContain('kcal between 800 and 6000.');
    expect(prompt).toContain('4 × protein + 4 × carbs + 9 × fat close to kcal.');
    expect(prompt).toContain('within about 15 % either way, leaning higher in a deficit');
    expect(prompt).toContain('Never lower it to fit a small kcal target');
    expect(prompt).toContain('never read the rates above as lean-mass rates');
  });

  it('asks for the four whole numbers and a why under 100 characters, nothing else', () => {
    const { system, prompt } = planPrompt({ profile: defaultProfile, today, units: METRIC });
    for (const key of Object.values(PLAN_REPLY_KEYS)) expect(prompt).toContain(`"${key}"`);
    expect(prompt).toContain('as whole numbers');
    expect(prompt).toContain('under 100 characters');
    expect(prompt).toContain('No other keys and nothing around the object.');
    expect(system).toContain('plan calculator');
    expect(system).toContain('one JSON object only');
  });

  it('names the trust order: measured energy, then own data, then the formula', () => {
    expect(promptFor()).toContain(
      "a measured energy figure (none comes with this request), an estimate from the person's own data",
    );
  });
});

describe('planPrompt: the profile, reference values and current targets', () => {
  it('gives the formula reference values of the default profile', () => {
    const prompt = promptFor();
    expect(prompt).toContain('BMR 1673.8 kcal, daily burn 2452 kcal');
    expect(prompt).toContain('Formula plan: 2452 kcal, protein 112 g, carbs 406 g, fat 42 g');
  });

  it('gives the reference values of a body-fat profile from the lean-mass equation', () => {
    const prompt = promptFor({ profile: katchProfile });
    expect(prompt).toContain('BMR 1752.4 kcal, daily burn 2102.9 kcal');
    expect(prompt).toContain('Formula plan: 2102 kcal');
  });

  it('keeps protein a full-body-weight rate: 100 kg, 30 % fat, losing → 180 g', () => {
    expect(promptFor({ profile: lose100Profile })).toContain('protein 180 g');
  });

  it('gives the current targets, saved values pinned and the rest derived', () => {
    const profile = profileWith({ saved: { kcal: 2000, protein: 150 } });
    expect(promptFor({ profile })).toContain(
      'Their current targets: 2000 kcal, protein 150 g, carbs 283 g, fat 29 g.',
    );
  });

  it("gives the profile in metric plus the person's own units", () => {
    const profile = profileWith({ goal: 'lose', weeklyKg: 1, goalWeightKg: 64.5, bodyFat: 0.18 });
    const prompt = promptFor({ profile, units: FEET_INCHES_KJ });
    expect(prompt).toContain('- Weight: 70.0 kg\n');
    expect(prompt).toContain('- Height: 175.0 cm (they read 5 ft 9 in)');
    expect(prompt).toContain('- Body fat: 18.0 % (fraction 0.18)');
    expect(prompt).toContain('- Weekly pace: 1 kg a week\n');
    expect(prompt).toContain('- Goal weight: 64.5 kg');
    expect(prompt).not.toMatch(/\blb\b|pound/);
    expect(promptFor()).not.toContain('they read');
  });

  it('marks the pace as not set for maintain', () => {
    expect(promptFor()).toContain('- Weekly pace: not set (keeping weight)');
  });
});

describe('planPrompt: the evidence', () => {
  it('gives the own-data rules and the evidence text when there is a pack', () => {
    const evidence = secretEvidence();
    const prompt = promptFor({ profile: evidenceProfile, evidence });
    expect(prompt).toContain('one of the 14, 28 or 90-day periods');
    expect(prompt).toContain('the confidence is medium or high;');
    expect(prompt).toContain("at least half of that period's days are full;");
    expect(prompt).toContain('two or more weigh-ins at least 14 days apart;');
    expect(prompt).toContain('the weight trend is believable.');
    expect(prompt).toContain('spread over the actual days between the first and last weigh-in');
    expect(prompt).toContain('never take a missing or partial day as low intake');
    expect(prompt).toContain(evidenceText(evidence));
  });

  it('uses the formula daily burn and no data rules without a pack', () => {
    const prompt = promptFor();
    expect(prompt).toContain(
      'No logging data comes with this request, so use the formula daily burn.',
    );
    expect(prompt).not.toContain('medium or high');
    expect(prompt).not.toContain(EVIDENCE_PRIVACY_LINE);
  });

  it('holds no food name, note or ingredient of the logged entries (ACC-C9-1)', () => {
    const { system, prompt } = planPrompt({
      profile: evidenceProfile,
      today,
      units: FEET_INCHES_KJ,
      evidence: secretEvidence(),
    });
    expect(prompt).toContain('2026-10-25 full, 2 logs: 1900 kcal');
    for (const secret of SECRETS) {
      expect(prompt).not.toContain(secret);
      expect(system).not.toContain(secret);
    }
  });
});

describe('planPrompt: energy unit', () => {
  it('adds the kJ line only for kJ readers, keeping the reply fields in kcal', () => {
    const kj = promptFor({ units: FEET_INCHES_KJ });
    expect(kj).toContain('The person reads energy in kilojoules');
    expect(kj).toContain('Number fields of the reply stay in kcal');
    expect(promptFor()).not.toContain('kilojoules');
    expect(promptFor({ units: { ...FEET_INCHES_KJ, energy: 'kcal' } })).not.toContain('kilojoules');
  });
});
