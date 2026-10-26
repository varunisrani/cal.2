import { createContext, useContext, type ReactNode } from 'react';
import type { Clock } from '../lib/clock';
import type { AiSetupService } from './aiSetup';
import type { DiaryService } from './diary';
import type { OnboardingService } from './onboarding';

/** What screens act through (they never reach the repositories): built once by `main.tsx`. */
export interface Services {
  readonly diary: DiaryService;
  readonly onboarding: OnboardingService;
  /**
   * Saves the AI choice (P05-04). Optional only until every test's stand-in services carry one;
   * `main.tsx` always provides it.
   */
  readonly aiSetup?: AiSetupService;
  /** Where "now" comes from for the actions screens start. */
  readonly clock: Clock;
}

const ServicesContext = createContext<Services | null>(null);

export interface ServicesProviderProps {
  readonly services: Services;
  readonly children?: ReactNode;
}

export function ServicesProvider({ services, children }: ServicesProviderProps) {
  return <ServicesContext value={services}>{children}</ServicesContext>;
}

/** The app's services, from the nearest `ServicesProvider`. */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices: no ServicesProvider above this component');
  return services;
}
