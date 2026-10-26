// Test helper: the wizard page started on any step, with every state it reports collected.

import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { WizardPage, type LateSteps } from '../WizardPage';
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

/** A fresh wizard moved to `step`, with any answers changed. */
export function wizardAt(step: WizardStep, changes: Partial<WizardState> = {}): WizardState {
  return { ...startWizard(TEST_TODAY, changes.units ?? METRIC), step, ...changes };
}

export interface RenderWizardOptions {
  readonly state?: WizardState;
  readonly locale?: string;
  readonly ask?: AskNotifications;
  readonly onRestore?: () => void;
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
      lateSteps={options.lateSteps}
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
