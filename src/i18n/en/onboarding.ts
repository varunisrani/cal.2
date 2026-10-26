import type { MessageTree } from '../catalogue';

/**
 * Words of onboarding (src/features/onboarding). For now only the temporary quick start (P04-09),
 * whose heading is the app's name (`common.appName`); P05 brings the real onboarding's words.
 */
export const onboarding = {
  onboarding: {
    quickStart: {
      lead: 'Count what you eat with your own AI key. Begin with standard details now and change them any time in Settings.',
      start: 'Start with defaults',
      failed: "That didn't save. Please try again.",
    },
  },
} as const satisfies MessageTree;
