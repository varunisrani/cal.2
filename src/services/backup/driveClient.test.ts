// @vitest-environment node
// Node's own Blob, File and Response here, as in the other backup tests.
//
// The Drive client against the in-memory Drive of `testing/fakeDrive.ts`, which answers the
// requests a real Drive gets and keeps the `drive.file` rule (the app sees only what it made).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { FACTORY_NOW } from '../../test/factories';
import {
  DRIVE_CHUNK_BYTES,
  DRIVE_FOLDER_NAME,
  DRIVE_METADATA_TIMEOUT_MS,
  DRIVE_MULTIPART_LIMIT,
  DRIVE_TRANSFER_TIMEOUT_MS,
  DriveError,
  createDriveClient,
  driveProblemOf,
  type DriveFetch,
  type DriveTokens,
} from './driveClient';
import { fakeDrive, type FakeDrive } from './testing/fakeDrive';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');
const MINUTE = 60_000;
/** This install's id, and another phone's. */
const THIS_PHONE = 'this-phone';
const OLD_PHONE = 'old-phone';

/** `size` bytes that differ from one place to the next, so a misplaced byte shows. */
function bytes(size: number): Blob {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = (i * 31 + 7) % 251;
  return new Blob([data]);
}

async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  const [left, right] = [
    new Uint8Array(await a.arrayBuffer()),
    new Uint8Array(await b.arrayBuffer()),
  ];
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

function rig(options: { tokens?: DriveTokens; fetch?: (drive: FakeDrive) => DriveFetch } = {}) {
  const drive = fakeDrive(clock);
  const tokens: DriveTokens = options.tokens ?? {
    get: vi.fn(async () => 'token-1'),
    refresh: vi.fn(async () => 'token-1'),
  };
  const client = createDriveClient({
    fetch: options.fetch ? options.fetch(drive) : drive.fetch,
    tokens,
  });
  return { drive, client, tokens };
}

/** A backup this install put into Drive earlier, `minutesAgo` before now. */
function earlier(drive: FakeDrive, name: string, minutesAgo: number, extra = {}) {
  return drive.put({
    name,
    appProperties: { platewise: 'backup', platewiseInstall: THIS_PHONE },
    data: bytes(100 + minutesAgo),
    createdAt: FACTORY_NOW - minutesAgo * MINUTE,
    ...extra,
  });
}

async function failureOf(work: Promise<unknown>): Promise<DriveError> {
  const error = await work.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof DriveError)) throw new Error(`expected a DriveError, got ${error}`);
  return error;
}

describe('the Drive client: the folder (P15-04)', () => {
  it('finds or makes the "Platewise backups" folder once, and puts every backup in it', async () => {
    const { drive, client } = rig();

    await client.upload('platewise-backup-2026-10-26-1230.zip', bytes(10), THIS_PHONE);
    await client.upload('platewise-backup-2026-10-26-1231.zip', bytes(20), THIS_PHONE);

    expect(drive.log).toEqual([
      'list folder',
      'make folder',
      'multipart platewise-backup-2026-10-26-1230.zip',
      'multipart platewise-backup-2026-10-26-1231.zip',
    ]);
    const [folder] = drive.folders();
    expect(folder).toMatchObject({
      name: DRIVE_FOLDER_NAME,
      appProperties: { platewise: 'folder' },
    });
    expect(drive.backups().map((file) => file.parents)).toEqual([[folder!.id], [folder!.id]]);
  });

  it('uses the folder it made before, and never a folder someone else made', async () => {
    const { drive, client } = rig();
    drive.put({
      id: 'theirs',
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      byApp: false,
    });
    const ours = drive.put({
      id: 'ours',
      name: 'Renamed by the person',
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { platewise: 'folder' },
    });

    await client.upload('platewise-backup-2026-10-26-1230.zip', bytes(10), THIS_PHONE);

    expect(drive.log).not.toContain('make folder');
    expect(drive.backups()[0]?.parents).toEqual([ours.id]);
  });

  it('finds or makes the folder again when it was deleted while the app ran, once', async () => {
    const { drive, client } = rig();
    await client.upload('platewise-backup-2026-10-26-1230.zip', bytes(10), THIS_PHONE);
    drive.files.delete(drive.folders()[0]!.id);
    drive.log.length = 0;

    await client.upload('platewise-backup-2026-10-26-1231.zip', bytes(10), THIS_PHONE);

    expect(drive.log).toEqual([
      'multipart platewise-backup-2026-10-26-1231.zip',
      'list folder',
      'make folder',
      'multipart platewise-backup-2026-10-26-1231.zip',
    ]);
    expect(drive.backups()).toHaveLength(2);
  });
});

describe('the Drive client: uploads (P15-04)', () => {
  it('sends a backup of 5 MiB or less in one multipart request, tagged as a backup (ACC-M16-1)', async () => {
    const { drive, client } = rig();
    const data = bytes(DRIVE_MULTIPART_LIMIT);

    const file = await client.upload('platewise-backup-2026-10-26-1230.zip', data, THIS_PHONE);

    expect(drive.log.at(-1)).toBe('multipart platewise-backup-2026-10-26-1230.zip');
    const [stored] = drive.backups();
    expect(stored).toMatchObject({
      name: 'platewise-backup-2026-10-26-1230.zip',
      mimeType: 'application/zip',
      appProperties: { platewise: 'backup', platewiseInstall: THIS_PHONE },
    });
    expect(await sameBytes(stored!.data, data)).toBe(true);
    expect(file).toEqual({
      id: stored!.id,
      name: 'platewise-backup-2026-10-26-1230.zip',
      size: DRIVE_MULTIPART_LIMIT,
      createdAt: stored!.createdAt,
      install: THIS_PHONE,
    });
  });

  it('sends a larger backup through a resumable session (ACC-M16-1)', async () => {
    const { drive, client } = rig();
    const data = bytes(DRIVE_MULTIPART_LIMIT + 1);

    const file = await client.upload('platewise-backup-2026-10-26-1230.zip', data, THIS_PHONE);

    expect(drive.log.slice(2)).toEqual([
      `resumable platewise-backup-2026-10-26-1230.zip ${DRIVE_MULTIPART_LIMIT + 1}`,
      `session put 0+${DRIVE_MULTIPART_LIMIT + 1}`,
    ]);
    const [stored] = drive.backups();
    expect(stored).toMatchObject({
      mimeType: 'application/zip',
      appProperties: { platewise: 'backup', platewiseInstall: THIS_PHONE },
    });
    expect(await sameBytes(stored!.data, data)).toBe(true);
    expect(file.size).toBe(DRIVE_MULTIPART_LIMIT + 1);
  });

  it('sends a backup larger than one piece in pieces of 8 MiB', async () => {
    const { drive, client } = rig();
    const size = 2 * DRIVE_CHUNK_BYTES + 10;
    const data = bytes(size);

    await client.upload('platewise-backup-2026-10-26-1230.zip', data, THIS_PHONE);

    expect(drive.log.slice(3)).toEqual([
      `session put 0+${DRIVE_CHUNK_BYTES}`,
      `session put ${DRIVE_CHUNK_BYTES}+${DRIVE_CHUNK_BYTES}`,
      `session put ${2 * DRIVE_CHUNK_BYTES}+10`,
    ]);
    expect(await sameBytes(drive.backups()[0]!.data, data)).toBe(true);
  });

  it('asks a resumable session how far it got after the connection dropped, then sends the rest', async () => {
    const { drive, client } = rig();
    const size = DRIVE_MULTIPART_LIMIT + 4096;
    const data = bytes(size);
    drive.dropAfter = 1_000_000;

    await client.upload('platewise-backup-2026-10-26-1230.zip', data, THIS_PHONE);

    expect(drive.log.slice(3)).toEqual([
      `session put 0+${size}`,
      'session status 1000000',
      `session put 1000000+${size - 1_000_000}`,
    ]);
    expect(await sameBytes(drive.backups()[0]!.data, data)).toBe(true);
  });

  it('says the Drive is full, for a small and for a large backup', async () => {
    const { drive, client } = rig();
    drive.quotaBytes = 1000;

    const small = await failureOf(client.upload('a.zip', bytes(2000), THIS_PHONE));
    const large = await failureOf(
      client.upload('b.zip', bytes(DRIVE_MULTIPART_LIMIT + 1), THIS_PHONE),
    );

    expect([small.problem, large.problem]).toEqual(['quota', 'quota']);
    expect(drive.backups()).toEqual([]);
  });

  it('says offline when a request gets no answer at all', async () => {
    const { drive, client } = rig();
    drive.offline = true;

    const error = await failureOf(client.upload('a.zip', bytes(10), THIS_PHONE));

    expect(error.problem).toBe('offline');
    expect(driveProblemOf(error)).toBe('offline');
    expect(driveProblemOf(new Error('anything else'))).toBe('failed');
  });

  it('calls a server error a plain failure', async () => {
    const { client } = rig({
      fetch: (drive) => async (url, init) =>
        url.includes('uploadType=multipart')
          ? new Response('busy', { status: 503 })
          : drive.fetch(url, init),
    });

    expect((await failureOf(client.upload('a.zip', bytes(10), THIS_PHONE))).problem).toBe('failed');
  });
});

describe('the Drive client: tokens (P15-04)', () => {
  it('refreshes the token once on a 401 and repeats the request (ACC-M16-3)', async () => {
    const tokens = {
      get: vi.fn(async () => 'expired'),
      refresh: vi.fn(async () => 'token-1'),
    };
    const { drive, client } = rig({ tokens });

    const listed = await client.list();

    expect(listed).toEqual([]);
    expect(tokens.refresh).toHaveBeenCalledTimes(1);
    expect(drive.log).toEqual(['401 GET /drive/v3/files', 'list backups']);
  });

  it('asks to sign in again when Drive refuses the refreshed token too', async () => {
    const tokens = {
      get: vi.fn(async () => 'expired'),
      refresh: vi.fn(async () => 'also-refused'),
    };
    const { client } = rig({ tokens });

    const error = await failureOf(client.upload('a.zip', bytes(10), THIS_PHONE));

    expect(error.problem).toBe('signIn');
    expect(tokens.refresh).toHaveBeenCalledTimes(1);
  });

  it('passes on a token source that cannot sign in', async () => {
    const tokens = {
      get: vi.fn(async (): Promise<string> => {
        throw new DriveError('signIn');
      }),
      refresh: vi.fn(async () => 'token-1'),
    };
    const { drive, client } = rig({ tokens });

    expect((await failureOf(client.list())).problem).toBe('signIn');
    expect(drive.log).toEqual([]);
  });
});

describe('the Drive client: listing, downloading, deleting and keeping 7 (P15-04)', () => {
  it('lists only the backups it made, newest first, across pages', async () => {
    const { drive, client } = rig();
    const oldest = earlier(drive, 'platewise-backup-2026-10-24-0900.zip', 3000);
    const newest = earlier(drive, 'platewise-backup-2026-10-26-1200.zip', 30);
    const middle = earlier(drive, 'platewise-backup-2026-10-25-0900.zip', 1500, {
      appProperties: { platewise: 'backup', platewiseInstall: OLD_PHONE },
    });
    // Someone else's backup: not visible through drive.file.
    earlier(drive, 'platewise-backup-2026-10-26-1229.zip', 1, { byApp: false });
    // A file the app can see that is not one of its backups, and one in the trash.
    drive.put({ name: 'notes.zip', createdAt: FACTORY_NOW });
    earlier(drive, 'platewise-backup-2026-10-26-1100.zip', 90, { trashed: true });
    drive.pageSize = 2;

    const listed = await client.list();

    expect(listed.map((file) => file.id)).toEqual([newest.id, middle.id, oldest.id]);
    expect(listed[0]).toEqual({
      id: newest.id,
      name: 'platewise-backup-2026-10-26-1200.zip',
      size: 130,
      createdAt: FACTORY_NOW - 30 * MINUTE,
      install: THIS_PHONE,
    });
    // Another phone's copy is listed too, with its install.
    expect(listed[1]?.install).toBe(OLD_PHONE);
    expect(drive.log).toEqual(['list backups', 'list backups']);
  });

  it('downloads a backup as a File named after it', async () => {
    const { drive, client } = rig();
    const stored = earlier(drive, 'platewise-backup-2026-10-26-1200.zip', 30);

    const file = await client.download({ id: stored.id, name: stored.name });

    expect(file.name).toBe('platewise-backup-2026-10-26-1200.zip');
    expect(file.type).toBe('application/zip');
    expect(await sameBytes(file, stored.data)).toBe(true);
  });

  it('says a backup deleted in Drive is missing', async () => {
    const { client } = rig();

    const error = await failureOf(client.download({ id: 'gone', name: 'gone.zip' }));

    expect(error.problem).toBe('missing');
  });

  it('deletes a file, and one already gone is fine', async () => {
    const { drive, client } = rig();
    const stored = earlier(drive, 'platewise-backup-2026-10-26-1200.zip', 30);

    await client.remove(stored.id);
    await client.remove(stored.id);

    expect(drive.files.has(stored.id)).toBe(false);
    expect(drive.log).toEqual([`delete ${stored.id}`, `delete ${stored.id}`]);
  });

  it('keeps this phone’s newest 7 and never deletes another phone’s copies or a file it did not make (ACC-M16-2)', async () => {
    const { drive, client } = rig();
    const ours = Array.from({ length: 9 }, (_, i) =>
      earlier(drive, `platewise-backup-2026-10-${String(17 + i)}-0900.zip`, (9 - i) * 1440),
    );
    // An old phone's copies, older and newer than ours, and a copy without an install.
    const oldPhone = [20_000, 10, 30_000].map((minutesAgo) =>
      earlier(drive, 'platewise-backup-2026-10-10-0900.zip', minutesAgo, {
        appProperties: { platewise: 'backup', platewiseInstall: OLD_PHONE },
      }),
    );
    const noInstall = earlier(drive, 'platewise-backup-2026-10-05-0900.zip', 35_000, {
      appProperties: { platewise: 'backup' },
    });
    const theirs = earlier(drive, 'platewise-backup-2026-10-01-0900.zip', 40_000, {
      byApp: false,
    });
    const untagged = drive.put({ name: 'platewise-backup-2026-10-02-0900.zip', createdAt: 0 });

    const removed = await client.prune(7, THIS_PHONE);

    expect(removed).toEqual([ours[1]!.id, ours[0]!.id]);
    const left = new Set(drive.backups().map((file) => file.id));
    expect(ours.slice(2).every((file) => left.has(file.id))).toBe(true);
    expect(oldPhone.every((file) => left.has(file.id))).toBe(true);
    expect(left.has(noInstall.id)).toBe(true);
    expect(drive.files.has(theirs.id)).toBe(true);
    expect(drive.files.has(untagged.id)).toBe(true);
  });
});

describe('the Drive client: requests that get no answer (P15-04)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A Drive whose matching requests never answer, until the client gives up on them. */
  function stalled(stall: (method: string, url: string) => boolean) {
    const reached: string[] = [];
    const setup = rig({
      fetch: (drive) => (url, init) => {
        if (!stall(init?.method ?? 'GET', url)) return drive.fetch(url, init);
        reached.push(url);
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      },
    });
    return { ...setup, reached };
  }

  it('gives up on a small call after 30 s, as a plain failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { client, reached } = stalled((method, url) => method === 'GET' && url.includes('q='));

    const listing = failureOf(client.list());
    await vi.advanceTimersByTimeAsync(DRIVE_METADATA_TIMEOUT_MS - 1);
    expect(reached).toHaveLength(1);
    let settled = false;
    void listing.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect((await listing).problem).toBe('failed');
  });

  it('gives up on an upload piece or a download after 120 s, as a plain failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { drive, client, reached } = stalled(
      (method, url) => method === 'PUT' || url.includes('alt=media'),
    );
    const stored = earlier(drive, 'platewise-backup-2026-10-26-1200.zip', 30);

    const uploading = failureOf(
      client.upload(
        'platewise-backup-2026-10-26-1230.zip',
        bytes(DRIVE_MULTIPART_LIMIT + 1),
        THIS_PHONE,
      ),
    );
    await vi.advanceTimersByTimeAsync(DRIVE_TRANSFER_TIMEOUT_MS - 1);
    expect(reached.filter((url) => url.includes('upload_id'))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await uploading).problem).toBe('failed');

    const downloading = failureOf(client.download({ id: stored.id, name: stored.name }));
    await vi.advanceTimersByTimeAsync(DRIVE_TRANSFER_TIMEOUT_MS);
    expect((await downloading).problem).toBe('failed');
    expect(drive.backups().map((file) => file.id)).toEqual([stored.id]);
  });
});
