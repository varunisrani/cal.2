import { describe, expect, it } from 'vitest';
import { GOAL_KINDS } from '../../domain/model';
import { coach } from '../../i18n/en/coach';
import { CARD_CHIPS, chipsFor } from './chips';

const words = coach.coach.chips;

describe('chipsFor (P08-12)', () => {
  it('gives four lose chips: projection, faster loss, intake too high, dinner', () => {
    expect(chipsFor('lose')).toEqual([
      { id: 'lose.projection', text: words.lose.projection },
      { id: 'lose.faster', text: words.lose.faster },
      { id: 'lose.intake', text: words.lose.intake },
      { id: 'lose.dinner', text: words.lose.dinner },
    ]);
  });

  it('gives four gain chips: projection, healthy gain, intake high enough, protein', () => {
    expect(chipsFor('gain')).toEqual([
      { id: 'gain.projection', text: words.gain.projection },
      { id: 'gain.healthy', text: words.gain.healthy },
      { id: 'gain.intake', text: words.gain.intake },
      { id: 'gain.protein', text: words.gain.protein },
    ]);
  });

  it('gives four maintain chips: stable weight, average intake, macros, trend', () => {
    expect(chipsFor('maintain')).toEqual([
      { id: 'maintain.stable', text: words.maintain.stable },
      { id: 'maintain.average', text: words.maintain.average },
      { id: 'maintain.macros', text: words.maintain.macros },
      { id: 'maintain.trend', text: words.maintain.trend },
    ]);
  });

  it('gives no chips without a goal to go by', () => {
    expect(chipsFor(undefined)).toEqual([]);
  });

  it('fills the empty chat exactly for every goal, with distinct questions and no training chip', () => {
    for (const goal of GOAL_KINDS) {
      const chips = chipsFor(goal);
      expect(chips).toHaveLength(CARD_CHIPS);
      expect(new Set(chips.map((chip) => chip.text)).size).toBe(CARD_CHIPS);
      for (const chip of chips) expect(chip.text).not.toMatch(/train|workout|exercise|lift/i);
    }
  });
});
