import { createContext, useContext, type ReactNode } from 'react';
import type { Clock } from '../lib/clock';
import type { AiSetupService } from './aiSetup';
import type { AnalysisService } from './analysis';
import type { CaptureDraftService } from './captureDrafts';
import type { DiaryService } from './diary';
import type { PlanBuilder } from './goals/planBuilder';
import type { RebuildService } from './goals/rebuild';
import type { TuneUpRunner } from './goals/tuneUp';
import type { OnboardingService } from './onboarding';
import type { PhotoService } from './photos';

/** What screens act through (they never reach the repositories): built once by `main.tsx`. */
export interface Services {
  readonly diary: DiaryService;
  /** Completes onboarding from the wizard's answers (P05-07). */
  readonly onboarding: OnboardingService;
  /** Saves the AI choice (P05-04). */
  readonly aiSetup: AiSetupService;
  /** Builds the onboarding plan: the AI's within 60 s, else the formulas (P05-05). */
  readonly planBuilder: PlanBuilder;
  /**
   * Stores new photos and makes their display copies (P06-02). Optional only until every test's
   * stand-in services carry one; `main.tsx` always provides it.
   */
  readonly photos?: PhotoService;
  /** The capture sheet's draft (P06-03); optional for the same reason. */
  readonly captureDrafts?: CaptureDraftService;
  /** Rebuilds the plan with the AI (P05-08); optional for the same reason. */
  readonly rebuild?: RebuildService;
  /** The weekly tune-up (P05-09): one runner for the app; optional for the same reason. */
  readonly tuneUp?: TuneUpRunner;
  /** The food analysis and its draft (P06-04); optional for the same reason. */
  readonly analysis?: AnalysisService;
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
/** The services when a provider is above, else null (the shell renders before they exist). */
export function useOptionalServices(): Services | null {
  return useContext(ServicesContext);
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices: no ServicesProvider above this component');
  return services;
}
