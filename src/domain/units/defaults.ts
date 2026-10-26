// The units a new profile starts with, from the browser's locale (D-16.10). Liberia, Myanmar
// and the United States read weight in lb and height in feet and inches; everyone else in kg
// and cm. One answer decides both, so height and weight never start in different systems
// (R01.18). Energy always starts in kcal; water has its own default (ml).

import type { EnergyMeasure } from './energy';
import type { HeightMeasure, WeightMeasure } from './body';

/** The `units.*` settings. */
export interface UnitSettings {
  energy: EnergyMeasure;
  height: HeightMeasure;
  weight: WeightMeasure;
}

/** Language-region pairs that start imperial. */
const IMPERIAL_LOCALES: ReadonlySet<string> = new Set(['en-US', 'en-LR', 'my-MM']);

/** "en-US" for any spelling of English in the US ("en_us", "en-Latn-US-u-nu-latn"), else null. */
function languageRegion(tag: string): string | null {
  try {
    const { language, region } = new Intl.Locale(tag.replaceAll('_', '-'));
    return region === undefined ? null : `${language}-${region}`;
  } catch {
    return null;
  }
}

/** Starting units for a BCP 47 locale tag; an unusable tag starts metric. */
export function defaultUnits(localeTag: string): UnitSettings {
  const pair = languageRegion(localeTag);
  if (pair !== null && IMPERIAL_LOCALES.has(pair)) {
    return { energy: 'kcal', height: 'ftIn', weight: 'lb' };
  }
  return { energy: 'kcal', height: 'cm', weight: 'kg' };
}
