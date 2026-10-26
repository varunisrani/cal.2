// The capture draft (02 §3.9, R02.17, D-16.46): the photos, note and "plate built in steps"
// switch gathered in the capture sheet before Analyse. Photos are stored as they are picked
// (through the photo service, so they are capped and thumbnailed once) and named in the drafts
// table's capture record, so a reload brings the sheet back and the photo cleanup never deletes
// them.
//
// A pick is all or nothing: when any kept file is empty, unreadable, over 25 MiB or not a photo
// the browser can decode, none of it is kept (analysing 9 of 10 photos gives wrong totals), and
// photos this pick already stored are released. At most 10 photos: files past the cap are left
// out and counted. Calls run one at a time in call order, so a read-change-write never meets
// another; `clear` also takes effect at once for picks still running, which then release what
// they stored instead of adding it.

import type { CaptureDraft, DraftsRepo } from '../data/repos/draftsRepo';
import type { PhotoRepo } from '../data/repos/photoRepo';
import type { PhotoService } from './photos';

// Screens may not import from src/data/repos, so the type they need comes from here.
export type { CaptureDraft } from '../data/repos/draftsRepo';

/** Photos one meal can hold. */
export const MAX_CAPTURE_PHOTOS = 10;
/** The largest file a pick may hold. */
export const MAX_PICK_BYTES = 25 * 1024 * 1024;

export type PickRefusal = 'tooLarge' | 'unreadable' | 'unsupportedImage' | 'storageFailed';

export type AddPhotosResult =
  /** The pick is stored and in the draft; `leftOut` files did not fit under the cap. */
  | { readonly kind: 'added'; readonly photoIds: readonly string[]; readonly leftOut: number }
  /** Nothing of the pick was kept. */
  | { readonly kind: 'refused'; readonly reason: PickRefusal }
  /** The draft was cleared while the pick was being stored: nothing of it was kept. */
  | { readonly kind: 'cleared' };

export type CaptureChanges = Partial<Pick<CaptureDraft, 'note' | 'progressive'>>;

export interface CaptureDraftService {
  /** The stored draft, or an empty one; photos that can no longer be read are dropped from it. */
  load(): Promise<CaptureDraft>;
  /** Stores picked files and adds them to the draft, in order, up to the cap. */
  add(files: readonly Blob[]): Promise<AddPhotosResult>;
  /** Takes a photo out of the draft and releases it; returns the photos left. */
  remove(photoId: string): Promise<readonly string[]>;
  /** Saves the note or the switch. */
  update(changes: CaptureChanges): Promise<void>;
  /** Drops the draft and its photos, and turns picks still being stored stale. */
  clear(): Promise<void>;
}

export interface CaptureDraftDeps {
  readonly photos: Pick<PhotoService, 'store'>;
  readonly draftsRepo: Pick<DraftsRepo, 'loadCapture' | 'saveCapture' | 'clearCapture'>;
  readonly photoRepo: Pick<PhotoRepo, 'get' | 'releaseIfUnused'>;
}

const EMPTY: CaptureDraft = { photoIds: [], note: '', progressive: false };

/** Why a file cannot join a pick before anything is read, or null when its size is fine. */
function sizeProblem(file: Blob): PickRefusal | null {
  if (file.size === 0) return 'unreadable';
  return file.size > MAX_PICK_BYTES ? 'tooLarge' : null;
}

/** Reads the whole file once, so an unreadable one is found before anything is stored. */
async function canRead(file: Blob): Promise<boolean> {
  try {
    await file.arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

export function createCaptureDraftService({
  photos,
  draftsRepo,
  photoRepo,
}: CaptureDraftDeps): CaptureDraftService {
  let tail: Promise<unknown> = Promise.resolve();
  /** Moved on by every clear, the moment it is called. */
  let session = 0;
  /** A note or switch write waiting its turn; later changes join it. */
  let waitingUpdate: { changes: CaptureChanges; done: Promise<void> } | null = null;

  /** Runs `work` after every call made before it has settled. */
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work);
    tail = run.catch(() => undefined);
    return run;
  }

  /** Deletes photos nothing uses any more. A failure is left to the photo repository's prune. */
  async function release(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await photoRepo.releaseIfUnused(ids);
    } catch {
      // Unused photos older than a few minutes are pruned later.
    }
  }

  async function stored(): Promise<CaptureDraft> {
    return (await draftsRepo.loadCapture()) ?? EMPTY;
  }

  async function storePick(files: readonly Blob[], started: number): Promise<AddPhotosResult> {
    if (started !== session) return { kind: 'cleared' };
    const draft = await stored();
    const room = Math.max(0, MAX_CAPTURE_PHOTOS - draft.photoIds.length);
    const kept = files.slice(0, room);
    const leftOut = files.length - kept.length;
    if (kept.length === 0) return { kind: 'added', photoIds: draft.photoIds, leftOut };

    for (const file of kept) {
      const problem = sizeProblem(file);
      if (problem) return { kind: 'refused', reason: problem };
    }
    for (const file of kept) {
      if (!(await canRead(file))) return { kind: 'refused', reason: 'unreadable' };
    }
    if (started !== session) return { kind: 'cleared' };

    const added: string[] = [];
    const undo = async (result: AddPhotosResult) => {
      await release(added);
      return result;
    };
    try {
      for (const file of kept) {
        const result = await photos.store(file);
        if (result.kind !== 'stored') return undo({ kind: 'refused', reason: 'unsupportedImage' });
        added.push(result.id);
        if (started !== session) return undo({ kind: 'cleared' });
      }
      const photoIds = [...draft.photoIds, ...added];
      await draftsRepo.saveCapture({ ...draft, photoIds });
      return { kind: 'added', photoIds, leftOut };
    } catch {
      return undo({ kind: 'refused', reason: 'storageFailed' });
    }
  }

  /** The stored draft without the photos whose rows are gone or unreadable. */
  async function restore(): Promise<CaptureDraft> {
    const draft = await stored();
    const found = await Promise.all(draft.photoIds.map((id) => photoRepo.get(id)));
    const photoIds = draft.photoIds.filter((_, index) => found[index] !== null);
    if (photoIds.length === draft.photoIds.length) return draft;
    const kept = { ...draft, photoIds };
    await draftsRepo.saveCapture(kept);
    return kept;
  }

  return {
    load: () => serial(restore),

    add(files) {
      const started = session;
      return serial(() => storePick(files, started));
    },

    remove: (photoId) =>
      serial(async () => {
        const draft = await stored();
        const photoIds = draft.photoIds.filter((id) => id !== photoId);
        if (photoIds.length === draft.photoIds.length) return draft.photoIds;
        // Without photos there is nothing to come back to: the note goes too.
        const dropped =
          photoIds.length === 0
            ? await draftsRepo.clearCapture()
            : await draftsRepo.saveCapture({ ...draft, photoIds });
        await release(dropped);
        return photoIds;
      }),

    update(changes) {
      if (waitingUpdate) {
        Object.assign(waitingUpdate.changes, changes);
        return waitingUpdate.done;
      }
      const waiting = { changes: { ...changes }, done: Promise.resolve() };
      waiting.done = serial(async () => {
        // From here on, a change waits for the next write.
        waitingUpdate = null;
        const draft = await stored();
        const dropped = await draftsRepo.saveCapture({ ...draft, ...waiting.changes });
        await release(dropped);
      });
      waitingUpdate = waiting;
      return waiting.done;
    },

    clear() {
      session += 1;
      return serial(async () => {
        await release(await draftsRepo.clearCapture());
      });
    },
  };
}
