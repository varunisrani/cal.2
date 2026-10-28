import { beforeEach, describe, expect, it } from 'vitest';
import type { NutritionDraft } from '../../domain/model';
import { advanceAsync, useFakeTime } from '../../test/time';
import { defaultModel } from '../catalog/presets';
import type { AiDeps } from '../client';
import { startDeadline, type Deadline } from '../deadline';
import type { ImageBackend } from '../image';
import {
  labelScanPrompt,
  photoMealPrompt,
  textMealPrompt,
  unitRepairPrompt,
} from '../prompts/food';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../settings';
import {
  fakeFetch,
  type FakeFetch,
  type FakeStep,
  type RecordedRequest,
} from '../testing/fakeFetch';
import { anthropicAnswer, geminiAnswer, geminiError, openAiAnswer } from '../testing/wire';
import {
  MAX_MEAL_PHOTOS,
  analyzeLabelScan,
  analyzePhotos,
  analyzeText,
  needsUnitRepair,
  readFoodAnswer,
  type FoodReading,
} from './food';

const START = '2026-10-27T12:30:00Z';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const OPENAI = 'https://api.openai.com/v1/chat/completions';
const KEYS = { gemini: 'gm-key-1212', anthropic: 'an-key-3434', openai: 'oa-key-5656' };
const NOTES = 'Assume oat milk whenever milk is used.';
const NOTE = 'Large mug from the office machine.';

const COFFEE = {
  name: 'Black coffee',
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  servingGrams: 240,
  emoji: '☕',
};
const PIZZA = {
  name: 'Margherita pizza',
  kcal: 820,
  protein: 34,
  carbs: 96,
  fat: 31,
  servingGrams: 330,
};
const CUP = { units: [{ unit: 'cup', count: 1, gramsEach: 240 }] };

/** Any photo decodes; its JPEG carries the photo's byte size, so tests can tell photos apart. */
const sizedBackend: ImageBackend = {
  decode: (blob) =>
    Promise.resolve({
      width: 1200,
      height: 900,
      toJpeg: () => Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, blob.size)),
      close: () => undefined,
    }),
};
const photo = (size: number): Blob => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
const jpegOf = (size: number): string => btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, size));

interface Setup {
  readonly settings?: Partial<AiSettings>;
  readonly deadline?: Deadline;
  readonly cancel?: AbortSignal;
}

function depsFor(fake: FakeFetch, setup: Setup = {}): AiDeps {
  return {
    settings: { ...DEFAULT_AI_SETTINGS, instructions: NOTES, ...setup.settings },
    keys: KEYS,
    fetch: fake.fetch,
    deadline: setup.deadline,
    cancel: setup.cancel,
    imageBackend: sizedBackend,
  };
}

const PHOTO_STANDBY: Partial<AiSettings> = {
  imageStandby: { on: true, provider: 'anthropic', model: defaultModel('anthropic', 'image') },
};

async function settle<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  await advanceAsync(ms);
  return promise;
}

const answer = (reply: unknown): FakeStep => ({ json: geminiAnswer(JSON.stringify(reply)) });

interface GeminiBody {
  readonly systemInstruction?: { readonly parts: readonly { readonly text: string }[] };
  readonly contents: readonly {
    readonly parts: readonly {
      readonly text?: string;
      readonly inlineData?: { readonly data: string };
    }[];
  }[];
}
const geminiBody = (request: RecordedRequest | undefined) => request?.body as GeminiBody;
const promptOf = (request: RecordedRequest | undefined) =>
  geminiBody(request)
    .contents[0]?.parts.flatMap((part) => part.text ?? [])
    .join('');
const photosOf = (request: RecordedRequest | undefined) =>
  geminiBody(request).contents[0]?.parts.flatMap((part) => part.inlineData?.data ?? []);
const systemOf = (request: RecordedRequest | undefined) =>
  geminiBody(request).systemInstruction?.parts[0]?.text;

/** The draft from a successful analysis; fails the test otherwise. */
function draftOf(result: { ok: true; value: NutritionDraft } | { ok: false; error: unknown }) {
  if (!result.ok) throw new Error(`analysis failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

beforeEach(() => {
  useFakeTime(START);
});

describe('readFoodAnswer: the reader the client runs on a food answer', () => {
  it('reads the draft, keeps parts that add up as the totals, and the unit choices', () => {
    const reply = {
      name: 'Rice and dal',
      kcal: 600,
      protein: 20,
      carbs: 100,
      fat: 12,
      servingGrams: 450,
      units: [{ unit: 'bowl', count: 1, gramsEach: 450 }],
      parts: [
        { name: 'Rice', grams: 250, kcal: 330, protein: 6, carbs: 72, fat: 1 },
        { name: 'Dal', grams: 200, kcal: 260, protein: 14, carbs: 30, fat: 10 },
      ],
    };
    const reading = readFoodAnswer(`Here it is:\n${JSON.stringify(reply)}`, { note: NOTE });
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    const { draft, needsRepair } = reading.value;
    expect(needsRepair).toBe(false);
    expect(draft).toMatchObject({
      name: 'Rice and dal',
      kcal: 590,
      protein: 20,
      carbs: 102,
      fat: 11,
      basis: { kind: 'grams', grams: 450 },
      units: [{ unit: 'bowl', gramsEach: 450, count: 1 }],
      chosenUnit: 'bowl',
      chosenCount: 1,
      note: NOTE,
    });
    expect(draft.lines.map((line) => line.name)).toEqual(['Rice', 'Dal']);
  });

  it('keeps needsRepair when the unit list is missing or mangled', () => {
    for (const units of [undefined, 'cup', [{ unit: 'cup', count: '1', gramsEach: 240 }]]) {
      const reading = readFoodAnswer(JSON.stringify({ ...COFFEE, units }), {});
      expect(reading.ok && reading.value.needsRepair).toBe(true);
      expect(reading.ok && reading.value.draft.units).toEqual([]);
    }
  });

  it('refuses an answer without protein, so the client asks the standby (D-16.58)', () => {
    const { protein: _gone, ...noProtein } = PIZZA;
    expect(readFoodAnswer(JSON.stringify(noProtein), {})).toEqual({
      ok: false,
      error: { kind: 'invalidResponse' },
    });
    expect(readFoodAnswer('No food here.', {}).ok).toBe(false);
  });
});

describe('needsUnitRepair (R03.17)', () => {
  const reading = (changes: Partial<NutritionDraft>, needsRepair = true): FoodReading => {
    const read = readFoodAnswer(JSON.stringify(COFFEE), {});
    if (!read.ok) throw new Error('fixture');
    return { draft: { ...read.value.draft, ...changes }, needsRepair };
  };

  it('asks only for a flagged list, a known weight and no energy or macros at all', () => {
    expect(needsUnitRepair(reading({}))).toBe(true);
    expect(needsUnitRepair(reading({}, false))).toBe(false);
    expect(needsUnitRepair(reading({ kcal: 320, protein: 12, carbs: 50, fat: 6 }))).toBe(false);
    expect(needsUnitRepair(reading({ fat: 0.4 }))).toBe(false);
    expect(needsUnitRepair(reading({ protein: 0.1 }))).toBe(false);
  });

  it('never asks for a food of unknown weight (R03.15)', () => {
    expect(needsUnitRepair(reading({ basis: { kind: 'servings', count: 1 } }))).toBe(false);
  });
});

describe('analyzePhotos: the unit repair request (R03.17, ACC-E9-1)', () => {
  it('asks once more for the units of black coffee and applies them (ACC-E9-1)', async () => {
    const fake = fakeFetch().on(GEMINI, answer(COFFEE), answer(CUP));
    const result = await settle(
      analyzePhotos({ images: [photo(7), photo(9)], note: NOTE }, depsFor(fake)),
    );

    const draft = draftOf(result);
    expect(draft.units).toEqual([{ unit: 'cup', gramsEach: 240, count: 1 }]);
    expect(draft).toMatchObject({ chosenUnit: 'cup', chosenCount: 1, kcal: 0, note: NOTE });
    expect(fake.requests).toHaveLength(2);

    const repair = fake.requests[1];
    const expected = unitRepairPrompt({
      name: 'Black coffee',
      grams: 240,
      note: NOTE,
      withPhoto: true,
    });
    expect(promptOf(repair)).toBe(expected.prompt);
    expect(photosOf(repair)).toEqual([jpegOf(7)]);
    expect(systemOf(repair)).toContain(expected.system);
    expect(systemOf(repair)).toContain(NOTES);
  });

  it('does not ask again for a pizza without units (ACC-E9-1)', async () => {
    const fake = fakeFetch().on(GEMINI, answer(PIZZA));
    const draft = draftOf(await settle(analyzePhotos({ images: [photo(7)] }, depsFor(fake))));

    expect(fake.requests).toHaveLength(1);
    expect(draft).toMatchObject({ name: 'Margherita pizza', kcal: 820, units: [] });
    expect(draft.chosenUnit).toBeUndefined();
  });

  it('does not ask again when the answer gave an empty unit list', async () => {
    const fake = fakeFetch().on(GEMINI, answer({ ...COFFEE, units: [] }));
    draftOf(await settle(analyzePhotos({ images: [photo(7)] }, depsFor(fake))));
    expect(fake.requests).toHaveLength(1);
  });

  it('keeps the first result when the repair request fails', async () => {
    const fake = fakeFetch().on(GEMINI, answer(COFFEE), {
      status: 500,
      json: geminiError(500, 'INTERNAL', 'Something broke.'),
    });
    const draft = draftOf(await settle(analyzePhotos({ images: [photo(7)] }, depsFor(fake))));

    expect(fake.requests).toHaveLength(2);
    expect(draft).toMatchObject({ name: 'Black coffee', units: [], basis: { grams: 240 } });
  });

  it('keeps the first result when the repair answer offers no unit', async () => {
    const fake = fakeFetch().on(GEMINI, answer(COFFEE), answer({ units: [] }));
    const draft = draftOf(await settle(analyzePhotos({ images: [photo(7)] }, depsFor(fake))));
    expect(fake.requests).toHaveLength(2);
    expect(draft.units).toEqual([]);
  });

  it('asks the standby when the repair list is mangled, and keeps the first result if it fails too', async () => {
    const fake = fakeFetch()
      .on(GEMINI, answer(COFFEE), answer({ units: ['1 cup'] }))
      .on(ANTHROPIC, { json: anthropicAnswer('{"units": [{"unit": "cup", "count": 2}]}') });
    const draft = draftOf(
      await settle(
        analyzePhotos({ images: [photo(7)] }, depsFor(fake, { settings: PHOTO_STANDBY })),
      ),
    );

    expect(fake.requests).toHaveLength(3);
    expect(fake.requests[2]?.url).toBe(ANTHROPIC);
    expect(draft.units).toEqual([]);
  });

  it('stops with cancelled when Cancel comes during the repair request', async () => {
    const cancel = new AbortController();
    const fake = fakeFetch().on(GEMINI, answer(COFFEE), { ...answer(CUP), delayMs: 5_000 });
    const running = analyzePhotos({ images: [photo(7)] }, depsFor(fake, { cancel: cancel.signal }));
    await advanceAsync(1_000);
    expect(fake.requests).toHaveLength(2);
    cancel.abort();

    expect(await settle(running)).toEqual({ ok: false, error: { kind: 'cancelled' } });
  });

  it('runs the repair inside the analysis time limit and keeps the first result when it runs out (D-16.60)', async () => {
    const fake = fakeFetch().on(
      GEMINI,
      { ...answer(COFFEE), delayMs: 20_000 },
      { ...answer(CUP), delayMs: 20_000 },
    );
    const running = analyzePhotos(
      { images: [photo(7)] },
      depsFor(fake, { settings: { timeoutSec: 30 } }),
    );
    await advanceAsync(29_999);
    expect(fake.requests).toHaveLength(2);
    const draft = draftOf(await settle(running, 1));

    expect(draft).toMatchObject({ name: 'Black coffee', units: [] });
  });

  it('shares a deadline handed in between the analysis and the repair, and leaves it running', async () => {
    const deadline = startDeadline({ timeoutSeconds: 120 });
    const fake = fakeFetch().on(
      GEMINI,
      { ...answer(COFFEE), delayMs: 3_000 },
      { ...answer(CUP), delayMs: 2_000 },
    );
    const draft = draftOf(
      await settle(analyzePhotos({ images: [photo(7)] }, depsFor(fake, { deadline })), 5_000),
    );

    expect(draft.units).toHaveLength(1);
    expect(deadline.remainingMs()).toBe(115_000);
    expect(deadline.stoppedBy()).toBeUndefined();
  });
});

describe('analyzePhotos: the photos sent (03 §3.5)', () => {
  it('sends only the first ten photos that hold bytes, in order', async () => {
    const images = [photo(1), photo(0), ...Array.from({ length: 10 }, (_, i) => photo(i + 2))];
    const fake = fakeFetch().on(GEMINI, answer(PIZZA));
    draftOf(await settle(analyzePhotos({ images }, depsFor(fake))));

    expect(MAX_MEAL_PHOTOS).toBe(10);
    expect(photosOf(fake.requests[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(jpegOf));
    expect(promptOf(fake.requests[0])).toBe(photoMealPrompt({ photoCount: 10 }).prompt);
  });

  it('fails as imageConversion and sends nothing when no photo holds bytes', async () => {
    const fake = fakeFetch();
    const result = await settle(analyzePhotos({ images: [photo(0)] }, depsFor(fake)));
    expect(result).toEqual({ ok: false, error: { kind: 'imageConversion' } });
    expect(fake.requests).toHaveLength(0);
  });

  it('asks for a plate built in steps only with two photos or more', async () => {
    const fake = fakeFetch().on(GEMINI, answer(PIZZA), answer(PIZZA));
    const two = draftOf(
      await settle(
        analyzePhotos({ images: [photo(3), photo(4)], progressive: true }, depsFor(fake)),
      ),
    );
    const one = draftOf(
      await settle(analyzePhotos({ images: [photo(3)], progressive: true }, depsFor(fake))),
    );

    expect(two.progressive).toBe(true);
    expect(one.progressive).toBe(false);
    expect(promptOf(fake.requests[0])).toBe(
      photoMealPrompt({ photoCount: 2, progressive: true }).prompt,
    );
    expect(promptOf(fake.requests[1])).toBe(photoMealPrompt({ photoCount: 1 }).prompt);
  });

  it('sends an unusable answer to the standby and returns the standby draft (D-16.22)', async () => {
    const { protein: _gone, ...noProtein } = PIZZA;
    const fake = fakeFetch()
      .on(GEMINI, answer(noProtein))
      .on(ANTHROPIC, { json: anthropicAnswer(JSON.stringify(PIZZA)) });
    const draft = draftOf(
      await settle(
        analyzePhotos({ images: [photo(3)] }, depsFor(fake, { settings: PHOTO_STANDBY })),
      ),
    );
    expect(draft).toMatchObject({ name: 'Margherita pizza', protein: 34 });
    expect(fake.requests).toHaveLength(2);
  });
});

describe('analyzeText', () => {
  it('sends the description to the text role and carries it to the repair request', async () => {
    const description = 'two glasses of sparkling water';
    const water = { ...COFFEE, name: 'Sparkling water', servingGrams: 500, emoji: '💧' };
    const fake = fakeFetch().on(
      OPENAI,
      { json: openAiAnswer(JSON.stringify(water)) },
      { json: openAiAnswer('{"units": [{"unit": "glass", "count": 2, "gramsEach": 250}]}') },
    );
    const settings: Partial<AiSettings> = {
      textRole: { on: true, provider: 'openai', model: defaultModel('openai', 'text') },
    };
    const draft = draftOf(await settle(analyzeText(description, depsFor(fake, { settings }))));

    expect(draft).toMatchObject({
      name: 'Sparkling water',
      emoji: '💧',
      units: [{ unit: 'glass', gramsEach: 250, count: 2 }],
      chosenUnit: 'glass',
      chosenCount: 2,
      progressive: false,
    });
    const [first, repair] = fake.requests.map(
      (request) => (request.body as { messages: { content: unknown }[] }).messages,
    );
    expect(first?.[1]?.content).toBe(textMealPrompt({ description }).prompt);
    expect(repair?.[1]?.content).toBe(
      unitRepairPrompt({ name: 'Sparkling water', grams: 500, note: description, withPhoto: false })
        .prompt,
    );
  });
});

describe('a price the person states (D-16.107)', () => {
  const ROLL = { ...PIZZA, name: 'Paneer roll', kcal: 420, servingGrams: 220 };
  const INR_120 = { amount: 120, currency: 'INR' };

  it('fills the price a description states, asking in their currency', async () => {
    const fake = fakeFetch().on(GEMINI, answer({ ...ROLL, price: INR_120 }));
    const draft = draftOf(await settle(analyzeText('paneer roll, ₹120', depsFor(fake), 'INR')));

    expect(draft.price).toEqual(INR_120);
    expect(promptOf(fake.requests[0])).toBe(
      textMealPrompt({ description: 'paneer roll, ₹120', currency: 'INR' }).prompt,
    );
  });

  it("puts a bare amount in the person's currency ('120 rupees' answered without a code)", async () => {
    const fake = fakeFetch().on(GEMINI, answer({ ...ROLL, price: { amount: 120 } }));
    const draft = draftOf(await settle(analyzeText('paneer roll 120', depsFor(fake), 'INR')));
    expect(draft.price).toEqual(INR_120);
  });

  it('leaves the price empty when the description states none', async () => {
    const fake = fakeFetch().on(GEMINI, answer({ ...ROLL, price: null }));
    const draft = draftOf(await settle(analyzeText('paneer roll', depsFor(fake), 'INR')));
    expect(draft).not.toHaveProperty('price');
  });

  it('never keeps a price the AI gives for words without a figure, or photos without a note', async () => {
    const fake = fakeFetch().on(
      GEMINI,
      answer({ ...ROLL, price: INR_120 }),
      answer({ ...ROLL, price: INR_120 }),
    );
    const typed = draftOf(await settle(analyzeText('paneer roll', depsFor(fake), 'INR')));
    const photos = draftOf(
      await settle(analyzePhotos({ images: [photo(4)], currency: 'INR' }, depsFor(fake))),
    );
    expect(typed).not.toHaveProperty('price');
    expect(photos).not.toHaveProperty('price');
  });

  it("fills the price a photo's note states", async () => {
    const fake = fakeFetch().on(
      GEMINI,
      answer({ ...ROLL, price: { amount: 8.5, currency: 'USD' } }),
    );
    const draft = draftOf(
      await settle(
        analyzePhotos({ images: [photo(4)], note: 'paid $8.50', currency: 'INR' }, depsFor(fake)),
      ),
    );
    expect(draft.price).toEqual({ amount: 8.5, currency: 'USD' });
    expect(promptOf(fake.requests[0])).toBe(
      photoMealPrompt({ photoCount: 1, note: 'paid $8.50', currency: 'INR' }).prompt,
    );
  });
});

describe('analyzeLabelScan (Proposed D-16.62)', () => {
  it('sends the photos with the label request, through the photo path, progressive off', async () => {
    const bar = { ...PIZZA, name: 'Oat bar', kcal: 190, servingGrams: 45, units: [] };
    const fake = fakeFetch().on(GEMINI, answer({ ...bar, progressive: true }));
    const draft = draftOf(
      await settle(analyzeLabelScan({ images: [photo(4), photo(6)], note: NOTE }, depsFor(fake))),
    );

    expect(draft).toMatchObject({ name: 'Oat bar', kcal: 190, progressive: false, note: NOTE });
    expect(promptOf(fake.requests[0])).toBe(labelScanPrompt({ photoCount: 2, note: NOTE }).prompt);
    expect(photosOf(fake.requests[0])).toEqual([jpegOf(4), jpegOf(6)]);
  });
});
