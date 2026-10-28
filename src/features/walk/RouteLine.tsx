import { useMemo } from 'react';
import { routeShape, type RouteFix } from '../../domain/walks/route';
import { t } from '../../i18n/t';
import styles from './walk.module.css';

const WIDTH = 320;
const HEIGHT = 180;
const PAD = 18;

export interface RouteLineProps {
  readonly fixes: readonly Pick<RouteFix, 'lat' | 'lon'>[];
  /** A walk in progress: the end mark is "you are here". */
  readonly live: boolean;
  /** Location was allowed (else the card says there is no route). */
  readonly located: boolean;
}

/**
 * The route as a line on the card's plain background (no map: D-16.96), north up, with a ring
 * where it started and a dot where it ends (or where the person is now). A picture with its own
 * name for assistive tech; the figures beside it carry the numbers.
 */
export function RouteLine({ fixes, live, located }: RouteLineProps) {
  const shape = useMemo(() => routeShape(fixes, WIDTH, HEIGHT, PAD), [fixes]);
  if (shape.start === null || shape.end === null) {
    return (
      <p className={styles.routeEmpty} data-ui="walk.route.empty">
        {t(located ? 'walk.route.waiting' : 'walk.route.none')}
      </p>
    );
  }
  const end = t(live ? 'walk.route.endNow' : 'walk.route.endDone');
  return (
    <svg
      className={styles.route}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={t('walk.route.label', { end })}
      data-ui="walk.route"
      data-points={fixes.length}
    >
      {shape.path === '' ? null : <path className={styles.routePath} d={shape.path} />}
      <circle className={styles.routeStart} cx={shape.start.x} cy={shape.start.y} r={6} />
      <circle
        className={live ? styles.routeHere : styles.routeEnd}
        cx={shape.end.x}
        cy={shape.end.y}
        r={live ? 7 : 6}
      />
    </svg>
  );
}
