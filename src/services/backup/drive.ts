// Copies of backups in the person's Google Drive (P15-04, D-16.97), in the Android app only. Once
// connected, every backup the app makes is also put into a "Platewise backups" folder in their
// Drive: each automatic backup once it is written to Documents › Platewise (`onChecked` of
// `auto.ts`), and each Back up now. Each copy carries this install's id; the newest 7 copies this
// install made are kept there. Copies another phone made are listed and can be restored, but are
// never deleted, so a new phone never pushes out what a lost one left; nothing else in the Drive is
// ever touched (`driveClient.ts`).
//
// Sign-in is Android's: `connect` asks Google with its own screens (`authorize`, interactive);
// later tokens come silently, and a token Drive refuses is refreshed once. Nothing is uploaded
// before setup is finished (connecting on Welcome to restore never sends the empty phone), while a
// restore runs, or for a backup made before everything was erased (R06.5).
//
// An upload that fails (no connection, Google no longer lets the app in, a full Drive) is stored
// with its time in `backup.drive` for the card, and the next start or return to the front (the
// automatic backup's check) makes a fresh backup and tries again, unless a copy went up in the
// meantime. Uploads run one at a time, in order. Nothing here rejects into the app.

import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { DriveBackupState, DriveUploadProblem } from '../../data/settingsSchema';
import type { Clock } from '../../lib/clock';
import { newId, type IdSource } from '../../lib/ids';
import { err, ok, type Result } from '../../lib/result';
import { autoBackupFileName } from './auto';
import {
  DriveError,
  createDriveClient,
  driveProblemOf,
  type DriveFetch,
  type DriveFile,
  type DriveProblem,
} from './driveClient';
import { driveErrorCode, type DriveGrant, type DrivePlugin } from './drivePlugin';
import type { BackupService, HeldBackup } from './service';

export type { DriveFile, DriveProblem } from './driveClient';

/** How many of its own copies an install keeps in Drive. */
export const DRIVE_BACKUPS_KEPT = 7;

/** How Connect ended. */
export type DriveConnectOutcome =
  | 'connected'
  /** This copy of Platewise is not registered with Google (no OAuth client for it). */
  | 'notConfigured'
  /** The person closed Google's screens. */
  | 'cancelled'
  /** Google Play services are missing or too old on this phone. */
  | 'unavailable'
  | 'failed';

/** How an upload ended. */
export type DriveUploadOutcome =
  | 'uploaded'
  | 'notConnected'
  /** Setup is not finished. */
  | 'notReady'
  /** A restore is running or waiting. */
  | 'restoring'
  /** Nothing is owed: the last copy went up. */
  | 'notNeeded'
  /** Everything was erased after the backup was made: nothing sent or recorded. */
  | 'invalidated'
  /** Not uploaded; the reason is stored in `backup.drive`. */
  | 'failed';

/** Why a listed copy could not be downloaded. */
export type DriveOpenProblem = Exclude<DriveProblem, 'quota'>;

/** What the card shows besides the settings. */
export interface DriveBackupStatus {
  /** A copy is being made or sent now. */
  readonly uploading: boolean;
  /** The copies in Drive, newest first; null until listed (or while not connected). */
  readonly files: readonly DriveFile[] | null;
  /** Why the last listing failed; null once one works. */
  readonly listProblem: DriveProblem | null;
}

export interface DriveBackupService {
  /** Asks Google (its own screens) and stores the account. Never rejects. */
  connect(): Promise<DriveConnectOutcome>;
  /** Signs out of Google and forgets the account; the copies stay in Drive. Never rejects. */
  disconnect(): Promise<void>;
  /** A backup just made (Back up now): copied to Drive when connected. Never rejects. */
  afterBackup(made: HeldBackup): Promise<DriveUploadOutcome>;
  /** After the automatic backup's check: its file, or a retry of a failed copy. Never rejects. */
  afterCheck(written: HeldBackup | null): Promise<DriveUploadOutcome>;
  /** Makes a backup and copies it to Drive. Never rejects. */
  uploadNow(): Promise<DriveUploadOutcome>;
  /** Lists the copies in Drive again for the card. Never rejects. */
  refresh(): Promise<void>;
  /** One listed copy, downloaded for the restore sheet. Never rejects. */
  open(id: string): Promise<Result<File, DriveOpenProblem>>;
  /** Calls `listener` when `getSnapshot` changes; returns the stop. */
  subscribe(listener: () => void): () => void;
  /** The same object until something changes. */
  getSnapshot(): DriveBackupStatus;
}

export interface DriveBackupDeps {
  /** Android's Google sign-in. */
  readonly plugin: DrivePlugin;
  /** The page's fetch, handed over by the composition root. */
  readonly fetch: DriveFetch;
  readonly backup: Pick<BackupService, 'make' | 'restoring' | 'isCurrent'>;
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'set' | 'update'>;
  readonly clock: Clock;
  /** Whether the page has a connection; `navigator.onLine` by default. */
  readonly online?: () => boolean;
  /** Makes this install's id at its first upload; random UUIDs by default. */
  readonly newId?: IdSource;
  /** Where a failure is reported; the console by default. */
  readonly onError?: (message: string, error?: unknown) => void;
}

const DISCONNECTED: Omit<DriveBackupState, 'installId'> = {
  connected: false,
  email: null,
  lastUploadAt: null,
  problem: null,
};

function reportToConsole(message: string, error?: unknown): void {
  console.error(`Platewise: ${message}`, ...(error === undefined ? [] : [error]));
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** The stored reason for a failed upload. */
function uploadProblem(problem: DriveProblem): DriveUploadProblem {
  return problem === 'missing' ? 'failed' : problem;
}

export function createDriveBackup(deps: DriveBackupDeps): DriveBackupService {
  const { plugin, backup, settingsRepo, clock } = deps;
  const report = deps.onError ?? reportToConsole;
  const online = deps.online ?? browserOnline;
  const makeId = deps.newId ?? newId;
  const listeners = new Set<() => void>();
  let status: DriveBackupStatus = { uploading: false, files: null, listProblem: null };
  let token: string | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  /** The newest listing; an older one that answers late is dropped. */
  let listing = 0;

  async function signInSilently(): Promise<string> {
    try {
      token = (await plugin.authorize({ interactive: false })).accessToken;
      return token;
    } catch (error) {
      token = null;
      // Google wants the person again (a revoked grant, a client gone): connect again. Play
      // services missing or busy, or anything else: a plain failure, tried again later.
      const code = driveErrorCode(error);
      const problem: DriveProblem = !online()
        ? 'offline'
        : code === 'cancelled' || code === 'notConfigured'
          ? 'signIn'
          : 'failed';
      throw new DriveError(problem, `silent sign-in ${code}`, error);
    }
  }

  const client = createDriveClient({
    fetch: deps.fetch,
    tokens: { get: async () => token ?? signInSilently(), refresh: signInSilently },
  });

  function show(change: Partial<DriveBackupStatus>): void {
    status = { ...status, ...change };
    for (const listener of [...listeners]) listener();
  }

  function changeState(change: (current: DriveBackupState) => DriveBackupState) {
    return settingsRepo.update('backup.drive', change);
  }

  async function failed(problem: DriveProblem, error?: unknown): Promise<'failed'> {
    report(`the Google Drive copy did not go up (${problem})`, error);
    const at = clock.now();
    await changeState((current) =>
      current.connected ? { ...current, problem: { kind: uploadProblem(problem), at } } : current,
    );
    return 'failed';
  }

  /** This install's id, made and stored at the first upload. */
  async function installId(): Promise<string> {
    const stored = (await settingsRepo.get('backup.drive')).installId;
    if (stored) return stored;
    const state = await changeState((current) =>
      current.installId ? current : { ...current, installId: makeId() },
    );
    if (!state.installId) throw new Error('the install id was not stored');
    return state.installId;
  }

  /** Sends one made backup up, keeps this install's newest 7, and records how it went. */
  async function send(made: HeldBackup): Promise<DriveUploadOutcome> {
    if (!(await settingsRepo.get('backup.drive')).connected) return 'notConnected';
    if (!backup.isCurrent(made)) return 'invalidated';
    show({ uploading: true });
    const install = await installId();
    try {
      await client.upload(autoBackupFileName(made.madeAt), made.file, install);
    } catch (error) {
      return failed(driveProblemOf(error), error);
    }
    // Erased while it went up: the device's state is going; record nothing.
    if (!backup.isCurrent(made)) return 'invalidated';
    await changeState((current) =>
      current.connected ? { ...current, lastUploadAt: clock.now(), problem: null } : current,
    );
    await client.prune(DRIVE_BACKUPS_KEPT, install).catch((error: unknown) => {
      // Not an upload failure: the next upload prunes again.
      report('old Google Drive copies could not be deleted', error);
    });
    return 'uploaded';
  }

  /** Makes a backup now and sends it; with `owed`, only when the last copy failed. */
  async function fresh(owed: boolean): Promise<DriveUploadOutcome> {
    const state = await settingsRepo.get('backup.drive');
    if (!state.connected) return 'notConnected';
    if (owed && state.problem === null) return 'notNeeded';
    if (!(await settingsRepo.get('onboarding.done'))) return 'notReady';
    if (backup.restoring()) return 'restoring';
    show({ uploading: true });
    // A whole backup is costly to make: not while it could not go up anyway.
    if (!online()) return failed('offline');
    try {
      await (token ?? signInSilently());
    } catch (error) {
      return failed(driveProblemOf(error), error);
    }
    const made = await backup.make();
    if (!made.ok) return failed('failed', made.error);
    const outcome = await send(made.value);
    if (outcome === 'uploaded') {
      // A backup made and kept, like one made by hand: it counts as the last backup.
      await settingsRepo.set('backup.lastAt', made.value.madeAt).catch((error: unknown) => {
        report('the backup time could not be saved', error);
      });
    }
    return outcome;
  }

  /** Runs `work` after every upload before it; never rejects. */
  function job(work: () => Promise<DriveUploadOutcome>): Promise<DriveUploadOutcome> {
    const run = tail.then(async (): Promise<DriveUploadOutcome> => {
      try {
        return await work();
      } catch (error) {
        report('the Google Drive copy failed', error);
        return failed('failed').catch((cause: unknown) => {
          report('the Google Drive failure could not be stored', cause);
          return 'failed' as const;
        });
      } finally {
        if (status.uploading) show({ uploading: false });
      }
    });
    tail = run;
    return run.then(async (outcome) => {
      if (outcome === 'uploaded') await refresh();
      return outcome;
    });
  }

  async function refresh(): Promise<void> {
    const ticket = ++listing;
    try {
      const { connected } = await settingsRepo.get('backup.drive');
      const files = connected ? await client.list() : null;
      if (ticket === listing) show({ files, listProblem: null });
    } catch (error) {
      report('the Google Drive copies could not be listed', error);
      if (ticket === listing) show({ listProblem: driveProblemOf(error) });
    }
  }

  const retry = () => job(() => fresh(true));

  return {
    async connect() {
      let grant: DriveGrant;
      try {
        grant = await plugin.authorize({ interactive: true });
      } catch (error) {
        const code = driveErrorCode(error);
        if (code !== 'cancelled') report(`Google Drive could not be connected (${code})`, error);
        return code === 'unknown' ? 'failed' : code;
      }
      token = grant.accessToken;
      client.forget();
      // Google may sign in without naming the account: Drive itself knows it.
      const email =
        grant.email ??
        (await client.account().catch((error: unknown) => {
          report('the Google Drive account could not be read', error);
          return null;
        }));
      try {
        const state = await changeState((current) => ({
          connected: true,
          email,
          lastUploadAt: current.email === email ? current.lastUploadAt : null,
          // A copy still owed goes to this account.
          problem: current.problem,
          installId: current.installId,
        }));
        void refresh();
        if (state.problem) void retry();
        return 'connected';
      } catch (error) {
        report('the Google Drive account could not be saved', error);
        return 'failed';
      }
    },

    async disconnect() {
      await plugin.signOut().catch((error: unknown) => {
        report('Google could not be signed out', error);
      });
      token = null;
      client.forget();
      listing++;
      show({ files: null, listProblem: null });
      // The install keeps its id: its copies already in Drive stay its own.
      await changeState((current) => ({ ...DISCONNECTED, installId: current.installId })).catch(
        (error: unknown) => {
          report('the Google Drive account could not be forgotten', error);
        },
      );
    },

    afterBackup: (made) => job(() => send(made)),

    afterCheck: (written) => (written ? job(() => send(written)) : retry()),

    uploadNow: () => job(() => fresh(false)),

    refresh,

    async open(id) {
      const file = status.files?.find((listed) => listed.id === id);
      if (!file) return err('missing');
      try {
        return ok(await client.download(file));
      } catch (error) {
        report('a Google Drive copy could not be downloaded', error);
        void refresh();
        const problem = driveProblemOf(error);
        return err(problem === 'quota' ? 'failed' : problem);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot: () => status,
  };
}
