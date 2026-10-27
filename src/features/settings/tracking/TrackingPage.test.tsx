import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fasting } from '../../../i18n/en/fasting';
import { goals } from '../../../i18n/en/goals';
import { profile } from '../../../i18n/en/profile';
import { settings } from '../../../i18n/en/settings';
import { trackers } from '../../../i18n/en/trackers';
import { createFastingService } from '../../../services/fasting';
import { createHomePrefsService } from '../../../services/homePrefs';
import { ServicesProvider } from '../../../services/context';
import { makeProfile } from '../../../test/factories';
import { untilLoaded } from '../../../test/lazy';
import { closeHarnesses, until, untilShown } from '../../../test/screenHarness';
import { HomePage } from '../../home/HomePage';
import { openWater, settle } from '../../water/testing/openWater';
import { WaterMenuPage } from '../../water/WaterMenuPage';
import { categoryFor } from '../registry';
import { SettingsScreen } from '../SettingsScreen';
import { TrackingPage } from './TrackingPage';

afterEach(closeHarnesses);

const words = trackers.trackers;
const fastingWords = fasting.fasting;

/** The hooks of the fasting card's rows, in order. */
const fastingRows = (): string[] =>
  Array.from(document.querySelectorAll('[data-ui="fasting.settings"] li > button')).map(
    (row) => row.getAttribute('data-ui') ?? '',
  );

/** The hooks of the water card's rows, in order. */
const waterRows = (): string[] =>
  Array.from(document.querySelectorAll('[data-ui="water.settings"] li > button')).map(
    (row) => row.getAttribute('data-ui') ?? '',
  );

beforeAll(async () => {
  // Fetched on first open in the app; loaded here first so no wait includes its transform.
  await import('./TrackingPage');
});

describe('TrackingPage', () => {
  it('is listed with the preferences, after Goals', async () => {
    expect(categoryFor(['tracking'])).toMatchObject({
      id: 'tracking',
      titleKey: 'trackers.page.title',
      group: 'prefs',
    });

    const h = await openWater({ hash: '#/settings' });
    h.mount(<SettingsScreen nested={[]} />);
    const prefs = screen.getByRole('region', { name: settings.settings.group.prefs });
    // Later pages join the group after Tracking; only the first three are this page's concern.
    expect(
      within(prefs)
        .getAllByRole('button')
        .map((row) => row.textContent)
        .slice(0, 3),
    ).toEqual([profile.profile.title, goals.goals.page.title, words.page.title]);
  });

  it('is fetched on first open and shows the water card under its title', async () => {
    const h = await openWater();
    h.mount(<SettingsScreen nested={['tracking']} />);

    expect(screen.getByRole('heading', { level: 1, name: words.page.title })).toBeVisible();
    await untilLoaded();
    await untilShown('[data-ui="water.settings"]');
    expect(screen.getByRole('region', { name: words.water.heading })).toBeVisible();
  });

  it("shows water's own rows only while water is switched on (ACC-J10-1)", async () => {
    const user = userEvent.setup();
    const h = await openWater();
    h.mount(<TrackingPage />);
    await untilShown('[data-ui="water.settings"]');
    const tracking = screen.getByRole('switch', { name: words.water.settings.tracking });

    expect(tracking).toHaveAttribute('aria-checked', 'false');
    expect(waterRows()).toEqual(['water.tracking']);

    await user.click(tracking);
    await until(() => waterRows().length === 4);
    expect(waterRows()).toEqual(['water.tracking', 'water.goal', 'water.unit', 'water.quickAdd']);

    // The switch is held while its write runs; that ends with a plain state update.
    await settle(() => !(tracking as HTMLButtonElement).disabled);
    await user.click(tracking);
    await until(() => waterRows().length === 1);
  });

  it("shows fasting's own rows only while fasting is switched on (ACC-J10-1)", async () => {
    const user = userEvent.setup();
    const h = await openWater();
    const fasting = createFastingService({ ...h.repos, clock: h.clock });
    h.mount(
      <ServicesProvider services={{ ...h.services, fasting }}>
        <TrackingPage />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="fasting.settings"]');
    const tracking = screen.getByRole('switch', { name: fastingWords.settings.tracking });
    expect(screen.getByRole('region', { name: fastingWords.settings.heading })).toBeVisible();

    expect(tracking).toHaveAttribute('aria-checked', 'false');
    expect(fastingRows()).toEqual(['fasting.tracking']);

    await user.click(tracking);
    await until(() => fastingRows().length === 2);
    expect(fastingRows()).toEqual(['fasting.tracking', 'fasting.goal']);
    // Water's card is not changed by it.
    expect(waterRows()).toEqual(['water.tracking']);

    await settle(() => !(tracking as HTMLButtonElement).disabled);
    await user.click(tracking);
    await until(() => fastingRows().length === 1);
  });

  it('adds the water pillar on Home once water is turned on, and a log from the water page fills it (ACC-H1-1)', async () => {
    const user = userEvent.setup();
    const h = await openWater({ hash: '#/home' });
    await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
    const services = {
      ...h.services,
      homePrefs: createHomePrefsService({ settingsRepo: h.repos.settingsRepo }),
    };
    h.mount(
      <ServicesProvider services={services}>
        <HomePage />
        <TrackingPage />
        <WaterMenuPage day="2026-10-26" onDone={() => undefined} onBack={() => undefined} />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="water.settings"]');
    await untilShown('[data-ui="home.pillar.protein"]');
    expect(document.querySelector('[data-ui="home.pillar.water"]')).toBeNull();

    await user.click(screen.getByRole('switch', { name: words.water.settings.tracking }));
    await untilShown('[data-ui="home.pillar.water"]');
    expect(document.querySelector('[data-ui="home.pillar.water"]')?.textContent).toMatch(/^0/);

    await user.click(screen.getByRole('button', { name: '500 ml' }));
    await until(() =>
      (document.querySelector('[data-ui="home.pillar.water"]')?.textContent ?? '').startsWith(
        '500',
      ),
    );
  });
});
