import { useId, useMemo, type ReactNode } from 'react';
import { useSettings, useWalkList } from '../../data/hooks';
import { dayKeyOf } from '../../domain/dates/dayKey';
import { weekStart } from '../../domain/dates/week';
import { earlierWalks, walkAverages, type WalkAverages } from '../../domain/walks/compare';
import { ZONE_FLOORS } from '../../domain/walks/heartRate';
import type { Walk, WalkScoreParts } from '../../domain/walks/model';
import { decodeRoute } from '../../domain/walks/route';
import { effortOf, SCORE_WEIGHTS } from '../../domain/walks/score';
import { BRISK_KMH } from '../../domain/walks/stats';
import type { HeightDisplayUnit } from '../../domain/units/body';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatNumber } from '../../domain/units/numbers';
import { formatDay, formatTime } from '../../i18n/format';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { Card } from '../../ui/Card';
import { RouteLine } from './RouteLine';
import {
  cadenceText,
  clockText,
  paceText,
  speedText,
  walkDistance,
  walkDistanceUnit,
  walkEnergy,
  type DistanceUnit,
} from './text';
import { useWeekMinutes } from './useWeekMinutes';
import styles from './walk.module.css';
import { WeekRing } from './WeekRing';

const SETTINGS = ['units.energy', 'units.height', 'display.weekStart'] as const;

type PartKey = keyof WalkScoreParts;
const PART_ORDER: readonly PartKey[] = ['brisk', 'duration', 'intensity', 'pace'];

/** Seconds per km of a walk with a route, else null. */
function paceOf(walk: Pick<Walk, 'distanceM' | 'activeSeconds' | 'speedFrom'>): number | null {
  if (walk.speedFrom !== 'route' || walk.distanceM === null || walk.distanceM <= 0) return null;
  return walk.activeSeconds / (walk.distanceM / 1000);
}

function oneDecimal(value: number): string {
  return formatNumber(value, currentLocale(), 1, 1);
}

/** What a part's points mean for this walk, in words. */
function explanation(walk: Walk, part: PartKey, unit: DistanceUnit): string {
  const minutes = Math.round(walk.activeSeconds / 60);
  switch (part) {
    case 'brisk':
      if (walk.parts.brisk === null) return t('walk.summary.explain.briskNone');
      return walk.steps !== null
        ? t('walk.summary.explain.briskSteps', { brisk: walk.briskMinutes, minutes })
        : t('walk.summary.explain.briskSpeed', {
            brisk: walk.briskMinutes,
            minutes,
            speed: speedText(BRISK_KMH, unit),
          });
    case 'duration':
      return minutes >= 30
        ? t('walk.summary.explain.durationFull')
        : t('walk.summary.explain.durationShort', { minutes });
    case 'intensity':
      if (walk.parts.intensity === null) return t('walk.summary.explain.intensityNone');
      return t('walk.summary.explain.intensity', {
        met: oneDecimal(walk.met),
        effort: t(`walk.summary.effort.${effortOf(walk.met)}`),
      });
    case 'pace':
      if (walk.parts.pace === null || walk.paceRatio === null) {
        return t('walk.summary.explain.paceNone');
      }
      return walk.paceRatio >= 1
        ? t('walk.summary.explain.paceFaster')
        : t('walk.summary.explain.paceSlower', { percent: Math.round(walk.paceRatio * 100) });
  }
}

function ScoreParts({ walk, unit }: { readonly walk: Walk; readonly unit: DistanceUnit }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h3 id={headingId} className={styles.sectionHeading}>
        {t('walk.summary.parts')}
      </h3>
      <ul className={styles.parts} data-ui="walk.summary.parts">
        {PART_ORDER.map((part) => {
          const points = walk.parts[part];
          const max = SCORE_WEIGHTS[part];
          return (
            <li key={part} className={styles.part} data-ui={`walk.summary.part.${part}`}>
              <span className={styles.partName}>{t(`walk.summary.part.${part}`)}</span>
              <span className={styles.partPoints}>
                {points === null
                  ? t('walk.figure.none')
                  : t('walk.summary.points', { points: Math.round(points), max })}
              </span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.bar}
                  style={{ inlineSize: `${points === null ? 0 : (points / max) * 100}%` }}
                />
              </span>
              <span className={styles.partWhy}>{explanation(walk, part, unit)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Figure({ name, value, hook }: { name: string; value: ReactNode; hook: string }) {
  return (
    <div className={styles.figure} data-ui={hook}>
      <dt className={styles.figureName}>{name}</dt>
      <dd className={styles.figureValue}>{value}</dd>
    </div>
  );
}

function Comparison({
  walk,
  averages,
  unit,
}: {
  readonly walk: Walk;
  readonly averages: WalkAverages | null;
  readonly unit: DistanceUnit;
}) {
  const headingId = useId();
  if (averages === null) {
    return (
      <section aria-labelledby={headingId} className={styles.section}>
        <h3 id={headingId} className={styles.sectionHeading}>
          {t('walk.summary.compare')}
        </h3>
        <p className={styles.note} data-ui="walk.summary.compare.none">
          {t('walk.summary.compareNone')}
        </p>
      </section>
    );
  }
  const none = t('walk.figure.none');
  const usualPace = averages.speedKmh === null ? null : 3600 / averages.speedKmh;
  const rows: Array<[string, string, string]> = [
    [t('walk.summary.time'), clockText(walk.activeSeconds), clockText(averages.minutes * 60)],
    [
      t('walk.summary.distance'),
      walk.distanceM === null ? none : walkDistance(walk.distanceM, unit),
      averages.distanceM === null ? none : walkDistance(averages.distanceM, unit),
    ],
    [t('walk.summary.pace'), paceText(paceOf(walk), unit), paceText(usualPace, unit)],
    [
      t('walk.summary.score'),
      walk.score === null ? none : String(walk.score),
      averages.score === null ? none : String(Math.round(averages.score)),
    ],
  ];
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h3 id={headingId} className={styles.sectionHeading}>
        {t('walk.summary.compare')}
      </h3>
      <p className={styles.note}>{t('walk.summary.compareLead', { count: averages.count })}</p>
      <table className={styles.compare} data-ui="walk.summary.compare">
        <thead>
          <tr>
            <td />
            <th scope="col">{t('walk.summary.thisWalk')}</th>
            <th scope="col">{t('walk.summary.usual')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, mine, usual]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{mine}</td>
              <td>{usual}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function HeartZones({ walk }: { readonly walk: Walk }) {
  const headingId = useId();
  const heart = walk.heartRate;
  if (heart === null) return null;
  const longest = Math.max(1, ...heart.zoneSeconds);
  return (
    <section aria-labelledby={headingId} className={styles.section} data-ui="walk.summary.heart">
      <h3 id={headingId} className={styles.sectionHeading}>
        {t('walk.summary.heart')}
      </h3>
      <p className={styles.note}>
        {t('walk.summary.heartLine', { avg: heart.avgBpm, max: heart.maxBpm })}
      </p>
      <ul className={styles.zones}>
        {heart.zoneSeconds.map((seconds, index) => {
          const from = Math.round((ZONE_FLOORS[index] ?? 0) * 100);
          const to = Math.round((ZONE_FLOORS[index + 1] ?? 1) * 100);
          return (
            <li key={index} className={styles.zone} data-ui={`walk.summary.zone.${index + 1}`}>
              <span>
                {index === ZONE_FLOORS.length - 1
                  ? t('walk.summary.zoneTop')
                  : t('walk.summary.zone', { zone: index + 1, from, to })}
              </span>
              <span className={styles.zoneTime}>
                {t('walk.summary.zoneTime', { minutes: Math.round(seconds / 60) })}
              </span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.bar}
                  style={{ inlineSize: `${(seconds / longest) * 100}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <p className={styles.note}>{t('walk.summary.heartNote', { maxHr: heart.maxHr })}</p>
    </section>
  );
}

export interface WalkSummaryProps {
  readonly walk: Walk;
  /** Today, to tell this week from an earlier one. */
  readonly today: string;
  /** Save and Discard, on the Walk screen; none when opened from Progress. */
  readonly actions?: ReactNode;
}

/**
 * How a walk went (P15-03): the score large with its four parts and what each means, the walk's
 * figures and route, the week's moderate minutes as a ring, the heart-rate zones when Health
 * Connect had heart rate for it, and how it compares with the walks before it.
 */
export function WalkSummary({ walk, today, actions }: WalkSummaryProps) {
  const settings = useSettings(SETTINGS);
  const list = useWalkList();
  const walkDay = dayKeyOf(walk.startedAt);
  const week = useWeekMinutes(walkDay);
  const fixes = useMemo(() => decodeRoute(walk.route) ?? [], [walk.route]);
  const averages = useMemo(
    () => (list.status === 'ready' ? walkAverages(earlierWalks(walk, list.value)) : null),
    [list, walk],
  );
  if (settings.status !== 'ready') return null;
  const energy: EnergyDisplayUnit = settings.value['units.energy'];
  const length: HeightDisplayUnit = settings.value['units.height'];
  const unit = walkDistanceUnit(length);
  const start = settings.value['display.weekStart'];
  const sameWeek = weekStart(walkDay, start) === weekStart(today, start);

  return (
    <div className={styles.summary} data-ui="walk.summary">
      <p className={styles.when}>
        {t('walk.summary.when', {
          day: formatDay(walkDay, 'medium'),
          time: formatTime(walk.startedAt),
        })}
      </p>
      <div className={styles.scoreBlock} data-ui="walk.summary.score">
        {walk.score === null ? (
          <p className={styles.note}>{t('walk.summary.noScore')}</p>
        ) : (
          <>
            <span className={styles.scoreValue}>{walk.score}</span>
            <span className={styles.scoreCaption}>
              {t('walk.summary.score')} <span>{t('walk.summary.outOf')}</span>
            </span>
          </>
        )}
      </div>
      <Card className={styles.card}>
        <ScoreParts walk={walk} unit={unit} />
      </Card>
      <Card className={styles.card} heading={t('walk.summary.figures')} headingLevel={3}>
        <dl className={styles.figures}>
          <Figure
            name={t('walk.summary.time')}
            value={clockText(walk.activeSeconds)}
            hook="walk.summary.time"
          />
          <Figure
            name={t('walk.summary.distance')}
            value={
              walk.distanceM === null ? t('walk.figure.none') : walkDistance(walk.distanceM, unit)
            }
            hook="walk.summary.distance"
          />
          <Figure
            name={t('walk.summary.pace')}
            value={paceText(paceOf(walk), unit)}
            hook="walk.summary.pace"
          />
          <Figure
            name={t('walk.summary.steps')}
            value={
              walk.steps === null
                ? t('walk.figure.none')
                : formatNumber(walk.steps, currentLocale())
            }
            hook="walk.summary.steps"
          />
          <Figure
            name={t('walk.summary.cadence')}
            value={cadenceText(walk.cadence)}
            hook="walk.summary.cadence"
          />
          <Figure
            name={t('walk.summary.active')}
            value={walkEnergy(walk.activeKcal, energy)}
            hook="walk.summary.active"
          />
          <Figure
            name={t('walk.summary.total')}
            value={walkEnergy(walk.kcal, energy)}
            hook="walk.summary.total"
          />
        </dl>
        <p className={styles.note}>{t('walk.summary.energyNote')}</p>
        <RouteLine fixes={fixes} live={false} located={walk.distanceM !== null} />
      </Card>
      <Card
        className={styles.card}
        heading={
          sameWeek
            ? t('walk.summary.week')
            : t('walk.summary.weekOf', { day: formatDay(weekStart(walkDay, start), 'medium') })
        }
        headingLevel={3}
      >
        <div className={styles.weekRow}>
          <WeekRing minutes={week.status === 'ready' ? week.value.total : 0} />
          <p className={styles.note}>{t('walk.summary.weekNote')}</p>
        </div>
      </Card>
      {walk.heartRate === null ? null : (
        <Card className={styles.card}>
          <HeartZones walk={walk} />
        </Card>
      )}
      <Card className={styles.card}>
        <Comparison walk={walk} averages={averages} unit={unit} />
      </Card>
      {actions}
    </div>
  );
}
