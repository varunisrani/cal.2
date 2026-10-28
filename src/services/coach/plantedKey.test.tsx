// Security review (P10-09): Coach Details never show an API key. Every key slot holds a planted
// key, read by the session through the real AI access (the sealed secrets table). Each request
// must carry its own provider's key and no other; the provider and its standby both refuse with
// error bodies that echo every AI key. The stored mark the Details view reads, the Details text on
// screen, a backup made afterwards and the console are searched for every planted key in every
// form. (The food-database key never reaches an AI provider, so no provider can echo it: the
// request check proves that half.)
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../ai/settings';
import { fakeFetch } from '../../ai/testing/fakeFetch';
import { anthropicError, openAiError } from '../../ai/testing/wire';
import { createBackupRepo } from '../../data/repos/backupRepo';
import { createSecretsRepo } from '../../data/repos/secretsRepo';
import type { PlatewiseDb } from '../../data/schema';
import { ErrorBanner } from '../../features/coach/ErrorBanner';
import { coach } from '../../i18n/en/coach';
import { makeProfile } from '../../test/factories';
import {
  blobBytes,
  describeValue,
  plantKeys,
  plantedIn,
  plantedProviderKeys,
  recordConsole,
} from '../../test/plantedKeys';
import { createAiAccess } from '../aiAccess';
import { makeBackup } from '../backup/backup';
import { fixtureDiary } from './__fixtures__/snapshot';
import { closeAll, openCoachStores } from './__fixtures__/stores';
import { createCoachSession } from './session';

const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

const PRIMARY_ONLY: AiSettings = {
  ...DEFAULT_AI_SETTINGS,
  primary: { provider: 'mistral', model: 'mistral-small-2603' },
};
const WITH_STANDBY: AiSettings = {
  ...PRIMARY_ONLY,
  textStandby: { on: true, provider: 'anthropic', model: 'claude-haiku-5-5' },
};

/** An error text that repeats every AI key: worse than any provider could send back. */
const ECHO = `Key refused. Keys seen: ${Object.values(plantedProviderKeys()).join(' / ')}.`;

const opened: PlatewiseDb[] = [];
afterEach(() => closeAll(opened));

async function setUp(settings: AiSettings) {
  const stores = await openCoachStores();
  opened.push(stores.db);
  await stores.profileRepo.save(makeProfile());
  await stores.diaryRepo.addMany(fixtureDiary());
  await plantKeys(stores.db, stores.clock);
  await stores.settingsRepo.set('ai.settings', settings);
  const fake = fakeFetch()
    .on(MISTRAL, { status: 401, json: openAiError(ECHO) })
    .on(ANTHROPIC, { status: 401, json: anthropicError('authentication_error', ECHO) });
  const session = createCoachSession({
    coachRepo: stores.coachRepo,
    data: stores.sources,
    aiAccess: createAiAccess({
      settingsRepo: stores.settingsRepo,
      secretsRepo: createSecretsRepo(stores.db, { clock: stores.clock }),
    }),
    fetch: fake.fetch,
    photoOnlyText: () => 'Look at the photo, please.',
  });
  return { stores, session, fake };
}

describe('Coach Details: no key in any output (P10-09, D-16.31, R03.18)', () => {
  it.each([
    ['the primary alone', PRIMARY_ONLY, [MISTRAL]],
    ['the primary and its standby', WITH_STANDBY, [MISTRAL, ANTHROPIC]],
  ] as const)(
    'stores and shows a refusal from %s with every key cut out',
    async (_name, settings, called) => {
      const logged = recordConsole();
      const { stores, session, fake } = await setUp(settings);

      expect(await session.send('chat-1', 'What did I eat yesterday?')).toBe('failed');
      expect(fake.requests.map((request) => request.url)).toEqual(called);
      // Each request carries its own provider's key, and no other key at all.
      expect(fake.requests.map((request) => plantedIn(describeValue(request)))).toEqual(
        called.map((url) => [url === MISTRAL ? 'mistral' : 'anthropic']),
      );

      const [question] = await stores.coachRepo.list('chat-1');
      const mark = question?.state;
      if (mark?.status !== 'failed') throw new Error('the question is not marked failed');
      expect(mark.kind).toBe('keyRejected');
      // The provider's words are kept for Details, the keys in them are not.
      expect(mark.details).toContain('Key refused.');
      expect(mark.details).toContain('•••');
      expect(plantedIn(describeValue(await stores.coachRepo.list('chat-1')))).toEqual([]);

      render(
        <ErrorBanner kind={mark.kind} details={mark.details} pending={false} onRetry={() => {}} />,
      );
      fireEvent.click(screen.getByRole('button', { name: coach.coach.error.details }));
      expect(document.body.textContent).toContain('Key refused.');
      expect(plantedIn(document.body.innerHTML)).toEqual([]);

      // The marked question travels in backups: the backup holds no key either.
      const made = await makeBackup({
        backupRepo: createBackupRepo(stores.db),
        clock: stores.clock,
        appVersion: '0.1.0',
      });
      if (!made.ok) throw new Error(`no backup: ${made.error}`);
      expect(plantedIn(await blobBytes(made.value.file))).toEqual([]);

      expect(plantedIn(logged.calls().join('\n'))).toEqual([]);
    },
  );
});
