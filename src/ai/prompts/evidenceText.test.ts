import { describe, expect, it } from 'vitest';
import { addDays, startOfDay } from '../../domain/dates/dayKey';
import { buildEvidence } from '../../domain/forecast/evidence';
import { FIXTURE_TODAY } from '../../domain/goals/__fixtures__/profiles';
import { makeEntry } from '../../test/factories';
import { SECRETS, evidenceProfile, secretEvidence } from './__fixtures__/evidence';
import { EVIDENCE_PRIVACY_LINE, evidenceText } from './evidenceText';

const today = FIXTURE_TODAY;
const HOUR = 3_600_000;

describe('evidenceText: privacy (R01.16, ACC-C9-1)', () => {
  it('never contains a food name, note, ingredient, product text, photo or id of the fixture', () => {
    const text = evidenceText(secretEvidence());
    expect(text).toContain('1900 kcal'); // the fixture's days are there, as numbers
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/ragù|granola|paprika|churros|dentist/i);
  });

  it('states what the evidence holds and never holds', () => {
    const text = evidenceText(secretEvidence());
    expect(text).toContain(EVIDENCE_PRIVACY_LINE);
    expect(EVIDENCE_PRIVACY_LINE).toContain('numbers and dates');
    expect(EVIDENCE_PRIVACY_LINE).toContain('notes, ingredients, meal descriptions or photos');
  });
});

describe('evidenceText: coverage labels', () => {
  it('explains how a day is judged and that a day with nothing logged is unknown, not zero', () => {
    const text = evidenceText(secretEvidence());
    expect(text).toContain('against the 2000 kcal goal: "full" from 85 % of it, or from 65 %');
    expect(text).toContain(
      '"none" when nothing was logged, which means intake is unknown, not zero',
    );
    expect(text).toContain('Never read a partial or none day as a day of low eating.');
  });

  it('labels every logged day full or partial, and never lists a day with nothing logged', () => {
    const text = evidenceText(secretEvidence());
    expect(text).toContain(
      '- 2026-10-25 full, 2 logs: 1900 kcal, P 95, C 237.5, F 47.5, fibre 6 (1 of 2)',
    );
    expect(text).toContain(
      '- 2026-10-21 partial, 1 log: 900 kcal, P 45, C 112.5, F 22.5, fibre 6 (1 of 1)',
    );
    expect(text).not.toContain('2026-10-19'); // seven days back: nothing logged
    expect(text).not.toContain(today);
  });

  it('counts full, partial and none days with the coverage of each period', () => {
    const text = evidenceText(secretEvidence());
    expect(text).toContain('Last 28 days: 19 full, 5 partial, 4 none (coverage 67 %), 43 logs');
    expect(text).toContain('average 1692 kcal on logged days and 1900 kcal on full days');
    expect(text).toContain('Last 90 days: 20 full, 6 partial, 64 none (coverage 22 %)');
  });
});

describe('evidenceText: the window, confidence and signals', () => {
  it('names the finished days and says today is left out', () => {
    const text = evidenceText(secretEvidence());
    expect(text).toContain('finished days 2026-07-28 to 2026-10-25');
    expect(text).toContain('Today is left out');
  });

  it('gives the confidence level, score and the counts behind it', () => {
    const text = evidenceText(secretEvidence());
    expect(text).toContain('Confidence: medium, 55 of 100 (food logging 37 of 55, weigh-ins 18');
    expect(text).toContain('- 19 full days in the latest 28');
    expect(text).toContain('- 6 weigh-in days spanning 25 days');
  });

  it('gives weigh-ins, weight change and body fat by period and by day', () => {
    const text = evidenceText(secretEvidence());
    expect(text).toContain('Last 7 days: 1 weigh-in, change unknown; 1 body-fat reading');
    expect(text).toContain('Last 90 days: 6 weigh-ins, change -1.5 kg over 25 days');
    expect(text).toContain('2026-09-26 72, 2026-10-01 71.7');
    expect(text).toContain('Body fat (%, the last of each day): 2026-10-23 21.4');
  });
});

describe('evidenceText: little or much data', () => {
  it('writes unknown and none where the pack has nothing, never 0 intake', () => {
    const pack = buildEvidence({
      profile: evidenceProfile,
      entries: [],
      weighIns: [],
      bodyFat: [],
      today,
    });
    const text = evidenceText(pack);
    expect(text).toContain('Confidence: low, 0 of 100');
    expect(text).toContain(
      'Last 7 days: 0 full, 0 partial, 7 none (coverage 0 %), 0 logs; average unknown',
    );
    expect(text).toContain('protein unknown, carbs unknown, fat unknown');
    expect(text).toContain('Weigh-ins (kg): none');
    expect(text).toContain('Body fat (%): none');
    expect(text).toContain('Logged days: none');
    expect(text).not.toContain(' 0 kcal');
  });

  it('says how many older weigh-in days and logged days were left out', () => {
    const entries = Array.from({ length: 50 }, (_, index) => {
      const day = addDays(today, -1 - index);
      return makeEntry({ loggedAt: startOfDay(day) + 12 * HOUR, dayKey: day, kcal: 1800 });
    });
    const weighIns = Array.from({ length: 35 }, (_, index) => ({
      id: `w-${index}`,
      at: startOfDay(addDays(today, -1 - index)) + 7 * HOUR,
      kg: 80 - index / 10,
    }));
    const text = evidenceText(
      buildEvidence({ profile: evidenceProfile, entries, weighIns, bodyFat: [], today }),
    );
    expect(text).toContain('Weigh-ins (kg, the last of each day) (5 older days left out):');
    expect(text).toContain('Logged days, oldest first (5 older logged days left out).');
    expect(text.match(/^- \d{4}-\d{2}-\d{2} (full|partial),/gm)).toHaveLength(45);
  });
});
