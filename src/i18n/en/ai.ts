import type { MessageTree } from '../catalogue';

/**
 * What the person sees when an AI request fails (src/ai/errors.ts): one message per failure kind
 * that is shown (a cancelled request shows nothing), plus the lines that extend some of them.
 * Never the provider's own text.
 */
export const ai = {
  ai: {
    failure: {
      noKey: 'Add an API key for this provider in AI settings first.',
      imageConversion: "This photo couldn't be prepared for the AI. Try a different photo.",
      invalidResponse: "The AI's answer couldn't be read. Try again.",
      invalidUrl: "The server address isn't valid. Check it in AI settings.",
      offline: "You're offline. Connect to the internet and try again.",
      connection:
        "Couldn't reach the AI service. Check your connection and the server address, then try again.",
      timeout:
        "The AI didn't answer in time. Try again, or allow more time under Give up after in AI settings.",
      credits:
        'This AI account has run out of credit. Add credit with the provider or choose another provider.',
      dailyQuota:
        "Today's allowance on this AI account is used up. Try again tomorrow or choose another provider.",
      quota:
        'This AI account has used up its allowance. Check your plan with the provider or choose another provider.',
      model:
        "The provider doesn't know this model or address. Check the model and the server address in AI settings.",
      rateLimit:
        'Too many requests in a short time. Wait a minute and try again, or choose another provider. Free plans may also have a daily cap.',
      keyRejected: 'The provider refused the API key. Paste a valid key in AI settings.',
      overloaded:
        'The AI service is busy right now. We tried a few times. Try again later, or choose another model or provider.',
      generic: "The AI request didn't work. Try again or choose another provider.",
      truncated:
        'The answer was cut off twice: the model reached the answer length limit (thinking models count their thinking too). Raise it in Settings › AI, or try another model.',
      tooLarge: 'The request is too big for this provider. Send fewer photos or smaller ones.',
      roundLimit:
        'The Coach needed too many steps for this question. Try asking something narrower.',
      bothFailed: '{primary} and the standby {standby} both failed.',
    },
    hint: {
      keyMayBeRefused:
        'This provider reports a refused key as a connection problem, so check the key too.',
    },
  },
} as const satisfies MessageTree;
