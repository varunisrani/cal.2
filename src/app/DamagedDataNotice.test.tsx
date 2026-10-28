import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider, type DataSources } from '../data/DataProvider';
import { decodeEntry } from '../data/codecs';
import {
  UNREADABLE_FLAG,
  clearUnreadableFlag,
  hasUnreadableData,
  readAll,
  settleQuarantine,
} from '../data/guard';
import type { PlatewiseDb } from '../data/schema';
import { shell } from '../i18n/en/shell';
import { fixedClock } from '../lib/clock';
import { ServicesProvider, type Services } from '../services/context';
import { createDamagedDataService, type DamagedDataService } from '../services/damagedData';
import { countRuns, openTestDb, type CountedQuery } from '../test/db';
import { FACTORY_NOW, makeEntry } from '../test/factories';
import { untilGone, untilShown } from '../test/screenHarness';
import { DamagedDataNotice } from './DamagedDataNotice';

const words = shell.shell.damagedData;
const NOTICE = '[data-ui="shell.damagedData"]';
const clock = fixedClock(FACTORY_NOW, 'America/New_York');

const opened: Array<{ db: PlatewiseDb; flag: CountedQuery<[], boolean> }> = [];

afterEach(async () => {
  for (const { db, flag } of opened.splice(0)) {
    await settleQuarantine(db);
    flag.close();
    db.close();
  }
});

/** The flag as the app reads it, through a Dexie chain so its runs can be counted. */
async function setUp() {
  const { db } = await openTestDb();
  const flag = countRuns(() => db.meta.get(UNREADABLE_FLAG).then((row) => row?.value === true));
  opened.push({ db, flag });
  return { db, flag };
}

/** Puts an unreadable entry beside a good one and lets the guard set it aside, as a read would. */
async function damage(db: PlatewiseDb): Promise<void> {
  await db.table('entries').bulkPut([makeEntry({ id: 'good' }), { id: 'broken', kcal: 'lots' }]);
  await readAll(db, 'entries', decodeEntry);
  await settleQuarantine(db);
}

/** Only what the notice reads; every other read never finishes (the notice never asks). */
function sourcesOver(flag: CountedQuery<[], boolean>): DataSources {
  const unused = () => new Dexie.Promise<never>(() => {});
  return {
    profileRepo: { get: unused },
    settingsRepo: { snapshot: unused, loaded: unused() },
    diaryRepo: { byDay: unused, between: unused },
    waterRepo: { byDay: unused },
    fastRepo: { between: unused, active: unused },
    weightRepo: { between: unused },
    bodyFatRepo: { between: unused },
    savedMealsRepo: { list: unused },
    coachRepo: { list: unused, chats: unused, summaries: unused },
    unreadableFlag: flag.query,
    clock,
  };
}

function servicesWith(damagedData: DamagedDataService): Services {
  return {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
    onboarding: { complete: vi.fn() },
    aiSetup: {
      saveChoice: vi.fn(),
      savedKeyMask: vi.fn(),
      setTermsAccepted: vi.fn(),
      setUpLater: vi.fn(),
    },
    planBuilder: { build: vi.fn() },
    damagedData,
    clock,
  };
}

function mount(flag: CountedQuery<[], boolean>, damagedData: DamagedDataService) {
  return render(
    <ServicesProvider services={servicesWith(damagedData)}>
      <DataProvider sources={sourcesOver(flag)}>
        <DamagedDataNotice />
      </DataProvider>
    </ServicesProvider>,
  );
}

const serviceOver = (db: PlatewiseDb) =>
  createDamagedDataService({ clearFlag: () => clearUnreadableFlag(db) });

describe('DamagedDataNotice', () => {
  it('draws nothing while no stored data has been set aside, and shows the notice once some has (R06.1, ACC-K9-2)', async () => {
    const { db, flag } = await setUp();
    mount(flag, serviceOver(db));
    await act(() => flag.untilRuns(1));
    expect(document.querySelector(NOTICE)).toBeNull();

    await act(() => damage(db));
    await untilShown(NOTICE);
    const notice = screen.getByRole('status');
    expect(notice).toHaveAttribute('data-ui', 'shell.damagedData');
    expect(notice).toHaveTextContent(words.title);
    expect(notice).toHaveTextContent(words.body);
    expect(screen.getByRole('button', { name: words.dismiss })).toHaveAttribute(
      'data-ui',
      'shell.damagedData.dismiss',
    );
  });

  it('clears the flag on Dismiss, and stays gone after the live state is read again (R06.1, ACC-K9-2)', async () => {
    const user = userEvent.setup();
    const { db, flag } = await setUp();
    await damage(db);
    const first = mount(flag, serviceOver(db));
    await untilShown(NOTICE);

    await user.click(screen.getByRole('button', { name: words.dismiss }));
    await untilGone(NOTICE);
    expect(await hasUnreadableData(db)).toBe(false);
    // The damaged row is still there, and its copy is still aside.
    expect(await db.entries.get('broken')).toEqual({ id: 'broken', kcal: 'lots' });
    expect(await db.quarantine.count()).toBe(1);

    // The same damaged row is read again, and the notice is drawn afresh over the live state.
    first.unmount();
    await damage(db);
    const runs = flag.runs();
    mount(flag, serviceOver(db));
    await act(() => flag.untilRuns(runs + 1));
    expect(document.querySelector(NOTICE)).toBeNull();
    expect(await hasUnreadableData(db)).toBe(false);
  });

  it('keeps the notice when the flag cannot be cleared, and says so in the console', async () => {
    const user = userEvent.setup();
    const { db, flag } = await setUp();
    await damage(db);
    const failure = new DOMException('The quota has been exceeded', 'QuotaExceededError');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(flag, { dismiss: () => Promise.reject(failure) });
    await untilShown(NOTICE);

    await user.click(screen.getByRole('button', { name: words.dismiss }));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('Platewise'), failure);
    expect(document.querySelector(NOTICE)).not.toBeNull();
    expect(await hasUnreadableData(db)).toBe(true);
  });

  it('draws nothing, and reads nothing, without the service', () => {
    const { container } = render(<DamagedDataNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
