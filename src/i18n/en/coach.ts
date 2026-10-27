import type { MessageTree } from '../catalogue';

/**
 * Words of the Coach tab (src/features/coach). The chips are questions a tap sends as the
 * person's own message, four per goal (P08-12); the copy words belong to the button on each
 * reply (P08-13); `photoOnly` is the question a photo sent without words carries (P08-09); the
 * page, its empty state, the waiting dots and the error banner (P08-10) and the composer (P08-11)
 * have the rest.
 */
export const coach = {
  coach: {
    chips: {
      label: 'Suggested questions',
      lose: {
        projection: 'Project my weight 30 days ahead',
        faster: 'Is there a safe way to speed up my loss?',
        intake: 'Is my intake too high for my goal?',
        dinner: 'Suggest a dinner that fits my day',
      },
      gain: {
        projection: 'Project my weight 30 days ahead',
        healthy: 'Help me gain weight in a healthy way',
        intake: 'Is my intake high enough to gain?',
        protein: 'Which foods would raise my protein?',
      },
      maintain: {
        stable: 'Has my weight stayed stable lately?',
        average: 'How much do I eat on an average day?',
        macros: 'How could I balance my macros better?',
        trend: 'Which way is my weight trending?',
      },
    },
    /** Stored and sent as the question when a photo goes without words (P08-09). */
    photoOnly: 'Have a look at this photo.',
    copy: {
      label: 'Copy reply',
      done: 'Reply copied',
      failed: "Couldn't copy the reply",
    },
    page: {
      conversation: 'Conversation',
      reset: 'Clear chat',
      resetFailed: "The chat couldn't be cleared. Try again.",
      unreadable: "This conversation couldn't be read.",
      confirm: {
        title: 'Clear this chat?',
        message: 'This deletes every message and photo in the chat for good.',
        clear: 'Clear',
      },
    },
    empty: {
      title: 'Ask about your log',
      lead: 'Your Coach reads your meals, weigh-ins, fasts and goals. Ask how your week went or what to eat next.',
    },
    photo: 'Your photo',
    typing: 'The Coach is writing a reply',
    error: {
      details: 'Details',
    },
    composer: {
      label: 'Message to your Coach',
      placeholder: 'Ask about food or weight',
      send: 'Send',
      attach: 'Add a photo',
      camera: 'Camera',
      library: 'Photo library',
      preview: 'Photo to send',
      remove: 'Remove photo',
      photoUnreadable: "That photo couldn't be read. Try a different one.",
    },
  },
} as const satisfies MessageTree;
