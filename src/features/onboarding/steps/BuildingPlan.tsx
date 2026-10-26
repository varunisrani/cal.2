import { useEffect, useId, useRef, useState } from 'react';
import { t, type TKey } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import {
  formulaStandIn,
  type BuiltPlan,
  type PlanRequest,
} from '../../../services/goals/planBuilder';
import { cx } from '../../../ui/classes';
import { Icon } from '../../../ui/icons';
import { ProgressBar } from '../../../ui/ProgressBar';
import { wizardProfile } from '../wizard';
import own from './buildingPlan.module.css';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';

/** The checklist, ticked in this order. */
const LINES: readonly TKey[] = [
  'onboarding.building.lines.energy',
  'onboarding.building.lines.protein',
  'onboarding.building.lines.fat',
  'onboarding.building.lines.carbs',
  'onboarding.building.lines.check',
];

/** One checklist line is ticked every this many milliseconds. */
export const BUILD_LINE_MS = 700;

/** The whole animation: the five lines (3.5 s) and a short hold on the full list. */
export const BUILD_ANIMATION_MS = 4_000;

/** The step's clock ticks this often; the counter moves on each tick. */
const FRAME_MS = 50;

/** The counter reaches 100 % as the last line is ticked. */
const COUNT_MS = LINES.length * BUILD_LINE_MS;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Milliseconds since the step appeared, in frames, stopping at the end of the animation. */
function useElapsed(): number {
  const [elapsed, setElapsed] = useState(0);
  const running = elapsed < BUILD_ANIMATION_MS;
  useEffect(() => {
    if (!running) return;
    // One interval for the whole animation, so the counter and the list never drift apart.
    const timer = setInterval(() => {
      setElapsed((ms) => Math.min(BUILD_ANIMATION_MS, ms + FRAME_MS));
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [running]);
  return elapsed;
}

/**
 * Step 11 (01 §3.4, P05-05): a counter climbing to 100 % and a checklist ticking one line every
 * 700 ms (about 4 s in all), while the plan is built in parallel (the AI's within 60 s, else the
 * formulas, D-16.14). It moves to Plan ready only when both are done, with the run it started
 * for; a plan that arrives after the step went away is dropped (R01.8). The wizard shows no Back
 * here. With reduced motion the counter steps with the list instead of counting; the order and
 * the timing stay.
 */
export function BuildingPlan({ state, dispatch }: StepProps) {
  const { planBuilder } = useServices();
  // What this visit builds for, fixed when the step appears.
  const [visit] = useState(() => ({
    run: state.buildRun,
    request: { profile: wizardProfile(state), today: state.today, units: state.units },
  }));
  const [reduced] = useState(prefersReducedMotion);
  const [built, setBuilt] = useState<BuiltPlan | null>(null);
  const dispatched = useRef(false);
  const listTitle = useId();

  const elapsed = useElapsed();
  const ticked = Math.min(LINES.length, Math.floor(elapsed / BUILD_LINE_MS));
  const percent = reduced
    ? Math.round((ticked * 100) / LINES.length)
    : Math.min(100, Math.floor((elapsed * 100) / COUNT_MS));
  const animated = elapsed >= BUILD_ANIMATION_MS;

  useEffect(() => {
    const stop = new AbortController();
    let current = true;
    const request: PlanRequest = { ...visit.request, cancel: stop.signal };
    void Promise.resolve()
      .then(() => planBuilder.build(request))
      // The builder never rejects; a broken one still ends on the formulas, never on this step.
      .catch(() => formulaStandIn(request))
      .then((plan) => {
        if (current) setBuilt(plan);
      });
    return () => {
      current = false;
      stop.abort();
    };
  }, [planBuilder, visit]);

  useEffect(() => {
    if (!animated || built === null || dispatched.current) return;
    dispatched.current = true;
    dispatch({
      type: 'planBuilt',
      run: visit.run,
      plan: built.plan,
      aiUnavailable: built.aiUnavailable,
    });
  }, [animated, built, dispatch, visit]);

  return (
    <div className={own.building} data-ui="wizard.building">
      <StepHeader
        title={t('onboarding.building.title')}
        subtitle={t('onboarding.building.subtitle')}
      />
      <div className={own.meter}>
        <p className={own.percent} aria-hidden="true" data-ui="wizard.building.percent">
          {t('onboarding.building.percent', { value: percent })}
        </p>
        <ProgressBar
          value={percent}
          max={100}
          label={t('onboarding.building.progress')}
          data-ui="wizard.building.progress"
        />
      </div>
      <section className={own.list} aria-labelledby={listTitle}>
        <h2 id={listTitle} className={own.listTitle}>
          {t('onboarding.building.listTitle')}
        </h2>
        <ul className={own.lines}>
          {LINES.map((key, index) => {
            const done = index < ticked;
            return (
              <li
                key={key}
                className={cx(own.line, done && own.lineDone)}
                data-ui="wizard.building.line"
                data-done={done ? '' : undefined}
              >
                {t(key)}
                {done ? (
                  <Icon
                    name="check"
                    size={20}
                    label={t('onboarding.building.done')}
                    className={own.tick}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
