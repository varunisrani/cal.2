/**
 * What the e2e specs share: the app's words as it renders them, `data-ui` hooks, and a small
 * client for the fake AI provider (e2e/fake-ai/server.ts), which global setup starts once for the
 * whole run. Specs run in worker processes, so they reach the fake over HTTP at the address the
 * server itself reads from the environment.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Locator, Page, Route } from '@playwright/test';
import {
  FOOD_REPLY_KEYS,
  PART_REPLY_KEYS,
  PRICE_REPLY_KEYS,
  UNIT_REPLY_KEYS,
} from '../src/ai/parse/foodReply';
import type { NutrientKey } from '../src/domain/model';
import { lookupMessage, type MessageKey } from '../src/i18n/catalogue';
import { en } from '../src/i18n/en';
import { numberFormat, pluralRules } from '../src/i18n/format';
import { parseMessage, renderMessage, type MessageParams } from '../src/i18n/message';
import { OFF_PRODUCT_URL } from '../src/services/barcode/off';
import {
  HOST,
  portFromEnv,
  type RecordedRequest,
  type Script,
  type ScriptReply,
} from './fake-ai/server';

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
  /** Loads an inline script (`foodScript`) from its first reply; recordings are kept. */
  async useReplies(script: Script): Promise<void> {
    await control('POST', '/__script', script);
  },
  /** The chat requests the app sent since the last reset, oldest first. */
  async requests(): Promise<RecordedRequest[]> {
    return (await control('GET', '/__requests')) as RecordedRequest[];
  },
};

// ---- Logging food (P06-20): fake AI answers, the food databases, hooks seen -------------------

/** One part of a food answer: a separate food of the meal. */
export interface FakePart {
  readonly name: string;
  readonly grams: number;
  readonly kcal: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
}

/** A food answer as the fake gives it, in our reply contract (src/ai/parse/foodReply.ts). */
export interface FakeFood {
  readonly name: string;
  readonly emoji: string;
  /** For the whole amount analysed; with parts, exactly their sums. */
  readonly kcal: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  /** The weight of the whole amount analysed. */
  readonly servingGrams: number;
  readonly nutrients: Partial<Record<NutrientKey, number>>;
  /** Count × grams each comes to `servingGrams`; the first is the unit the review opens in. */
  readonly units: readonly { unit: string; count: number; gramsEach: number }[];
  readonly parts: readonly FakePart[];
  /** A price the person's words stated (D-16.107); left out of the answer when absent. */
  readonly price?: { readonly amount: number; readonly currency: string };
}

/** A photo of a chicken grain bowl: one serving of 360 g in two parts. */
export const GRAIN_BOWL: FakeFood = {
  name: 'Chicken grain bowl',
  emoji: '🥗',
  kcal: 520,
  protein: 34,
  carbs: 58,
  fat: 16,
  servingGrams: 360,
  nutrients: { fibre: 9, sugar: 6, sodium: 640 },
  units: [{ unit: 'serving', count: 1, gramsEach: 360 }],
  parts: [
    { name: 'Grilled chicken', grams: 120, kcal: 200, protein: 28, carbs: 0, fat: 9 },
    { name: 'Brown rice and vegetables', grams: 240, kcal: 320, protein: 6, carbs: 58, fat: 7 },
  ],
};

/** "two eggs and toast", typed: one plate of 160 g. */
export const EGGS_ON_TOAST: FakeFood = {
  name: 'Two fried eggs on toast',
  emoji: '🍳',
  kcal: 340,
  protein: 18,
  carbs: 30.8,
  fat: 16,
  servingGrams: 160,
  nutrients: { fibre: 2.4, sodium: 520, cholesterol: 370 },
  units: [{ unit: 'plate', count: 1, gramsEach: 160 }],
  parts: [
    { name: 'Fried eggs', grams: 100, kcal: 180, protein: 12.6, carbs: 0.8, fat: 14 },
    { name: 'Toast', grams: 60, kcal: 160, protein: 5.4, carbs: 30, fat: 2 },
  ],
};

/** A nutrition label photographed after a barcode miss: two rice cakes, values off the label. */
export const RICE_CAKE_LABEL: FakeFood = {
  name: 'Sesame rice cakes',
  emoji: '🍘',
  kcal: 68,
  protein: 1.6,
  carbs: 14.2,
  fat: 0.6,
  servingGrams: 18,
  nutrients: { fibre: 0.8, sugar: 0.1, sodium: 24 },
  units: [{ unit: 'cake', count: 2, gramsEach: 9 }],
  parts: [],
};

/** The message text the fake answers with: the food as one JSON object in our reply keys. */
export function foodAnswer(food: FakeFood): string {
  const K = FOOD_REPLY_KEYS;
  const U = UNIT_REPLY_KEYS;
  const P = PART_REPLY_KEYS;
  return JSON.stringify({
    [K.name]: food.name,
    [K.emoji]: food.emoji,
    [K.kcal]: food.kcal,
    [K.protein]: food.protein,
    [K.carbs]: food.carbs,
    [K.fat]: food.fat,
    [K.servingGrams]: food.servingGrams,
    [K.nutrients]: food.nutrients,
    [K.units]: food.units.map((u) => ({
      [U.unit]: u.unit,
      [U.count]: u.count,
      [U.gramsEach]: u.gramsEach,
    })),
    [K.parts]: food.parts.map((part) => ({
      [P.name]: part.name,
      [P.grams]: part.grams,
      [P.kcal]: part.kcal,
      [P.protein]: part.protein,
      [P.carbs]: part.carbs,
      [P.fat]: part.fat,
    })),
    [K.progressive]: false,
    ...(food.price
      ? {
          [K.price]: {
            [PRICE_REPLY_KEYS.amount]: food.price.amount,
            [PRICE_REPLY_KEYS.currency]: food.price.currency,
          },
        }
      : {}),
  });
}

/** A 200 chat completion carrying `food`, in the OpenAI-compatible shape the fake speaks. */
function foodReply(food: FakeFood): ScriptReply {
  return {
    status: 200,
    body: {
      id: 'chatcmpl-e2e-food',
      object: 'chat.completion',
      created: 1793000000,
      model: 'fake-model',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: foodAnswer(food) },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1200, completion_tokens: 180, total_tokens: 1380 },
    },
  };
}

/** An inline script answering one food request per food, in order (`fakeAi.useReplies`). */
export function foodScript(...foods: readonly FakeFood[]): Script {
  return {
    description: `Food answers for the logging e2e: ${foods.map((food) => food.name).join(', ')}.`,
    replies: foods.map(foodReply),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The photos a recorded chat request carried: its messages' parts of type `image_url`. */
export function imagesSent(request: RecordedRequest): number {
  const messages = isObject(request.body) ? request.body.messages : undefined;
  if (!Array.isArray(messages)) return 0;
  return messages
    .flatMap((message: unknown) =>
      isObject(message) && Array.isArray(message.content) ? (message.content as unknown[]) : [],
    )
    .filter((part) => isObject(part) && part.type === 'image_url').length;
}

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** Our own small JPEG of a plate: the meal and label photo, and the product photo below. */
export const MEAL_PHOTO = `${FIXTURES}meal.jpg`;

/** The code our product fixture answers for (`fixtures/off-product.json`). */
export const OFF_PRODUCT_CODE = '2001234567893';
/** A code Open Food Facts does not know (`fixtures/off-not-found.json`). */
export const OFF_MISSING_CODE = '2009876543213';

/** FoodData Central's search, as `src/services/barcode/fdc.ts` posts to it. */
const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

const OFF_PRODUCT = new URL(OFF_PRODUCT_URL);
const OFF_IMAGE_HOST = 'images.openfoodfacts.org';
const FDC_SEARCH = new URL(FDC_SEARCH_URL);

/** Hosts the specs reach directly: the app's preview server and the fake AI. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** What a cross-origin page needs to read a reply, as the real hosts send it. */
const CORS = { 'access-control-allow-origin': '*' };

/** What the food databases were asked during a test, and what was asked of anyone else. */
export interface FoodDatabaseLog {
  /** Open Food Facts product requests: the code, and the `lc` and `app_name` query values. */
  readonly off: { code: string; lc: string | null; appName: string | null }[];
  /** Product photos fetched from Open Food Facts' image host. */
  readonly offPhotos: string[];
  /** FoodData Central requests, `METHOD url`. */
  readonly fdc: string[];
  /** FoodData Central searches (its POSTs): the address, the `X-Api-Key` header and the body. */
  readonly fdcSearches: { url: string; apiKey: string | null; body: string | null }[];
  /** Every other request off loopback, `METHOD url`: aborted, and a test failure. */
  readonly strays: string[];
}

/**
 * Routes every request that leaves loopback for the whole browser context: Open Food Facts'
 * product API answers from our fixtures (our product, else its not-found reply with a 404), its
 * image host serves `MEAL_PHOTO`, FoodData Central's search finds nothing, and any other host is
 * aborted. Each request is recorded in the returned log.
 */
export async function routeFoodDatabases(context: BrowserContext): Promise<FoodDatabaseLog> {
  const product = readFileSync(`${FIXTURES}off-product.json`, 'utf8');
  const notFound = readFileSync(`${FIXTURES}off-not-found.json`, 'utf8');
  const photo = readFileSync(MEAL_PHOTO);
  const log: FoodDatabaseLog = { off: [], offPhotos: [], fdc: [], fdcSearches: [], strays: [] };

  const json = (route: Route, status: number, body: string): Promise<void> =>
    route.fulfill({ status, headers: CORS, contentType: 'application/json', body });

  const handle = async (route: Route): Promise<void> => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.host === OFF_PRODUCT.host && url.pathname.startsWith(OFF_PRODUCT.pathname)) {
      const code = url.pathname.slice(OFF_PRODUCT.pathname.length).replace(/\.json$/, '');
      const query = url.searchParams;
      log.off.push({ code, lc: query.get('lc'), appName: query.get('app_name') });
      await (code === OFF_PRODUCT_CODE ? json(route, 200, product) : json(route, 404, notFound));
      return;
    }
    if (url.host === OFF_IMAGE_HOST && method === 'GET') {
      log.offPhotos.push(url.href);
      await route.fulfill({ status: 200, headers: CORS, contentType: 'image/jpeg', body: photo });
      return;
    }
    if (url.host === FDC_SEARCH.host && url.pathname === FDC_SEARCH.pathname) {
      log.fdc.push(`${method} ${url.href}`);
      if (method === 'POST') {
        const apiKey = (await request.headerValue('x-api-key')) ?? null;
        log.fdcSearches.push({ url: url.href, apiKey, body: request.postData() });
      }
      if (method === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            ...CORS,
            'access-control-allow-methods': 'POST',
            'access-control-allow-headers': 'content-type, x-api-key',
          },
        });
        return;
      }
      await json(route, 200, JSON.stringify({ totalHits: 0, foods: [] }));
      return;
    }
    log.strays.push(`${method} ${url.href}`);
    await route.abort('blockedbyclient');
  };

  await context.route(
    (url) => (url.protocol === 'http:' || url.protocol === 'https:') && !LOOPBACK.has(url.hostname),
    handle,
  );
  return log;
}

/** Where the init script below keeps the hooks it saw. */
const SEEN_KEY = '__platewiseHooksSeen';

/**
 * Records, from each document's start, every hook of `hooks` that enters the page, even one that
 * leaves again at once (a failure that flashes). Read it with `hooksSeen`; a reload starts over.
 */
export async function recordHooks(page: Page, hooks: readonly string[]): Promise<void> {
  await page.addInitScript(
    ({ watched, key }) => {
      const seen: string[] = [];
      Object.defineProperty(window, key, { value: seen });
      const look = (): void => {
        for (const hook of watched) {
          if (!seen.includes(hook) && document.querySelector(`[data-ui="${hook}"]`)) {
            seen.push(hook);
          }
        }
      };
      new MutationObserver(look).observe(document, { childList: true, subtree: true });
    },
    { watched: [...hooks], key: SEEN_KEY },
  );
}

/** The hooks of `recordHooks` that have entered the page since it was loaded, in order. */
export function hooksSeen(page: Page): Promise<string[]> {
  return page.evaluate(
    (key) => [...((window as unknown as Record<string, string[] | undefined>)[key] ?? [])],
    SEEN_KEY,
  );
}

// ---- The Coach (P08-14): text answers, what the Coach sent, texts seen ------------------------

/** A 200 chat completion whose message is `text`, in the OpenAI-compatible shape the fake speaks. */
export function textReply(text: string): ScriptReply {
  return {
    status: 200,
    body: {
      id: 'chatcmpl-e2e-text',
      object: 'chat.completion',
      created: 1793000000,
      model: 'fake-model',
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2100, completion_tokens: 20, total_tokens: 2120 },
    },
  };
}

/** An inline script answering one chat request per text, in order (`fakeAi.useReplies`). */
export function textScript(...texts: readonly string[]): Script {
  return {
    description: `${texts.length} text answers for the Coach e2e.`,
    replies: texts.map(textReply),
  };
}

/** The message text of a 200 chat completion in a script; throws for any other reply. */
export function answerOf(reply: ScriptReply | undefined): string {
  const body = reply?.body;
  const choices = isObject(body) ? body.choices : undefined;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const message = isObject(first) ? first.message : undefined;
  const content = isObject(message) ? message.content : undefined;
  if (typeof content !== 'string') throw new Error('The script reply carries no answer text');
  return content;
}

/** A chat message as a recorded request carried it. */
export type SentMessage = Record<string, unknown>;

/** A recorded request's chat messages, oldest first; none when its body has no `messages`. */
export function messagesSent(request: RecordedRequest): SentMessage[] {
  const messages = isObject(request.body) ? request.body.messages : undefined;
  return Array.isArray(messages) ? messages.filter(isObject) : [];
}

/** The names of the tools a recorded request offered (OpenAI-compatible `tools`). */
export function toolsOffered(request: RecordedRequest): string[] {
  const tools = isObject(request.body) ? request.body.tools : undefined;
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool: unknown) => {
    const name = isObject(tool) && isObject(tool.function) ? tool.function.name : undefined;
    return typeof name === 'string' ? [name] : [];
  });
}

/** The tool results a recorded request sent back: its messages of role `tool`. */
export function toolResultsSent(request: RecordedRequest): SentMessage[] {
  return messagesSent(request).filter((message) => message.role === 'tool');
}

/** The words of each person (`user`) message of a recorded request: a string, or its text parts. */
export function questionsSent(request: RecordedRequest): string[] {
  return messagesSent(request)
    .filter((message) => message.role === 'user')
    .map((message) => {
      const { content } = message;
      if (typeof content === 'string') return content;
      if (!Array.isArray(content)) return '';
      return content
        .flatMap((part: unknown) =>
          isObject(part) && part.type === 'text' && typeof part.text === 'string'
            ? [part.text]
            : [],
        )
        .join('\n');
    });
}

/** Where the init script below keeps the texts it saw. */
const TEXTS_SEEN_KEY = '__platewiseTextsSeen';

/**
 * Records, from each document's start, every text of `texts` that appears in the page, even for
 * a moment (a reply that shows and goes). Read it with `textsSeen`; a reload starts over.
 */
export async function recordTexts(page: Page, texts: readonly string[]): Promise<void> {
  await page.addInitScript(
    ({ watched, key }) => {
      const seen: string[] = [];
      Object.defineProperty(window, key, { value: seen });
      const look = (): void => {
        const shown = document.documentElement.textContent ?? '';
        for (const text of watched)
          if (!seen.includes(text) && shown.includes(text)) seen.push(text);
      };
      new MutationObserver(look).observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
    { watched: [...texts], key: TEXTS_SEEN_KEY },
  );
}

/** The texts of `recordTexts` that have appeared since the page was loaded, in order. */
export function textsSeen(page: Page): Promise<string[]> {
  return page.evaluate(
    (key) => [...((window as unknown as Record<string, string[] | undefined>)[key] ?? [])],
    TEXTS_SEEN_KEY,
  );
}

// ---- Settings and data (P09-19): the notification prompt ---------------------------------------

/** Where the stand-in below keeps its state; sessionStorage, so a reload keeps the answer. */
const NOTIFICATION_KEY = '__platewiseNotificationPrompt';

/**
 * Makes the browser's notification prompt answer "no" from each document's start, as a person
 * pressing Block would: the permission reads `default` until the app asks, then `denied` for the
 * rest of the tab's life, reloads included. Playwright can grant a permission but not deny one,
 * and headless Chromium's own prompt answers `default`. Read the number of requests with
 * `notificationRequests`.
 */
export async function refuseNotifications(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    const prompt = window.Notification as typeof Notification | undefined;
    if (prompt === undefined) return;
    const read = (): { asked: number; answer: NotificationPermission } => {
      const stored = sessionStorage.getItem(key);
      return stored === null
        ? { asked: 0, answer: 'default' }
        : (JSON.parse(stored) as { asked: number; answer: NotificationPermission });
    };
    Object.defineProperty(prompt, 'permission', {
      configurable: true,
      get: () => read().answer,
    });
    Object.defineProperty(prompt, 'requestPermission', {
      configurable: true,
      value: (): Promise<NotificationPermission> => {
        const next = { asked: read().asked + 1, answer: 'denied' as const };
        sessionStorage.setItem(key, JSON.stringify(next));
        return Promise.resolve(next.answer);
      },
    });
  }, NOTIFICATION_KEY);
}

/** How many times the page asked for the notification permission (`refuseNotifications`). */
export function notificationRequests(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const stored = sessionStorage.getItem(key);
    return stored === null ? 0 : (JSON.parse(stored) as { asked: number }).asked;
  }, NOTIFICATION_KEY);
}
