import type { Dispatch } from 'react';
import type { WizardAction, WizardState } from '../wizard';

/** What every wizard step receives: the whole state, and the reducer's dispatch to change it. */
export interface StepProps {
  readonly state: WizardState;
  readonly dispatch: Dispatch<WizardAction>;
}
