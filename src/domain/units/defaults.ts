// First-run units from the browser's locale (D-16.10). Three places measure people in feet and
// inches; everyone else gets cm. Weight is kg in every locale (D-16.91), so a first run in those
// three reads height in feet and inches next to weight in kg (R01.18). Energy always starts as
// kcal.

import type { HeightDisplayUnit, WeightDisplayUnit } from './body';
import { DEFAULT_ENERGY_UNIT, type EnergyDisplayUnit } from './energy';

export interface UnitDefaults {
  readonly energy: EnergyDisplayUnit;
  readonly height: HeightDisplayUnit;
  readonly weight: WeightDisplayUnit;
}

/** Language and region pairs that start height in feet and inches: the US, Liberia and Myanmar. */
const FEET_AND_INCHES_LOCALES: ReadonlySet<string> = new Set(['en-US', 'en-LR', 'my-MM']);

const METRIC: UnitDefaults = { energy: DEFAULT_ENERGY_UNIT, height: 'cm', weight: 'kg' };
const FEET_AND_INCHES: UnitDefaults = { energy: DEFAULT_ENERGY_UNIT, height: 'ftIn', weight: 'kg' };

/** "language-REGION" for a tag (case, script and extensions ignored), or null when unreadable. */
function languageAndRegion(tag: string): string | null {
  try {
    const locale = new Intl.Locale(tag.trim().replaceAll('_', '-'));
    return locale.region === undefined ? null : `${locale.language}-${locale.region}`;
  } catch {
    return null;
  }
}

/**
 * The units a first run starts with for a BCP 47 tag (normally `navigator.language`): `en-US`,
 * `en-LR` and `my-MM` read height in feet and inches, every other tag (including a bare language
 * or one that cannot be read) in cm. Weight is kg and energy kcal for every tag.
 */
export function defaultUnits(localeTag: string): UnitDefaults {
  const pair = languageAndRegion(localeTag);
  return pair !== null && FEET_AND_INCHES_LOCALES.has(pair) ? FEET_AND_INCHES : METRIC;
}
