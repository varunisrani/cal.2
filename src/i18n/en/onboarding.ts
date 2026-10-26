import type { MessageTree } from '../catalogue';

/** Onboarding. For now only the temporary quick start (P04-09); the wizard (P05) grows it. */
export const onboarding = {
  onboarding: {
    quickStart: {
      intro:
        'Start with standard goals and the units your region uses. You can change all of it later in Settings.',
      start: 'Start with defaults',
      failed: 'We couldn’t save your starting setup. Try again.',
    },
  },
} as const satisfies MessageTree;
