// The backup folder in the Android app (P14-01): `Documents/Platewise` through the
// `@capacitor/filesystem` plugin, whose Android half `cap sync` adds. Only ever fetched by
// `autoLoad.ts` inside the Android app, so neither this module nor @capacitor/core is part of the
// web download. The plugin is registered by name, so its web stand-in is never bundled.
//
// - Every call first checks the storage permission without asking: the plugin would otherwise
//   show Android's question by itself on Android 8–10. Only `access(true)` asks.
// - A file is written in pieces of 3 MiB, each base64 (the bridge carries text): the first
//   replaces the file, the others are appended, so no single bridge message holds a whole backup.
//   A write that fails removes what it wrote.
// - A file is read back through the WebView's own route to local files (`convertFileSrc`), which
//   streams the bytes instead of passing a base64 copy over the bridge.

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Directory, FileInfo, FilesystemPlugin } from '@capacitor/filesystem';
import { ZIP_TYPE } from './zip';
import {
  BACKUP_FOLDER,
  FolderError,
  type BackupFolder,
  type FolderFile,
  type FolderProblem,
} from './folder';

/** The parts of the plugin used here. */
export type FilesPlugin = Pick<
  FilesystemPlugin,
  | 'checkPermissions'
  | 'requestPermissions'
  | 'writeFile'
  | 'appendFile'
  | 'readdir'
  | 'deleteFile'
  | 'getUri'
>;

/** The phone's shared Documents folder (the plugin's `Directory.Documents`). */
const DOCUMENTS = 'DOCUMENTS' as Directory.Documents;

/** Bytes per piece, each sent as its own base64; a multiple of 3, so only the last is padded. */
export const PIECE_BYTES = 3 * 1024 * 1024;

/** The plugin's code for a refused storage permission. */
const PERMISSION_DENIED = 'OS-PLUG-FILE-0007';
/** The plugin's code for a file or folder that does not exist. */
const DOES_NOT_EXIST = 'OS-PLUG-FILE-0008';

/** What reading a file back needs besides the plugin. */
export interface ReadEnv {
  /** The page's fetch, handed over by the composition root (no service uses the global). */
  readonly fetch: (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'blob'>>;
  /** A `file://` address as one the WebView can fetch; Capacitor's by default. */
  readonly convertFileSrc?: (uri: string) => string;
}

/** The plugin the Android shell registers under the name `Filesystem`. */
export function nativeFilesPlugin(): FilesPlugin {
  return registerPlugin<FilesystemPlugin>('Filesystem');
}

/** Why the plugin refused, from its error code and message. */
export function problemOf(error: unknown): FolderProblem {
  if (error instanceof FolderError) return error.problem;
  const fields =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const code = typeof fields.code === 'string' ? fields.code : '';
  const message = typeof fields.message === 'string' ? fields.message : String(error);
  if (/ENOSPC|no space left/i.test(message)) return 'noSpace';
  if (code === PERMISSION_DENIED || /permission|EACCES|EPERM/i.test(message)) return 'denied';
  if (code === DOES_NOT_EXIST || /does not exist|ENOENT|no such file/i.test(message)) {
    return 'missing';
  }
  return 'failed';
}

function refused(error: unknown): FolderError {
  return error instanceof FolderError ? error : new FolderError(problemOf(error), error);
}

/** The bytes of `piece` as base64. */
async function base64Of(piece: Blob): Promise<string> {
  const bytes = new Uint8Array(await piece.arrayBuffer());
  let binary = '';
  // Bytes per `String.fromCharCode` call: well inside the call stack's limit.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function asFolderFile(info: FileInfo): FolderFile {
  return {
    name: info.name,
    size: Number.isFinite(info.size) ? info.size : 0,
    modifiedAt: Number.isFinite(info.mtime) ? info.mtime : 0,
  };
}

/**
 * The folder over the plugin; the real plugin and 3 MiB pieces unless a test passes its own
 * (`pieceBytes` must be a multiple of 3).
 */
export function nativeBackupFolder(
  env: ReadEnv,
  plugin: FilesPlugin = nativeFilesPlugin(),
  pieceBytes: number = PIECE_BYTES,
): BackupFolder {
  const at = (name: string) => ({ path: `${BACKUP_FOLDER}/${name}`, directory: DOCUMENTS });
  const fileSrc = env.convertFileSrc ?? ((uri: string) => Capacitor.convertFileSrc(uri));

  async function granted(): Promise<boolean> {
    try {
      return (await plugin.checkPermissions()).publicStorage === 'granted';
    } catch {
      return false;
    }
  }

  /** Stops before the plugin would ask by itself. */
  async function allowed(): Promise<void> {
    if (!(await granted())) throw new FolderError('denied');
  }

  return {
    async access(ask) {
      if (await granted()) return 'granted';
      if (!ask) return 'denied';
      try {
        const answer = await plugin.requestPermissions();
        return answer.publicStorage === 'granted' ? 'granted' : 'denied';
      } catch (error) {
        console.error('Platewise: the storage permission could not be asked for', error);
        return 'denied';
      }
    },

    async write(name, data) {
      await allowed();
      const target = at(name);
      try {
        await plugin.writeFile({
          ...target,
          data: await base64Of(data.slice(0, pieceBytes)),
          recursive: true,
        });
        for (let start = pieceBytes; start < data.size; start += pieceBytes) {
          const piece = await base64Of(data.slice(start, start + pieceBytes));
          await plugin.appendFile({ ...target, data: piece });
        }
      } catch (error) {
        // A half-written backup would only be refused as damaged later: take it away now.
        await plugin.deleteFile(target).catch(() => undefined);
        throw refused(error);
      }
    },

    async list() {
      await allowed();
      try {
        const { files } = await plugin.readdir({ path: BACKUP_FOLDER, directory: DOCUMENTS });
        return files.filter((info) => info.type === 'file').map(asFolderFile);
      } catch (error) {
        if (problemOf(error) === 'missing') return [];
        throw refused(error);
      }
    },

    async remove(name) {
      await allowed();
      try {
        await plugin.deleteFile(at(name));
      } catch (error) {
        if (problemOf(error) !== 'missing') throw refused(error);
      }
    },

    async read(name) {
      await allowed();
      try {
        const { uri } = await plugin.getUri(at(name));
        const response = await env.fetch(fileSrc(uri));
        if (!response.ok) {
          throw new FolderError(response.status === 404 ? 'missing' : 'failed');
        }
        const bytes = await response.blob();
        // The WebView answers a file it cannot open with nothing; a backup is never empty.
        if (bytes.size === 0) throw new FolderError('missing');
        return new File([bytes], name, { type: ZIP_TYPE });
      } catch (error) {
        throw refused(error);
      }
    },
  };
}
