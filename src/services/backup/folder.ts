// The backup folder of the Android app (P14-01, D-16.95): `Documents/Platewise` in the phone's
// shared storage, where automatic backups are written. It stays when the app is uninstalled, and
// Files or Google Drive can reach it. This is the port the automatic backup works through;
// `nativeFolder.ts` is Android's (fetched only inside the Android app), `testing/fakeFolder.ts`
// the tests'.

/** The folder's name inside the phone's Documents. */
export const BACKUP_FOLDER = 'Platewise';

/** Whether the app may use the folder. */
export type FolderAccess = 'granted' | 'denied';

/** A file in the folder. */
export interface FolderFile {
  readonly name: string;
  /** Bytes. */
  readonly size: number;
  /** When it was last written, epoch ms. */
  readonly modifiedAt: number;
}

/** Why a folder operation failed. */
export type FolderProblem =
  /** The phone's storage is full. */
  | 'noSpace'
  /** Android refused (no storage permission on Android 8–10, or a file of another app). */
  | 'denied'
  /** No such file (or folder). */
  | 'missing'
  | 'failed';

/** A folder operation that failed, and why. */
export class FolderError extends Error {
  override readonly name = 'FolderError';
  readonly problem: FolderProblem;

  constructor(problem: FolderProblem, cause?: unknown) {
    super(`The backup folder refused the operation (${problem})`, { cause });
    this.problem = problem;
  }
}

export interface BackupFolder {
  /**
   * Whether the app may use the folder. With `ask`, Android may first ask the person (only
   * Android 8–10 have a question; from Android 11 the app may always use its own files there).
   */
  access(ask: boolean): Promise<FolderAccess>;
  /** Writes `data` as `name`, replacing a file of that name. Rejects with a `FolderError`. */
  write(name: string, data: Blob): Promise<void>;
  /** The files in the folder; none when it does not exist yet. Rejects with a `FolderError`. */
  list(): Promise<readonly FolderFile[]>;
  /** Deletes one file; one already gone is fine. Rejects with a `FolderError`. */
  remove(name: string): Promise<void>;
  /** One file's bytes, as a `File` called `name`. Rejects with a `FolderError`. */
  read(name: string): Promise<File>;
}

/** `error` as a `FolderError`; anything else counts as `failed`. */
export function folderProblemOf(error: unknown): FolderProblem {
  return error instanceof FolderError ? error.problem : 'failed';
}
