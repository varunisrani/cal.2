import { createContext, useContext, type ReactNode } from 'react';
import type { Clock } from '../lib/clock';
import type { AiSetupService } from './aiSetup';
import type { AnalysisService } from './analysis';
import type { AppSettingsService } from './appSettings';
import type { AutoBackupService } from './backup/auto';
import type { DriveBackupService } from './backup/drive';
import type { BackupService } from './backup/service';
import type { BarcodeService } from './barcode/lookup';
import type { CaptureDraftService } from './captureDrafts';
import type { CoachSession } from './coach/session';
import type { CombineService } from './combine';
import type { CopyDayService } from './copyDay';
import type { DamagedDataService } from './damagedData';
import type { DiaryService } from './diary';
import type { FastingService } from './fasting';
import type { FitCheckService } from './fitCheck';
import type { HealthService } from './health/service';
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
import type { CustomRemindersService } from './reminders/customReminders';
import type { ReminderEngine } from './reminders/engine';
import type { NotifyService } from './notifications/contract';
import type { Notifier } from './reminders/notifier';
import type { ReprocessService } from './reprocess';
import type { StorageNudge } from './storageNudge';
import type { TrackingSettingsService } from './trackingSettings';
import type { TransferService } from './transfer/transfer';
import type { WalkService } from './walks/service';
import type { WaterService } from './water';
import type { YourDataService } from './yourData';

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
  /**
   * The reminder engine (P09-08): one for the app, started by `main.tsx`. Erase everything stops
   * it; a restore or a permission the page re-read asks it to check again. Optional likewise.
   */
  readonly reminders?: ReminderEngine;
  /** Shows reminders as system notifications or banners, and the goal-weight alert (P09-09). */
  readonly notifier?: Notifier;
  /** Settings › Tracking & reminders: meal times and the reminder switches (P09-03, P09-09). */
  readonly trackingSettings?: TrackingSettingsService;
  /** The reminders the person writes (P13, D-16.93): Settings, and the Coach's Add. */
  readonly customReminders?: CustomRemindersService;
  /**
   * The Android app's nudges, notices and inbox (P17): only the Android app has it. Without it
   * Settings shows no Smart notifications and Home no card, bell or panel, as on the web.
   */
  readonly notify?: NotifyService;
  /** The Coach's one session, a turn per chat (P08-09, P16-02); optional likewise. */
  readonly coachSession?: CoachSession;
  /** Combines Home's picked rows into one entry (P06-19); optional for the same reason. */
  readonly combine?: CombineService;
  /** The diary file: export and import (P09-10, P09-11); optional for the same reason. */
  readonly transfer?: TransferService;
  /** Settings › App settings, Tab bar, Product details (P09-02/04/06); optional likewise. */
  readonly appSettings?: AppSettingsService;
  /** Backup files and restoring them (P09-13); optional for the same reason. */
  readonly backup?: BackupService;
  /**
   * Automatic backups into Documents/Platewise (P14, D-16.95): only the Android app has it.
   * Without it Your data shows no Automatic backup card, as on the web.
   */
  readonly autoBackup?: AutoBackupService;
  /**
   * Copies of backups in Google Drive (P15, D-16.97): only the Android app has it. Without it Your
   * data shows no Google Drive card and Welcome no Drive restore, as on the web.
   */
  readonly drive?: DriveBackupService;
  /** Settings › Your data: the storage card, Clear diary, Erase everything (P09-15); likewise. */
  readonly yourData?: YourDataService;
  /** The persistent-storage request and Home's storage cards (P09-15); optional likewise. */
  readonly storageNudge?: StorageNudge;
  /** Dismiss on the "some saved data could not be read" notice (K9); optional likewise. */
  readonly damagedData?: DamagedDataService;
  /**
   * Health Connect (P11-03): only the Android app has one. Without it Home, Progress and Settings
   * show no health features, as on the web.
   */
  readonly health?: HealthService;
  /**
   * The walk recorder (P15, D-16.96): only the Android app has one. Without it Home, the + menu
   * and Progress show no walk features, and `#/walk` goes Home, as on the web.
   */
  readonly walks?: WalkService;
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
