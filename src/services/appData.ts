// Opening the app's data for the shell: the database, then the settings and profile
// repositories, reduced to what the shell reads. Screens may not import the database or the
// repositories (lint rule 2), so they receive this through the shell's context. The data hooks
// of P02-15 will wrap or replace it.

import { appBus } from '../data/bus';
import { DbOpenError, openDb, type DbOpenErrorKind, type OpenOptions } from '../data/db';
import type { LiveFeed } from '../data/live';
import { createProfileRepo, type ProfileRead } from '../data/repos/profileRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import type { HideableTab, Settings } from '../data/settingsSchema';

export type { ProfileRead } from '../data/repos/profileRepo';

/** Why the database could not be opened (`DbOpenError` kinds). */
export type OpenProblem = DbOpenErrorKind;

export interface AppSettings {
  /** Every setting, live: loading until the table has really been read (R06.22). */
  readonly feed: LiveFeed<Settings>;
  /** The latest snapshot, or null while the first read has not finished. */
  snapshot(): Settings | null;
  /** Hides or shows one tab, keeping every other tab's stored state (R05.13). */
  toggleHiddenTab(tab: HideableTab, hidden: boolean): Promise<readonly HideableTab[]>;
}

export interface AppProfile {
  /** The profile, live: loading until the first read, then missing, ok or corrupt (R05.12). */
  readonly feed: LiveFeed<ProfileRead>;
  get(): Promise<ProfileRead>;
}

/** What the shell reads: settings and the profile. */
export interface AppData {
  readonly settings: AppSettings;
  readonly profile: AppProfile;
}

export type AppOpening =
  | {
      readonly kind: 'open';
      readonly data: AppData;
      /** Stops the settings snapshot and closes the database (tests, a later erase). */
      close(): void;
    }
  | { readonly kind: 'failed'; readonly problem: OpenProblem };

/** Opens the database and the repositories the shell needs. Never rejects. */
export async function connectAppData(options: OpenOptions = {}): Promise<AppOpening> {
  let db: Awaited<ReturnType<typeof openDb>>;
  try {
    db = await openDb(options);
  } catch (error) {
    return { kind: 'failed', problem: error instanceof DbOpenError ? error.kind : 'failed' };
  }
  const settings = createSettingsRepo(db, { bus: options.bus ?? appBus() });
  const profile = createProfileRepo(db);
  return {
    kind: 'open',
    data: {
      settings: {
        feed: settings.feed,
        snapshot: settings.snapshot,
        toggleHiddenTab: settings.toggleHiddenTab,
      },
      profile: { feed: profile.feed, get: profile.get },
    },
    close() {
      settings.close();
      db.close();
    },
  };
}

let opening: Promise<AppOpening> | null = null;

/** The page's one opening of the app's database; every caller gets the same answer. */
export function openAppData(): Promise<AppOpening> {
  opening ??= connectAppData();
  return opening;
}
