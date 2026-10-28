// @vitest-environment node
// The Android backup folder against a stand-in for `@capacitor/filesystem`: the paths and the
// directory it is called with, the base64 pieces, the listing, the permission, the WebView route
// a file is read back through, and the plugin's errors as the app reads them. No JVM.

import { describe, expect, it, vi } from 'vitest';
import type { FileInfo } from '@capacitor/filesystem';
import { FolderError } from './folder';
import {
  PIECE_BYTES,
  nativeBackupFolder,
  problemOf,
  type FilesPlugin,
  type ReadEnv,
} from './nativeFolder';

const registered = vi.hoisted(() => ({ names: [] as string[] }));

vi.mock('@capacitor/core', () => ({
  registerPlugin: (name: string) => {
    registered.names.push(name);
    return {};
  },
  Capacitor: { convertFileSrc: (uri: string) => uri },
}));

/** A plugin error as Capacitor hands it to the page: a message and the plugin's code. */
function pluginError(message: string, code?: string): Error {
  return Object.assign(new Error(message), code ? { code } : {});
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Small pieces, so the tests move few bytes; the app's are 3 MiB. */
const PIECE = 6;

/** The plugin over files in memory, by path; every call is recorded. */
function fakePlugin(options: { granted?: boolean; answer?: boolean } = {}) {
  const files = new Map<string, Uint8Array>();
  const calls: { method: string; options?: Record<string, unknown> }[] = [];
  const state = { granted: options.granted ?? true };
  const permission = () => ({ publicStorage: state.granted ? 'granted' : 'denied' }) as const;
  const plugin = {
    checkPermissions: vi.fn(async () => {
      calls.push({ method: 'checkPermissions' });
      return permission();
    }),
    requestPermissions: vi.fn(async () => {
      calls.push({ method: 'requestPermissions' });
      state.granted = options.answer ?? true;
      return permission();
    }),
    writeFile: vi.fn(async (given: { path: string; data: string | Blob }) => {
      calls.push({ method: 'writeFile', options: given });
      files.set(given.path, fromBase64(given.data as string));
      return { uri: `file:///storage/emulated/0/Documents/${given.path}` };
    }),
    appendFile: vi.fn(async (given: { path: string; data: string }) => {
      calls.push({ method: 'appendFile', options: given });
      const before = files.get(given.path) ?? new Uint8Array();
      const piece = fromBase64(given.data);
      const joined = new Uint8Array(before.length + piece.length);
      joined.set(before);
      joined.set(piece, before.length);
      files.set(given.path, joined);
    }),
    readdir: vi.fn(async (given: { path: string }) => {
      calls.push({ method: 'readdir', options: given });
      const prefix = `${given.path}/`;
      const inside = [...files].filter(([path]) => path.startsWith(prefix));
      if (inside.length === 0) {
        throw pluginError(
          "'readdir' failed because file at 'Platewise' does not exist.",
          'OS-PLUG-FILE-0008',
        );
      }
      return {
        files: inside.map(([path, bytes]): FileInfo => ({
          name: path.slice(prefix.length),
          type: 'file',
          size: bytes.length,
          mtime: 1_761_500_000_000,
          ctime: 1_761_400_000_000,
          uri: `file:///storage/emulated/0/Documents/${path}`,
        })),
      };
    }),
    deleteFile: vi.fn(async (given: { path: string }) => {
      calls.push({ method: 'deleteFile', options: given });
      if (!files.delete(given.path)) {
        throw pluginError(
          `'deleteFile' failed because file at '${given.path}' does not exist.`,
          'OS-PLUG-FILE-0008',
        );
      }
    }),
    getUri: vi.fn(async (given: { path: string }) => {
      calls.push({ method: 'getUri', options: given });
      return { uri: `file:///storage/emulated/0/Documents/${given.path}` };
    }),
  };
  return { plugin, files, calls, state };
}

/** The WebView's route to local files over the fake plugin's files. */
function fakeRead(files: Map<string, Uint8Array>): ReadEnv & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    convertFileSrc: (uri) => uri.replace('file://', 'https://localhost/_capacitor_file_'),
    fetch: async (url) => {
      urls.push(url);
      const path = url.replace(
        'https://localhost/_capacitor_file_/storage/emulated/0/Documents/',
        '',
      );
      const bytes = files.get(path);
      return bytes
        ? new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), { status: 200 })
        : new Response(null, { status: 404 });
    },
  };
}

function bytesOfLength(length: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length }, (_, index) => (index * 7) % 256);
}

const NAME = 'platewise-backup-2026-10-26-1230.zip';

/** For tests that read nothing back. */
const NO_READ: ReadEnv = { fetch: () => Promise.reject(new Error('no reads here')) };

describe('nativeBackupFolder (P14-01)', () => {
  it('registers the plugin the Android shell adds as Filesystem', async () => {
    const { nativeFilesPlugin } = await import('./nativeFolder');
    nativeFilesPlugin();
    expect(registered.names).toEqual(['Filesystem']);
  });

  it('writes in pieces of 3 MiB, a multiple of 3 bytes so only the last piece is padded', () => {
    expect(PIECE_BYTES).toBe(3 * 1024 * 1024);
    expect(PIECE_BYTES % 3).toBe(0);
  });

  it('writes Documents/Platewise/<name> in base64 pieces, the first replacing, the rest appended', async () => {
    const { plugin, files, calls } = fakePlugin();
    const folder = nativeBackupFolder(fakeRead(files), plugin as unknown as FilesPlugin, PIECE);
    const bytes = bytesOfLength(2 * PIECE + 5);

    await folder.write(NAME, new Blob([bytes]));

    const writes = calls.filter((call) => call.method !== 'checkPermissions');
    expect(writes.map((call) => call.method)).toEqual(['writeFile', 'appendFile', 'appendFile']);
    expect(writes[0]!.options).toMatchObject({
      path: `Platewise/${NAME}`,
      directory: 'DOCUMENTS',
      recursive: true,
    });
    expect(writes[1]!.options).toMatchObject({ path: `Platewise/${NAME}`, directory: 'DOCUMENTS' });
    // Each piece but the last is whole, so its base64 has no padding.
    expect((writes[0]!.options!.data as string).endsWith('=')).toBe(false);
    expect(files.get(`Platewise/${NAME}`)).toEqual(bytes);
  });

  it('lists the files with their size and modified time, and an absent folder as empty', async () => {
    const { plugin, files } = fakePlugin();
    const folder = nativeBackupFolder(fakeRead(files), plugin as unknown as FilesPlugin, PIECE);
    expect(await folder.list()).toEqual([]);

    await folder.write(NAME, new Blob([bytesOfLength(40)]));

    expect(await folder.list()).toEqual([{ name: NAME, size: 40, modifiedAt: 1_761_500_000_000 }]);
    expect(plugin.readdir).toHaveBeenLastCalledWith({ path: 'Platewise', directory: 'DOCUMENTS' });
  });

  it('deletes a file, and takes one already gone as deleted', async () => {
    const { plugin, files } = fakePlugin();
    const folder = nativeBackupFolder(fakeRead(files), plugin as unknown as FilesPlugin, PIECE);
    await folder.write(NAME, new Blob([bytesOfLength(10)]));

    await folder.remove(NAME);
    await folder.remove(NAME);

    expect(files.size).toBe(0);
    expect(plugin.deleteFile).toHaveBeenCalledWith({
      path: `Platewise/${NAME}`,
      directory: 'DOCUMENTS',
    });
  });

  it('reads a file back through the WebView route as a ZIP file of that name', async () => {
    const { plugin, files } = fakePlugin();
    const read = fakeRead(files);
    const folder = nativeBackupFolder(read, plugin as unknown as FilesPlugin, PIECE);
    const bytes = bytesOfLength(PIECE + 1);
    await folder.write(NAME, new Blob([bytes]));

    const file = await folder.read(NAME);

    expect(file.name).toBe(NAME);
    expect(file.type).toBe('application/zip');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
    expect(read.urls).toEqual([
      `https://localhost/_capacitor_file_/storage/emulated/0/Documents/Platewise/${NAME}`,
    ]);
  });

  it('says a file that is gone is missing', async () => {
    const { plugin, files } = fakePlugin();
    const folder = nativeBackupFolder(fakeRead(files), plugin as unknown as FilesPlugin, PIECE);

    await expect(folder.read(NAME)).rejects.toMatchObject({ problem: 'missing' });
  });

  it('never lets the plugin ask by itself: without the permission every call is refused', async () => {
    const { plugin, files } = fakePlugin({ granted: false });
    const folder = nativeBackupFolder(fakeRead(files), plugin as unknown as FilesPlugin, PIECE);

    await expect(folder.write(NAME, new Blob(['x']))).rejects.toMatchObject({ problem: 'denied' });
    await expect(folder.list()).rejects.toMatchObject({ problem: 'denied' });
    await expect(folder.remove(NAME)).rejects.toMatchObject({ problem: 'denied' });
    await expect(folder.read(NAME)).rejects.toMatchObject({ problem: 'denied' });
    expect(await folder.access(false)).toBe('denied');

    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    expect(plugin.writeFile).not.toHaveBeenCalled();
    expect(plugin.readdir).not.toHaveBeenCalled();
  });

  it('asks only when told to, and reads the answer', async () => {
    const yes = fakePlugin({ granted: false, answer: true });
    expect(
      await nativeBackupFolder(NO_READ, yes.plugin as unknown as FilesPlugin).access(true),
    ).toBe('granted');
    const no = fakePlugin({ granted: false, answer: false });
    expect(
      await nativeBackupFolder(NO_READ, no.plugin as unknown as FilesPlugin).access(true),
    ).toBe('denied');
    const already = fakePlugin({ granted: true });
    expect(
      await nativeBackupFolder(NO_READ, already.plugin as unknown as FilesPlugin).access(true),
    ).toBe('granted');
    expect(already.plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it('takes a refused question as denied', async () => {
    const { plugin } = fakePlugin({ granted: false });
    plugin.requestPermissions.mockRejectedValueOnce(
      pluginError('Missing the following permissions in AndroidManifest.xml'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await nativeBackupFolder(NO_READ, plugin as unknown as FilesPlugin).access(true)).toBe(
      'denied',
    );
  });

  it('removes a half-written file and says why the write failed', async () => {
    const { plugin, files } = fakePlugin();
    plugin.appendFile.mockRejectedValueOnce(
      pluginError(
        "'appendFile' failed with: write failed: ENOSPC (No space left on device)",
        'OS-PLUG-FILE-0013',
      ),
    );
    const folder = nativeBackupFolder(fakeRead(files), plugin as unknown as FilesPlugin, PIECE);

    const writing = folder.write(NAME, new Blob([bytesOfLength(PIECE + 1)]));

    await expect(writing).rejects.toBeInstanceOf(FolderError);
    await expect(writing).rejects.toMatchObject({ problem: 'noSpace' });
    expect(files.size).toBe(0);
  });

  it.each([
    {
      name: 'the plugin refusing the permission',
      error: pluginError(
        'Unable to do file operation, user denied permission request.',
        'OS-PLUG-FILE-0007',
      ),
      problem: 'denied',
    },
    {
      name: 'an access error',
      error: pluginError(
        "'writeFile' failed with: EACCES (Permission denied)",
        'OS-PLUG-FILE-0013',
      ),
      problem: 'denied',
    },
    {
      name: 'a full disk',
      error: pluginError("'writeFile' failed with: ENOSPC (No space left)", 'OS-PLUG-FILE-0013'),
      problem: 'noSpace',
    },
    {
      name: 'a missing file',
      error: pluginError("'getUri' failed because file does not exist.", 'OS-PLUG-FILE-0008'),
      problem: 'missing',
    },
    {
      name: 'any other failure',
      error: pluginError("'writeFile' failed with: I/O error", 'OS-PLUG-FILE-0013'),
      problem: 'failed',
    },
    { name: 'a value that is not an error', error: 'odd', problem: 'failed' },
  ] as const)('reads $name as $problem', ({ error, problem }) => {
    expect(problemOf(error)).toBe(problem);
  });
});
