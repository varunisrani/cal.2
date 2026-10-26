// Evidence for the plan and evidence-text tests: a month of logging and weigh-ins whose entries
// carry names, notes, ingredients, product details and photo ids that must never reach a prompt.

import { addDays, startOfDay, type DayKey } from '../../../domain/dates/dayKey';
import { buildEvidence, type EvidencePack } from '../../../domain/forecast/evidence';
import { FIXTURE_TODAY, profileWith } from '../../../domain/goals/__fixtures__/profiles';
import type { DiaryEntry, Profile, WeighIn } from '../../../domain/model';
import { makeEntry, makeLine, makeProduct } from '../../../test/factories';

const HOUR = 3_600_000;

/** The person the fixture logs for: effective kcal 2 000, so a full single-log day is 1 700+. */
export const evidenceProfile: Profile = profileWith({ saved: { kcal: 2000 } });

/** Every text the fixture's entries carry; none of it may appear in a prompt. */
export const SECRETS = [
  'Nonna Pia ragù',
  'after the dentist',
  'Smoked paprika butter',
  'Sunrise Mills',
  'oat flakes, malt extract',
  'peanut-trace-note',
  'photo-id-4711',
  'entry-id-secret',
  'Midnight churros',
] as const;

function at(day: DayKey, hours = 12): number {
  return startOfDay(day) + hours * HOUR;
}

/** An entry on `day` with the fixture's secrets on it. */
function secretEntry(day: DayKey, kcal: number, index: number): DiaryEntry {
  return makeEntry({
    id: index === 0 ? 'entry-id-secret' : `entry-${day}-${index}`,
    loggedAt: at(day, 8 + index),
    dayKey: day,
    name: index % 2 === 0 ? 'Nonna Pia ragù' : 'Sunrise Mills granola',
    note: 'after the dentist',
    kcal,
    protein: kcal / 20,
    carbs: kcal / 8,
    fat: kcal / 40,
    nutrients: index % 2 === 0 ? { fibre: 6 } : {},
    photoIds: ['photo-id-4711'],
    lines: [makeLine({ name: 'Smoked paprika butter', kcal: 90 })],
    product: makeProduct({
      ingredients: 'oat flakes, malt extract',
      traces: ['peanut-trace-note'],
    }),
  });
}

/**
 * 30 finished days: 20 full days (two logs, 1 900 kcal), 6 partial days (one log, 900 kcal) and
 * 4 days with nothing; weigh-ins every 5 days from 72.0 kg down by 0.3 kg; one body-fat reading;
 * and an entry today, which the pack must leave out.
 */
export function secretEvidence(): EvidencePack {
  const today = FIXTURE_TODAY;
  const entries: DiaryEntry[] = [];
  for (let back = 1; back <= 30; back += 1) {
    const day = addDays(today, -back);
    if (back % 7 === 0) continue; // 4 days with nothing logged
    if (back % 5 === 0) {
      entries.push(secretEntry(day, 900, 0));
    } else {
      entries.push(secretEntry(day, 1000, 0), secretEntry(day, 900, 1));
    }
  }
  entries.push(makeEntry({ loggedAt: at(today), dayKey: today, name: 'Midnight churros' }));
  const weighIns: WeighIn[] = [0, 5, 10, 15, 20, 25].map((step, index) => ({
    id: `weigh-${index}`,
    at: at(addDays(today, -30 + step), 7),
    kg: 72 - index * 0.3,
  }));
  return buildEvidence({
    profile: evidenceProfile,
    entries,
    weighIns,
    bodyFat: [{ id: 'fat-1', at: at(addDays(today, -3), 7), fraction: 0.214 }],
    today,
  });
}
