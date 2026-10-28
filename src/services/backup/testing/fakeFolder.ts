// Test helper: the backup folder in memory. Files carry their bytes and the fake clock's time; a
// test can put in files the app did not write, refuse the permission (and count the questions),
// fill the disk, or make the next operation of a kind fail.

import type { Clock } from '../../../lib/clock';
import {
  FolderError,
  type BackupFolder,
  type FolderAccess,
  type FolderFile,
  type FolderProblem,
} from '../folder';
import { ZIP_TYPE } from '../zip';

type Operation = 'write' | 'list' | 'remove' | 'read';

export interface FakeFolder extends BackupFolder {
  /** The files by name. */
  readonly files: Map<string, { readonly data: Blob; readonly modifiedAt: number }>;
  /** The permission as Android would answer it now. */
  permission: FolderAccess;
  /** What the person answers when asked; `granted` by default. */
  answer: FolderAccess;
  /** How many times the person was asked. */
  asked: number;
  /** The next operations of these kinds fail with these problems, once each. */
  readonly failNext: Map<Operation, FolderProblem>;
  /** Every operation, in order: `write <name>`, `remove <name>`, `list`, `read <name>`. */
  readonly log: string[];
  /** Puts a file in as another app (or the person) would. */
  put(name: string, data?: Blob | string, modifiedAt?: number): void;
  /** The names in the folder, sorted. */
  names(): string[];
}

export function fakeFolder(clock: Pick<Clock, 'now'>): FakeFolder {
  const files = new Map<string, { data: Blob; modifiedAt: number }>();
  const failNext = new Map<Operation, FolderProblem>();
  const log: string[] = [];

  function check(operation: Operation): void {
    const problem = failNext.get(operation);
    if (problem) {
      failNext.delete(operation);
      throw new FolderError(problem);
    }
    if (folder.permission !== 'granted') throw new FolderError('denied');
  }

  const folder: FakeFolder = {
    files,
    permission: 'granted',
    answer: 'granted',
    asked: 0,
    failNext,
    log,

    put(name, data = 'not ours', modifiedAt = clock.now()) {
      files.set(name, { data: typeof data === 'string' ? new Blob([data]) : data, modifiedAt });
    },

    names() {
      return [...files.keys()].sort();
    },

    async access(ask) {
      if (folder.permission === 'granted' || !ask) return folder.permission;
      folder.asked++;
      folder.permission = folder.answer;
      return folder.permission;
    },

    async write(name, data) {
      log.push(`write ${name}`);
      check('write');
      files.set(name, { data, modifiedAt: clock.now() });
    },

    async list(): Promise<readonly FolderFile[]> {
      log.push('list');
      check('list');
      return [...files].map(([name, file]) => ({
        name,
        size: file.data.size,
        modifiedAt: file.modifiedAt,
      }));
    },

    async remove(name) {
      log.push(`remove ${name}`);
      check('remove');
      files.delete(name);
    },

    async read(name) {
      log.push(`read ${name}`);
      check('read');
      const file = files.get(name);
      if (!file) throw new FolderError('missing');
      return new File([file.data], name, { type: ZIP_TYPE });
    },
  };
  return folder;
}
