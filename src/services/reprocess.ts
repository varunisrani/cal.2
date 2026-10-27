// Reprocessing a logged entry (02 §3.7, P06-11): the editor's "Reprocess" asks the AI again about
// the entry as it is being edited, with the person's note. The request is one line, the name, the
// amount shown and the note ("Lentil soup, 1 bowl. extra oil"): sent with the entry's photos as a
// meal-photo analysis when any of them can still be read, else as a typed description. One request
// under the timeout setting, stopped by the caller's signal. Nothing is stored here: the editor
// shows the answer and writes only on Save. The app's own analysis (overlay, stored draft) is not
// used, so a draft waiting for review is never dropped by an edit.

import type { AiDeps } from '../ai/client';
import { failureMessages, type AiMessage } from '../ai/errors';
import type { ImageBackend } from '../ai/image';
import type { PhotoRepo } from '../data/repos/photoRepo';
import type { NutritionDraft } from '../domain/model';
import type { ShownAmount } from '../domain/servings/units';
import { formatQuantity } from '../domain/units/numbers';
import type { StoredAiAccess } from './aiAccess';

export interface ReprocessRequest {
  /** The name the entry would be saved with. */
  readonly name: string;
  /** The amount on the editor's serving card. */
  readonly amount: ShownAmount;
  /** The note as typed; blank adds nothing. */
  readonly note: string;
  /** The entry's own photos as edited, primary first. */
  readonly photoIds: readonly string[];
  /** The photos show one plate built up in steps. */
  readonly progressive: boolean;
}

export type ReprocessOutcome =
  /** What the AI made of the entry now: it replaces the editor's values. */
  | { readonly kind: 'draft'; readonly draft: NutritionDraft }
  /** The request failed; the messages say why (never empty). */
  | { readonly kind: 'failed'; readonly messages: readonly AiMessage[] }
  /** Stopped by the caller: nothing to show. */
  | { readonly kind: 'cancelled' };

export interface ReprocessService {
  /** Asks the AI about the entry once; never rejects. */
  run(request: ReprocessRequest, cancel: AbortSignal): Promise<ReprocessOutcome>;
}

export interface ReprocessDeps {
  /** Read for every request, so a key saved a moment ago is used. */
  readonly aiAccess: () => Promise<StoredAiAccess>;
  /** Where the entry's photos are read from. */
  readonly photoRepo: Pick<PhotoRepo, 'get'>;
  /** Handed to the AI client; services never use the global one. */
  readonly fetch: typeof fetch;
  /** Decodes photos for the AI; the browser's by default. */
  readonly imageBackend?: ImageBackend;
}

const CANCELLED: ReprocessOutcome = { kind: 'cancelled' };

/** The amount as words for the AI: grams, else the count and the unit's id; empty when none. */
function amountText({ unit, count, amount }: ShownAmount): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (unit.kind === 'grams') return `${formatQuantity(amount)} g`;
  return `${formatQuantity(count)} ${unit.id}`;
}

/** The one line the AI gets: "name, amount", then ". note" when there is a note. */
export function reprocessDescription(
  request: Pick<ReprocessRequest, 'name' | 'amount' | 'note'>,
): string {
  const head = [request.name.trim(), amountText(request.amount)]
    .filter((part) => part !== '')
    .join(', ');
  const note = request.note.trim();
  if (note === '') return head;
  return head === '' ? note : `${head}. ${note}`;
}

export function createReprocessService(deps: ReprocessDeps): ReprocessService {
  /** The photos that can still be read, in order. */
  async function readablePhotos(ids: readonly string[]): Promise<Blob[]> {
    const rows = await Promise.all(ids.map((id) => deps.photoRepo.get(id)));
    return rows.flatMap((row) => (row ? [row.blob] : []));
  }

  return {
    async run(request, cancel) {
      try {
        const access = await deps.aiAccess();
        if (cancel.aborted) return CANCELLED;
        // The AI layer loads on first use, never with the start-up download.
        const { analyzePhotos, analyzeText } = await import('../ai/tasks/food');
        const ai: AiDeps = {
          settings: access.settings,
          keys: access.keys,
          fetch: deps.fetch,
          cancel,
          ...(deps.imageBackend ? { imageBackend: deps.imageBackend } : {}),
        };
        const description = reprocessDescription(request);
        const images = await readablePhotos(request.photoIds);
        if (cancel.aborted) return CANCELLED;
        const result =
          images.length > 0
            ? await analyzePhotos(
                { images, note: description, progressive: request.progressive },
                ai,
              )
            : await analyzeText(description, ai);
        if (result.ok) return { kind: 'draft', draft: result.value };
        if (result.error.kind === 'cancelled') return CANCELLED;
        return { kind: 'failed', messages: failureMessages(result.error) };
      } catch {
        if (cancel.aborted) return CANCELLED;
        return { kind: 'failed', messages: failureMessages({ kind: 'generic' }) };
      }
    },
  };
}
