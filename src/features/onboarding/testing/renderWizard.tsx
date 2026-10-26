// Test helper: the wizard page started on any step, with every state it reports collected.

import { render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { vi } from 'vitest';
import { StepHeader } from '../steps/StepHeader';
import type { StepProps } from '../steps/stepProps';
import { WizardPage, type LateStepId, type LateSteps } from '../WizardPage';
import {
  startWizard,
  type AskNotifications,
  type WizardState,
  type WizardStep,
  type WizardUnits,
} from '../wizard';

export const TEST_TODAY = '2026-10-26';
export const METRIC: WizardUnits = { height: 'cm', weight: 'kg' };
export const IMPERIAL: WizardUnits = { height: 'ftIn', weight: 'lb' };

/** The heading a stand-in late step shows. */
export function standInTitle(id: LateStepId): string {
  return `${id} stand-in`;
}

function standIn(id: LateStepId): ComponentType<StepProps> {
  const title = standInTitle(id);
  return function StandInStep() {
    return <StepHeader title={title} />;
  };
}

/** Late steps that show a heading and nothing else, for tests that do not need the real ones. */
export const STAND_IN_STEPS: LateSteps = {
  aiAccess: standIn('aiAccess'),
  buildingPlan: standIn('buildingPlan'),
  planReady: standIn('planReady'),
};

/** A fresh wizard moved to `step`, with any answers changed. */
export function wizardAt(step: WizardStep, changes: Partial<WizardState> = {}): WizardState {
  return { ...startWizard(TEST_TODAY, changes.units ?? METRIC), step, ...changes };
}

export interface RenderWizardOptions {
  readonly state?: WizardState;
  readonly locale?: string;
  readonly ask?: AskNotifications;
  readonly onRestore?: () => void;
  /** Real or test views for some late steps; the others are stand-ins. */
  readonly lateSteps?: Partial<LateSteps>;
}

export function renderWizard(options: RenderWizardOptions = {}) {
  const states: WizardState[] = [];
  const ask = options.ask ?? vi.fn<AskNotifications>(async () => 'granted');
  const view = render(
    <WizardPage
      today={TEST_TODAY}
      locale={options.locale ?? 'en-GB'}
      requestNotifications={ask}
      onRestore={options.onRestore}
      lateSteps={{ ...STAND_IN_STEPS, ...options.lateSteps }}
      initialState={options.state}
      onStateChange={(state) => states.push(state)}
    />,
  );
  /** The state the wizard holds now. */
  const latest = (): WizardState => {
    const last = states.at(-1);
    if (last === undefined) throw new Error('the wizard reported no state');
    return last;
  };
  return { ...view, states, latest, ask };
}
