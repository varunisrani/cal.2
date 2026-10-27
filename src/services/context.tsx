import { createContext, useContext, type ReactNode } from 'react';
import type { Clock } from '../lib/clock';
import type { AiSetupService } from './aiSetup';
import type { AnalysisService } from './analysis';
import type { BarcodeService } from './barcode/lookup';
import type { CaptureDraftService } from './captureDrafts';
import type { CopyDayService } from './copyDay';
import type { DiaryService } from './diary';
import type { FastingService } from './fasting';
import type { FitCheckService } from './fitCheck';
import type { HomePrefsService } from './homePrefs';
import type { PlanBuilder } from './goals/planBuilder';
import type { RebuildService } from './goals/rebuild';
import type { TargetEditsService } from './goals/targetEdits';
import type { TuneUpRunner } from './goals/tuneUp';
import type { IngredientIntakeService } from './ingredientIntake';
import type { OnboardingService } from './onboarding';
import type { PhotoService } from './photos';
import type { ProfileEditsService } from './profileEdits';
import type { SavedMealsService } from './savedMeals';
import type { ProgressService } from './progress';
import type { ReprocessService } from './reprocess';
import type { WaterService } from './water';

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
  /** Settings › Personal info edits (P05-10); optional for the same reason. */
  readonly profileEdits?: ProfileEditsService;
  /** The Goals page's writes: targets, locks, its switches, nutrient goals (P05-11, P05-12). */
  readonly targetEdits?: TargetEditsService;
  /** Removes and reorders saved meals (P06-12); optional for the same reason. */
  readonly savedMeals?: SavedMealsService;
  /** Copies a day's entries onto another day (P06-13); optional for the same reason. */
  readonly copyDay?: CopyDayService;
  /** Barcode scanning, lookup and the label-scan hand-off (P06-14, P06-17); optional likewise. */
  readonly barcode?: BarcodeService;
  /** Parts of a reviewed meal from a photo or a description (P06-09); optional, as above. */
  readonly ingredientIntake?: IngredientIntakeService;
  /** The fit check's AI suggestion (P06-10); optional for the same reason. */
  readonly fitCheck?: FitCheckService;
  /** The entry editor's Reprocess (P06-11); optional for the same reason. */
  readonly reprocess?: ReprocessService;
  /** The Progress tab's writes: weigh-ins, the weight unit, Count today (P07-09, P07-12). */
  readonly progress?: ProgressService;
  /** Home's own choices: the pillars (P07-04); optional for the same reason. */
  readonly homePrefs?: HomePrefsService;
  /** Water logs for the shown day and the water settings (P07-06); optional for the same reason. */
  readonly water?: WaterService;
  /** Fasts, the fasting settings and "End fast and log" (P07-07); optional for the same reason. */
  readonly fasting?: FastingService;
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
