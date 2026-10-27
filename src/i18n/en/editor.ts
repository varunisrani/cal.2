import type { MessageTree } from '../catalogue';

/**
 * Words of the entry editor (src/features/log/EntryEditor.tsx): its toolbar, the photo remove
 * buttons, the note that reprocesses the entry, the Saved switch, the delete confirmation and why
 * a change did not go through. Section words it shares with the review (serving, nutrition, meal,
 * date and time) come from the review partition; Save, Cancel and Delete from common.
 */
export const editor = {
  editor: {
    title: 'Edit entry',
    reprocess: 'Reprocess',
    reprocessing: 'Reprocessing…',
    photos: {
      remove: 'Remove photo {number} of {count}',
    },
    note: {
      label: 'Note for the AI',
      placeholder: 'Say what to change, like "large bowl" or "no dressing", then press Reprocess.',
      unavailable: "Reprocessing isn't available right now.",
    },
    saved: {
      label: 'Saved',
      description: 'Keep a copy in your saved meals for quick logging.',
      failed: "The saved meals couldn't be changed. Please try again.",
    },
    delete: {
      button: 'Delete entry',
      title: 'Delete this entry?',
      message: '{name} leaves your diary. Saved meals keep their copy.',
      failed: "This entry couldn't be deleted. Please try again.",
    },
    failed: "Your changes didn't save. Please try again.",
    missing: 'This entry is no longer in your diary.',
  },
} as const satisfies MessageTree;
