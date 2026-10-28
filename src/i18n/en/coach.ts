import type { MessageTree } from '../catalogue';

/**
 * Words of the Coach tab (src/features/coach). The chips are questions a tap sends as the
 * person's own message, four per goal (P08-12); the copy words belong to the button on each
 * reply (P08-13); `photoOnly` is the question a photo sent without words carries (P08-09); the
 * page, its empty state, the waiting dots and the error banner (P08-10) and the composer (P08-11)
 * have the rest. P13 adds "Jump to latest" over the conversation and the card under a reply that
 * proposes a reminder (D-16.93); P16 several chats: New chat, Chats, Rename, Delete chat (D-16.99);
 * P17 a reminder the Coach set (Undo) and a check-in it scheduled (D-16.102).
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
      done: 'Copied',
      failed: "Couldn't copy the reply",
    },
    jump: {
      label: 'Jump to latest',
      count: '{count, plural, one {# new} other {# new}}',
      labelWithCount:
        '{count, plural, one {Jump to latest, # new message} other {Jump to latest, # new messages}}',
    },
    reminder: {
      label: 'Proposed reminder: {text}',
      add: 'Add',
      dismiss: 'Dismiss',
      added: 'Added to your reminders',
      settings: 'Settings › Tracking & reminders',
      notificationsOff: 'It shows once notifications are on.',
      failed: "The reminder couldn't be added. Try again.",
      // The Coach set it itself, in the Android app (P17, D-16.102).
      set: 'Reminder set',
      undo: 'Undo',
      problems: {
        past: 'That time has passed. Ask the Coach for one still ahead.',
        full: 'You already have 20 reminders. Delete one in Settings to add this one.',
        gone: 'This reminder is no longer in the chat.',
        unavailable: "Reminders can't be added here.",
        invalid: "This reminder can't be added as it is. Ask the Coach again.",
      },
    },
    // A check-in the Coach scheduled, under its reply (P17, D-16.102).
    checkIn: {
      set: 'Check-in set for {when}',
    },
    page: {
      conversation: 'Conversation',
      newChat: 'New chat',
      chats: 'Chats',
      deleteChat: 'Delete chat',
      deleteFailed: "The chat couldn't be deleted. Try again.",
      unreadable: "This conversation couldn't be read.",
      confirm: {
        title: 'Delete this chat?',
        message: 'This deletes every message and photo in the chat for good.',
      },
    },
    chats: {
      untitled: 'Earlier chat',
      empty: 'No chats yet.',
      waiting: 'Replying…',
      yesterday: 'Yesterday',
      rename: 'Rename {title}',
      delete: 'Delete {title}',
      renameTitle: 'Rename chat',
      name: 'Name',
      renameFailed: "The chat couldn't be renamed.",
    },
    empty: {
      title: 'Ask about your log',
      lead: 'Your Coach reads your meals, weigh-ins, fasts and goals. Try asking how this week went, or what would suit your next meal.',
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
