import { useState } from 'react';
import { useSheet } from '../../app/useRoute';
import { useSettings, useWalkList } from '../../data/hooks';
import { dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import { formatDay } from '../../i18n/format';
import { t } from '../../i18n/t';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { clockText, walkDistance, walkDistanceUnit } from './text';
import { useWeekMinutes } from './useWeekMinutes';
import styles from './walk.module.css';
import { WalkSummary } from './WalkSummary';
import { WeekRing } from './WeekRing';

/** The summary sheet's place on the sheet stack. */
export const WALK_SHEET = 'walk';

const SETTINGS = ['units.height'] as const;

export interface WalksCardProps {
  readonly today: DayKey;
}

/**
 * Progress › Walks (P15-03), in the Android app: this week's moderate minutes as a ring, then
 * every recorded walk, newest first, with its date, time, distance and score; a walk opens its
 * summary in a sheet.
 */
export function WalksCard({ today }: WalksCardProps) {
  const settings = useSettings(SETTINGS);
  const walks = useWalkList();
  const week = useWeekMinutes(today);
  const sheet = useSheet(WALK_SHEET);
  const [openId, setOpenId] = useState<string | null>(null);

  if (settings.status !== 'ready' || walks.status !== 'ready') return null;
  const unit = walkDistanceUnit(settings.value['units.height']);
  const shown = openId === null ? null : (walks.value.find((walk) => walk.id === openId) ?? null);

  return (
    <Card heading={t('walk.walks.title')} className={styles.walksCard} data-ui="progress.walks">
      <div className={styles.weekRow}>
        <WeekRing
          minutes={week.status === 'ready' ? week.value.total : 0}
          data-ui="progress.walks.week"
        />
        <p className={styles.note}>{t('walk.summary.weekNote')}</p>
      </div>
      {walks.value.length === 0 ? (
        <p className={styles.note} data-ui="progress.walks.empty">
          {t('walk.walks.empty')}
        </p>
      ) : (
        <ul className={styles.walkList} aria-label={t('walk.walks.list')}>
          {walks.value.map((walk) => {
            const day = formatDay(dayKeyOf(walk.startedAt), 'medium');
            const time = clockText(walk.activeSeconds);
            const score = walk.score === null ? t('walk.walks.scoreNone') : String(walk.score);
            const name =
              walk.distanceM === null
                ? t('walk.walks.rowNoDistance', { day, time, score })
                : t('walk.walks.row', {
                    day,
                    time,
                    score,
                    distance: walkDistance(walk.distanceM, unit),
                  });
            return (
              <li key={walk.id}>
                <button
                  type="button"
                  className={styles.walkRow}
                  aria-label={name}
                  data-ui="progress.walks.row"
                  onClick={() => {
                    setOpenId(walk.id);
                    sheet.show();
                  }}
                >
                  <span className={styles.walkDay}>{day}</span>
                  <span className={styles.walkFigures} aria-hidden="true">
                    <span>{time}</span>
                    {walk.distanceM === null ? null : (
                      <span>{walkDistance(walk.distanceM, unit)}</span>
                    )}
                  </span>
                  <span className={styles.walkScore} aria-hidden="true">
                    {walk.score === null
                      ? t('walk.figure.none')
                      : t('walk.walks.score', { score: walk.score })}
                  </span>
                  <Icon name="chevronRight" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Sheet
        open={sheet.open && shown !== null}
        title={t('walk.walks.summary')}
        onClose={sheet.close}
        data-ui="progress.walks.sheet"
      >
        {shown === null ? null : <WalkSummary walk={shown} today={today} />}
      </Sheet>
    </Card>
  );
}
