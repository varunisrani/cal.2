import type { MessageTree } from '../catalogue';

/**
 * What a person reads when an AI request fails: one sentence or two per failure kind
 * (`src/ai/errors.ts`). Provider text never appears here; `cancelled` has no message at all.
 */
export const ai = {
  ai: {
    failure: {
      noKey: 'This provider needs an API key. Add one in Settings › AI providers.',
      imageConversion: 'We couldn’t prepare that photo. Try a different one.',
      invalidResponse: 'The AI replied with something we couldn’t use. Try again.',
      invalidUrl: 'The server address isn’t valid. Fix it in Settings › AI providers.',
      offline: 'You’re offline. Reconnect, then try again.',
      connection:
        'We couldn’t reach the AI provider. Check your internet and the server address, then try again.',
      connectionOrKey:
        'We couldn’t reach the AI provider. This provider hides a refused key behind the same kind of failure, so check your key in Settings › AI providers as well as your internet.',
      timeout:
        'The AI didn’t answer in time. Try again, or allow more time under “Give up after” in Settings › AI providers.',
      credits:
        'Your account with this provider has no credit left. Add credit there, or choose another provider.',
      dailyQuota:
        'This account has used up today’s allowance with the provider. Try again tomorrow, or choose another provider.',
      quota:
        'This account is over its usage allowance with the provider. Check your plan there, or choose another provider.',
      model:
        'The provider doesn’t recognise this model or address. Check both in Settings › AI providers.',
      rateLimit:
        'The provider is limiting how often you can ask. Wait a minute and try again. Free plans may also have run out for today.',
      keyRejected:
        'The provider refused your API key. Paste a valid key in Settings › AI providers.',
      overloaded:
        'The provider is too busy right now, even after a few tries. Try again shortly, or switch to another provider or model.',
      generic: 'The AI request didn’t work. Try again, or choose another provider.',
      truncated: 'The answer was cut off twice. Send something shorter, or choose another model.',
      tooLarge: 'That was too much to send in one go. Try fewer photos, or smaller ones.',
      roundLimit: 'The coach needed too many steps for that one. Try asking it more simply.',
      bothFailed: '{primary} and the standby, {standby}, both failed. {reason}',
    },
  },
} as const satisfies MessageTree;
