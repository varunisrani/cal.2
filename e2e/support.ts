/**
 * What the e2e specs share: the app's words as it renders them, `data-ui` hooks, and a small
 * client for the fake AI provider (e2e/fake-ai/server.ts), which global setup starts once for the
 * whole run. Specs run in worker processes, so they reach the fake over HTTP at the address the
 * server itself reads from the environment.
 */
import type { Locator, Page } from '@playwright/test';
import { lookupMessage, type MessageKey } from '../src/i18n/catalogue';
import { en } from '../src/i18n/en';
import { numberFormat, pluralRules } from '../src/i18n/format';
import { parseMessage, renderMessage, type MessageParams } from '../src/i18n/message';
import { HOST, portFromEnv, type RecordedRequest } from './fake-ai/server';

/** The browser locale the specs run in, so numbers in the words do not follow the machine. */
export const LOCALE = 'en-US';

/** The app's words for `key`, rendered as the app renders them in this locale. */
export function words(key: MessageKey<typeof en>, params?: MessageParams): string {
  const source = lookupMessage(en, key);
  if (source === undefined) throw new Error(`The catalogue has no message "${key}"`);
  return renderMessage(parseMessage(source), {
    params,
    plural: pluralRules('en'),
    number: numberFormat(LOCALE),
    onProblem: (problem) => {
      throw new Error(`${problem} in message "${key}"`);
    },
  });
}

/** The element with a `data-ui` hook. */
export function ui(scope: Page | Locator, hook: string): Locator {
  return scope.locator(`[data-ui="${hook}"]`);
}

/** The fake AI's origin, from `PLATEWISE_FAKE_AI_PORT` as the server reads it. */
const FAKE_AI_ORIGIN = `http://${HOST}:${portFromEnv()}`;

/** The address to give the app's Custom provider: the fake's OpenAI-compatible API. */
export const FAKE_AI_BASE_URL = `${FAKE_AI_ORIGIN}/v1`;

/** One control call to the fake; a refusal throws with the fake's own message. */
async function control(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${FAKE_AI_ORIGIN}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`fake AI ${method} ${path}: ${response.status} ${text}`);
  return JSON.parse(text) as unknown;
}

/** The fake AI provider as the specs drive it. */
export const fakeAi = {
  /** No script and nothing recorded: every test starts here, as the fake outlives tests. */
  async reset(): Promise<void> {
    await control('POST', '/__reset');
  },
  /** Loads `e2e/fake-ai/scripts/<name>.json` from its first reply; recordings are kept. */
  async useScript(name: string): Promise<void> {
    await control('POST', '/__script', { name });
  },
  /** The chat requests the app sent since the last reset, oldest first. */
  async requests(): Promise<RecordedRequest[]> {
    return (await control('GET', '/__requests')) as RecordedRequest[];
  },
};
