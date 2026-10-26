/**
 * Playwright global setup: starts the fake AI provider (server.ts) on 127.0.0.1 at
 * PLATEWISE_FAKE_AI_PORT (default 4320) before the first spec, and returns the teardown that stops
 * it after the last one. Specs read its root URL from PLATEWISE_FAKE_AI_URL.
 */
import { FAKE_AI_URL_ENV, startFakeAi } from './server';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const fake = await startFakeAi();
  process.env[FAKE_AI_URL_ENV] = fake.url;
  console.log(`fake AI provider listening on ${fake.url}`);
  return async () => {
    await fake.close();
    console.log('fake AI provider stopped');
  };
}
