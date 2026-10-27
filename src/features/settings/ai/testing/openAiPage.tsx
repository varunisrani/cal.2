// Test helper: Settings › AI providers over a fresh test database, with the screen harness's real
// AI setup service and every call it makes tracked, so a test can wait until the page has no
// storage call running (`settled`). A test stores its starting settings and keys in `prepare`.

import { act, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { aiSetup } from '../../../../i18n/en/aiSetup';
import { hasSettingsEdits } from '../../../../services/aiSetup';
import { ServicesProvider } from '../../../../services/context';
import { openHarness, until, type Harness } from '../../../../test/screenHarness';
import { AiPage } from '../AiPage';

export const pageWords = aiSetup.aiSetup.page;
export const formWords = aiSetup.aiSetup;

export interface OpenAiOptions {
  /** Stores what the page starts from (settings, keys) before it opens. */
  readonly prepare?: (h: Harness) => Promise<void>;
  /** What to mount instead of the whole page. */
  readonly ui?: ReactNode;
}

/** One turn of the event loop (a message, not a timer), so storage callbacks can run. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

const MAX_TURNS = 2_000;
/** Turns with nothing running before the page counts as settled (a save may queue the next). */
const QUIET_TURNS = 3;

export async function openAiPage(options: OpenAiOptions = {}) {
  const h = await openHarness({ hash: '#/settings/ai' });
  await options.prepare?.(h);
  const real = h.services.aiSetup;
  if (!hasSettingsEdits(real)) throw new Error('openAiPage: the harness service has no edits');

  const inFlight = new Set<Promise<unknown>>();
  const tracked = Object.fromEntries(
    Object.entries(real).map(([name, method]) => [
      name,
      (...args: unknown[]) => {
        const call = Promise.resolve((method as (...given: unknown[]) => unknown)(...args));
        inFlight.add(call);
        const done = () => inFlight.delete(call);
        call.then(done, done);
        return call;
      },
    ]),
  ) as unknown as typeof real;

  /** Waits until no storage call has run for a few turns, and React has drawn the outcome. */
  const settled = async (): Promise<void> => {
    let quiet = 0;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      await act(nextTurn);
      quiet = inFlight.size === 0 ? quiet + 1 : 0;
      if (quiet >= QUIET_TURNS) return;
    }
    throw new Error('settled: a storage call never finished');
  };

  h.mount(
    <ServicesProvider services={{ ...h.services, aiSetup: tracked }}>
      {options.ui ?? <AiPage />}
    </ServicesProvider>,
  );
  if (!options.ui) await until(() => document.querySelector('[data-ui="ai"]') !== null);
  await settled();

  return { ...h, service: real, settled };
}

/** A card of the page, found by its heading. */
export function card(heading: string): HTMLElement {
  return screen.getByRole('region', { name: heading });
}

/** The provider and model pickers of a card. */
export function pickers(region: HTMLElement) {
  return {
    provider: within(region).getByRole('combobox', { name: formWords.provider.label }),
    model: within(region).getByRole('combobox', { name: formWords.model.label }),
  };
}
