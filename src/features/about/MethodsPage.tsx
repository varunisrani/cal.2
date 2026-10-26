import type { ReactNode } from 'react';
import type { Activity } from '../../domain/model';
import type { PaceId } from '../../domain/profile/editRules';
import { t, type TKey } from '../../i18n/t';
import { Card } from '../../ui/Card';
import styles from './about.module.css';
import {
  activityRows,
  energyPerWeight,
  katchFigures,
  METHOD_CONSTANTS,
  mifflinFigures,
  paceRows,
  proteinSpan,
} from './methodsFigures';

const LEVEL_NAMES: Readonly<Record<Activity, TKey>> = {
  sedentary: 'onboarding.activity.levels.sedentary.name',
  light: 'onboarding.activity.levels.light.name',
  moderate: 'onboarding.activity.levels.moderate.name',
  active: 'onboarding.activity.levels.active.name',
  hard: 'onboarding.activity.levels.hard.name',
  athlete: 'onboarding.activity.levels.athlete.name',
};

const PACE_NAMES: Readonly<Record<PaceId, TKey>> = {
  slow: 'onboarding.pace.slow',
  steady: 'onboarding.pace.steady',
  fast: 'onboarding.pace.fast',
};

const SENT: readonly TKey[] = [
  'about.methods.ai.sentProfile',
  'about.methods.ai.sentDays',
  'about.methods.ai.sentReadings',
  'about.methods.ai.sentTargets',
];

const NEVER_SENT: readonly TKey[] = [
  'about.methods.ai.neverNames',
  'about.methods.ai.neverNotes',
  'about.methods.ai.neverPhotos',
  'about.methods.ai.neverIngredients',
];

interface Source {
  readonly id: string;
  readonly who: TKey;
  readonly what: TKey;
  readonly where: TKey;
  /** A DOI or the publisher's page; null for a book with many editions. */
  readonly url: string | null;
}

/** The publications behind the equations and rules, in the order the page uses them. */
export const METHOD_SOURCES: readonly Source[] = [
  {
    id: 'mifflin',
    who: 'about.methods.sources.mifflin.who',
    what: 'about.methods.sources.mifflin.what',
    where: 'about.methods.sources.mifflin.where',
    url: 'https://doi.org/10.1093/ajcn/51.2.241',
  },
  {
    id: 'katch',
    who: 'about.methods.sources.katch.who',
    what: 'about.methods.sources.katch.what',
    where: 'about.methods.sources.katch.where',
    url: null,
  },
  {
    id: 'energy',
    who: 'about.methods.sources.energy.who',
    what: 'about.methods.sources.energy.what',
    where: 'about.methods.sources.energy.where',
    url: 'https://www.fao.org/3/y5686e/y5686e00.htm',
  },
  {
    id: 'pound',
    who: 'about.methods.sources.pound.who',
    what: 'about.methods.sources.pound.what',
    where: 'about.methods.sources.pound.where',
    url: 'https://doi.org/10.1093/ajcn/6.5.542',
  },
  {
    id: 'imbalance',
    who: 'about.methods.sources.imbalance.who',
    what: 'about.methods.sources.imbalance.what',
    where: 'about.methods.sources.imbalance.where',
    url: 'https://doi.org/10.1016/S0140-6736(11)60812-X',
  },
  {
    id: 'protein',
    who: 'about.methods.sources.protein.who',
    what: 'about.methods.sources.protein.what',
    where: 'about.methods.sources.protein.where',
    url: 'https://doi.org/10.1136/bjsports-2017-097608',
  },
  {
    id: 'reference',
    who: 'about.methods.sources.reference.who',
    what: 'about.methods.sources.reference.what',
    where: 'about.methods.sources.reference.where',
    url: 'https://doi.org/10.17226/10490',
  },
];

export interface MethodsPageProps {
  /**
   * The level of the section headings: 2 under a page title (Settings), 3 inside a sheet whose
   * title is the h2 (Plan ready).
   */
  readonly headingLevel?: 2 | 3;
}

/**
 * How the plan's numbers are worked out, in our words: the two resting-energy equations, the
 * activity factors, the pace rule, the macro rules, what meal values are, what the AI is and is
 * not sent, the sources and a not-medical-advice note. Every number comes from the domain
 * (`methodsFigures.ts`), so the page always matches the maths the app runs.
 */
export function MethodsPage({ headingLevel = 2 }: MethodsPageProps) {
  const mifflin = mifflinFigures();
  const katch = katchFigures();
  const perWeight = energyPerWeight();
  const protein = proteinSpan();
  const { kcalPerGram, fatPerKg, losingProteinExtra, kjPerKcal } = METHOD_CONSTANTS;
  const section = (heading: TKey, ui: string, children: ReactNode) => (
    <Card heading={t(heading)} headingLevel={headingLevel} data-ui={`methods.${ui}`}>
      <div className={styles.body}>{children}</div>
    </Card>
  );

  return (
    <div className={styles.page} data-ui="methods">
      <p className={styles.intro}>{t('about.methods.intro')}</p>

      {section(
        'about.methods.resting.heading',
        'resting',
        <>
          <p>{t('about.methods.resting.lead')}</p>
          <p className={styles.name}>{t('about.methods.resting.mifflinName')}</p>
          <p className={styles.muted}>{t('about.methods.resting.mifflinWhen')}</p>
          <p className={styles.equation} data-ui="methods.mifflin.male">
            {t('about.methods.resting.mifflinMale', {
              perKg: mifflin.perKg,
              perCm: mifflin.perCm,
              perYear: mifflin.perYear,
              constant: mifflin.male,
            })}
          </p>
          <p className={styles.equation} data-ui="methods.mifflin.other">
            {t('about.methods.resting.mifflinOther', {
              perKg: mifflin.perKg,
              perCm: mifflin.perCm,
              perYear: mifflin.perYear,
              constant: Math.abs(mifflin.other),
            })}
          </p>
          <p className={styles.name}>{t('about.methods.resting.katchName')}</p>
          <p className={styles.muted}>{t('about.methods.resting.katchWhen')}</p>
          <p className={styles.equation} data-ui="methods.katch">
            {t('about.methods.resting.katchFormula', {
              base: katch.base,
              perKg: katch.perLeanKg,
            })}
          </p>
          <p className={styles.equation}>{t('about.methods.resting.leanMass')}</p>
        </>,
      )}

      {section(
        'about.methods.daily.heading',
        'daily',
        <>
          <p>{t('about.methods.daily.lead')}</p>
          <table className={styles.table} data-ui="methods.activity">
            <thead>
              <tr>
                <th scope="col">{t('about.methods.daily.level')}</th>
                <th scope="col">{t('about.methods.daily.factor')}</th>
                <th scope="col">{t('about.methods.daily.protein')}</th>
              </tr>
            </thead>
            <tbody>
              {activityRows().map((row) => (
                <tr key={row.activity} data-ui={`methods.activity.${row.activity}`}>
                  <th scope="row">{t(LEVEL_NAMES[row.activity])}</th>
                  <td>{t('about.methods.daily.factorValue', { factor: row.multiplier })}</td>
                  <td>{t('about.methods.daily.proteinValue', { rate: row.proteinPerKg })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>,
      )}

      {section(
        'about.methods.pace.heading',
        'pace',
        <>
          <p>
            {t('about.methods.pace.perWeight', {
              perKg: perWeight.perKg,
              perLb: perWeight.perLb,
            })}
          </p>
          <p>{t('about.methods.pace.rule', { perKg: perWeight.perKg })}</p>
          <ul className={styles.list} data-ui="methods.paces">
            {paceRows().map((row) => (
              <li key={row.pace}>
                <span className={styles.name}>{t(PACE_NAMES[row.pace])}</span>{' '}
                {t('about.methods.pace.example', { weekly: row.weeklyKg, perDay: row.perDay })}
              </li>
            ))}
          </ul>
          <p className={styles.muted}>{t('about.methods.pace.kilojoules', { kj: kjPerKcal })}</p>
        </>,
      )}

      {section(
        'about.methods.macros.heading',
        'macros',
        <>
          <p>
            {t('about.methods.macros.protein', {
              low: protein.low,
              high: protein.high,
              extra: losingProteinExtra,
            })}
          </p>
          <p>{t('about.methods.macros.fat', { perKg: fatPerKg })}</p>
          <p>
            {t('about.methods.macros.carbs', {
              carbs: kcalPerGram.carbs,
              protein: kcalPerGram.protein,
              fat: kcalPerGram.fat,
            })}
          </p>
          <p className={styles.muted}>{t('about.methods.macros.rounding')}</p>
        </>,
      )}

      {section('about.methods.meals.heading', 'meals', <p>{t('about.methods.meals.body')}</p>)}

      {section(
        'about.methods.ai.heading',
        'ai',
        <>
          <p>{t('about.methods.ai.sentLead')}</p>
          <ul className={styles.list} data-ui="methods.ai.sent">
            {SENT.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <p>{t('about.methods.ai.neverLead')}</p>
          <ul className={styles.list} data-ui="methods.ai.never">
            {NEVER_SENT.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </>,
      )}

      {section(
        'about.methods.sources.heading',
        'sources',
        <ol className={styles.sources}>
          {METHOD_SOURCES.map((source) => (
            <li key={source.id} data-ui={`methods.source.${source.id}`}>
              <span>{t(source.who)}</span>{' '}
              {source.url === null ? (
                <cite>{t(source.what)}</cite>
              ) : (
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  <cite>{t(source.what)}</cite>
                </a>
              )}{' '}
              <span className={styles.muted}>{t(source.where)}</span>
            </li>
          ))}
        </ol>,
      )}

      {section('about.methods.advice.heading', 'advice', <p>{t('about.methods.advice.body')}</p>)}
    </div>
  );
}
