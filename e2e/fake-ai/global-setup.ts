/**
 * Playwright global setup: starts the fake AI provider on 127.0.0.1 (port from
 * PLATEWISE_FAKE_AI_PORT, default 4320) before any spec runs. The returned function is
 * Playwright's global teardown and stops it after the last one.
 */
import { startFakeAiServer } from './server';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const server = await startFakeAiServer();
  return () => server.close();
}
