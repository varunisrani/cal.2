// First-run units from the browser's locale (D-16.10). Three places weigh people in pounds and
// measure them in feet and inches; everyone else gets kg and cm. Height and weight come from one
// decision, so a first run never mixes them (R01.18). Energy always starts as kcal.

import type { HeightDisplayUnit, WeightDisplayUnit } from './body';
import { DEFAULT_ENERGY_UNIT, type EnergyDisplayUnit } from './energy';

export interface UnitDefaults {
  readonly energy: EnergyDisplayUnit;
  readonly height: HeightDisplayUnit;
  readonly weight: WeightDisplayUnit;
}

/** Language and region pairs that start imperial: the United States, Liberia and Myanmar. */
const IMPERIAL_LOCALES: ReadonlySet<string> = new Set(['en-US', 'en-LR', 'my-MM']);

const METRIC: UnitDefaults = { energy: DEFAULT_ENERGY_UNIT, height: 'cm', weight: 'kg' };
const IMPERIAL: UnitDefaults = { energy: DEFAULT_ENERGY_UNIT, height: 'ftIn', weight: 'lb' };

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
 * `en-LR` and `my-MM` read lb and feet/inches, every other tag (including a bare language or one
 * that cannot be read) kg and cm.
 */
export function defaultUnits(localeTag: string): UnitDefaults {
  const pair = languageAndRegion(localeTag);
  return pair !== null && IMPERIAL_LOCALES.has(pair) ? IMPERIAL : METRIC;
}
