/// <reference lib="dom" />
/**
 * The part of the live provider check (P10-12) that runs inside the built app's page. Vite bundles
 * it into one classic script whose exports land on a global (`LIVE_GLOBAL` in `browser.ts`); the
 * Node side serves it from the app's origin and calls `run` once per check. A photo check sends
 * one meal photo through the app's own food task (prompt, client, retry ladder, deadline, reply
 * parser); a Coach check runs one turn of the app's own Coach engine, tools included, over a small
 * made-up diary. Each check uses one provider and no standby, so the result is that provider's.
 * It returns facts only: timings, request counts, HTTP statuses, failure kinds and numbers from a
 * parsed answer. Never the key, never the provider's text (which can echo part of a key).
 */
import type { AiFailureKind } from '../../src/ai/errors';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../src/ai/settings';
import { analyzePhotos } from '../../src/ai/tasks/food';
import { PROVIDERS, type ProviderId } from '../../src/ai/catalog/providers';
import { dayKeyOf } from '../../src/domain/dates/dayKey';
import { runTurn } from '../../src/services/coach/engine';
import type { CoachSnapshot } from '../../src/services/coach/snapshot';
import { makeEntry, makeProfile } from '../../src/test/factories';

interface CheckBase {
  readonly provider: ProviderId;
  /** The address the app would use: the vendor's own, or the person's server. */
  readonly baseUrl: string;
  readonly model: string;
  /** Left out when no key is sent (Ollama, a Custom server without one). */
  readonly key?: string;
  /** The app's time limit for the whole action, in seconds. */
  readonly timeoutSeconds: number;
}

/** One photo of a meal, analysed as the + menu's photo logging would. */
export interface PhotoCheck extends CheckBase {
  readonly kind: 'photo';
  /** The photo's bytes as base64 (a JPEG). */
  readonly photo: string;
}

/** One Coach question about yesterday, which the tools can answer. */
export interface CoachCheck extends CheckBase {
  readonly kind: 'coach';
}

export type LiveCheck = PhotoCheck | CoachCheck;

/** What one check gave, as facts the Node side can print. */
export interface CheckResult {
  readonly ok: boolean;
  /** From the first request to the result, in milliseconds. */
  readonly ms: number;
  /** Requests sent (retries, re-asks and tool rounds included). */
  readonly requests: number;
  /** The HTTP status of each reply that came back, in order. */
  readonly statuses: readonly number[];
  /** Why it failed. */
  readonly failure?: AiFailureKind;
  /** The status the failure was read from, when it came from a reply. */
  readonly failureStatus?: number;
  /** Photo: the answer's energy, rounded, and its number of parts. */
  readonly kcal?: number;
  readonly parts?: number;
  /** Coach: the answer's length in characters. */
  readonly answerChars?: number;
}

const QUESTION = 'What did I eat yesterday, and about how many calories was it?';
const DAY_MS = 86_400_000;

/** The app's settings with one provider in the primary role, standbys off. */
function settingsFor(check: LiveCheck): AiSettings {
  const ownServer = PROVIDERS[check.provider].endpoint === 'userServer';
  return {
    ...DEFAULT_AI_SETTINGS,
    primary: { provider: check.provider, model: check.model },
    textRole: { ...DEFAULT_AI_SETTINGS.textRole, on: false },
    imageStandby: { ...DEFAULT_AI_SETTINGS.imageStandby, on: false },
    textStandby: { ...DEFAULT_AI_SETTINGS.textStandby, on: false },
    endpoints: ownServer ? { [check.provider]: { main: check.baseUrl, standby: '' } } : {},
    timeoutSec: check.timeoutSeconds,
  };
}

/** A small diary: two meals yesterday, nothing today. */
function snapshotNow(): CoachSnapshot {
  const now = Date.now();
  const yesterday = now - DAY_MS;
  const meal = (name: string, kcal: number, at: number) =>
    makeEntry({ name, kcal, loggedAt: at, dayKey: dayKeyOf(at) });
  return {
    now,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    profile: makeProfile(),
    units: { energy: 'kcal', weight: 'kg', height: 'cm' },
    entries: [
      meal('Porridge with banana', 380, yesterday - 4 * 3_600_000),
      meal('Chicken wrap', 560, yesterday),
    ],
    weighIns: [],
    bodyFat: [],
    fasts: [],
    water: { on: false, goalMl: 2000, unit: 'ml', logs: [] },
    activity: null,
  };
}

function photoBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: 'image/jpeg' });
}

export async function run(check: LiveCheck): Promise<CheckResult> {
  let requests = 0;
  const statuses: number[] = [];
  const counted: typeof fetch = async (input, init) => {
    requests++;
    const response = await fetch(input, init);
    statuses.push(response.status);
    return response;
  };
  const deps = {
    settings: settingsFor(check),
    keys: check.key === undefined ? {} : { [check.provider]: check.key },
    fetch: counted,
  };
  const started = performance.now();
  const facts = () => ({ ms: Math.round(performance.now() - started), requests, statuses });

  if (check.kind === 'photo') {
    const result = await analyzePhotos({ images: [photoBlob(check.photo)] }, deps);
    if (!result.ok) return failed(result.error, facts());
    return {
      ok: true,
      ...facts(),
      kcal: Math.round(result.value.kcal),
      parts: result.value.lines.length,
    };
  }
  const result = await runTurn(
    {
      messages: [],
      question: { id: 'live-check-question', text: QUESTION },
      snapshot: snapshotNow(),
    },
    deps,
  );
  if (!result.ok) return failed(result.error, facts());
  return { ok: true, ...facts(), answerChars: result.value.text.length };
}

function failed(
  failure: { kind: AiFailureKind; status?: number },
  facts: Pick<CheckResult, 'ms' | 'requests' | 'statuses'>,
): CheckResult {
  return {
    ok: false,
    ...facts,
    failure: failure.kind,
    ...(failure.status === undefined ? {} : { failureStatus: failure.status }),
  };
}
