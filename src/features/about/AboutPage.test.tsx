import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { version as packageVersion } from '../../../package.json';
import { createRouter, type Router } from '../../app/router';
import { createAppUpdates, type AppUpdates } from '../../app/swRegistration';
import { memoryHost, type MemoryHost } from '../../app/testing/memoryHost';
import { RouterProvider } from '../../app/useRoute';
import { APP_VERSION } from '../../config/build';
import { INSPIRATION } from '../../config/credit';
import { LINKS, type PlatewiseLinks } from '../../config/links';
import { about } from '../../i18n/en/about';
import { settings } from '../../i18n/en/settings';
import { untilLoaded } from '../../test/lazy';
import { ToastProvider } from '../../ui/Toast';
import { categoryFor } from '../settings/registry';
import { SettingsScreen } from '../settings/SettingsScreen';
import { settle } from '../water/testing/openWater';
import { AboutPage, type AboutPageProps } from './AboutPage';
import type { ShareTarget } from './share';

const words = about.about.page;

beforeAll(async () => {
  // Fetched on first open in the app; loaded here first so no wait includes its transform.
  await import('./AboutPage');
});

interface Opened {
  readonly host: MemoryHost;
  readonly router: Router;
}

function open(props: AboutPageProps = {}, hash = '#/settings/about'): Opened {
  const host = memoryHost(hash);
  const router = createRouter(host);
  render(
    <RouterProvider router={router}>
      <ToastProvider>
        <AboutPage {...props} />
      </ToastProvider>
    </RouterProvider>,
  );
  return { host, router };
}

function part(ui: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-ui="${ui}"]`);
  if (!found) throw new Error(`nothing drawn for ${ui}`);
  return found;
}

const shown = (text: string) => () => screen.queryByText(text) !== null;

/** A waiting version whose take-over the test can watch. */
function waitingUpdate(): { updates: AppUpdates; takeOver: ReturnType<typeof vi.fn> } {
  const updates = createAppUpdates();
  const takeOver = vi.fn();
  updates.offer(takeOver);
  return { updates, takeOver };
}

const SUPPLIED: PlatewiseLinks = {
  ...LINKS,
  help: 'https://platewise.example/help',
  contact: 'mailto:hello@platewise.example',
  source: 'https://code.platewise.example/',
  changelog: 'https://platewise.example/changes',
};

describe('AboutPage', () => {
  it('shows the mark, the name and the version of this build, which is package.json’s', () => {
    open();
    expect(APP_VERSION).toBe(packageVersion);
    expect(part('about.version')).toHaveTextContent(`Version ${packageVersion}`);
    expect(screen.getByText('Platewise')).toBeVisible();
    expect(document.querySelector('img')).toHaveAttribute('src', '/icons/mark.svg');
  });

  it('says Up to date, with no Reload, while no new version waits', () => {
    open({ updates: createAppUpdates() });
    const row = part('about.update');
    expect(row).toHaveTextContent(words.updates.current);
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('says Update ready when a version starts waiting, and lets it in only when Reload is pressed', () => {
    const updates = createAppUpdates();
    const takeOver = vi.fn();
    open({ updates });
    expect(part('about.update')).toHaveTextContent(words.updates.current);

    act(() => updates.offer(takeOver));

    expect(part('about.update')).toHaveTextContent(words.updates.ready);
    expect(takeOver).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: words.updates.reload }));
    expect(takeOver).toHaveBeenCalledTimes(1);
  });

  it('opens on Update ready when the version was already waiting', () => {
    const { updates, takeOver } = waitingUpdate();
    open({ updates });
    expect(part('about.update')).toHaveTextContent(words.updates.readyHint);
    expect(takeOver).not.toHaveBeenCalled();
  });

  it('shares the app’s address through the share sheet when the browser has one', async () => {
    const share = vi.fn<NonNullable<ShareTarget['share']>>(() => Promise.resolve());
    const copy = vi.fn<NonNullable<ShareTarget['copy']>>(() => Promise.resolve());
    open({ shareTarget: { share, copy } });

    fireEvent.click(screen.getByRole('button', { name: words.share.label }));
    await settle(() => share.mock.calls.length > 0);

    expect(share).toHaveBeenCalledWith({
      title: 'Platewise',
      text: words.share.text,
      url: `${window.location.origin}/`,
    });
    expect(copy).not.toHaveBeenCalled();
  });

  it('copies the link instead, and says so, when the browser cannot share', async () => {
    const copy = vi.fn<NonNullable<ShareTarget['copy']>>(() => Promise.resolve());
    open({ shareTarget: { copy }, links: { ...LINKS, site: 'https://platewise.example/' } });

    fireEvent.click(screen.getByRole('button', { name: words.share.label }));
    await settle(shown(words.share.copied));

    expect(copy).toHaveBeenCalledWith('https://platewise.example/');
  });

  it('gives the address in its message when neither sharing nor copying works', async () => {
    open({ shareTarget: {}, links: { ...LINKS, site: 'https://platewise.example/' } });

    fireEvent.click(screen.getByRole('button', { name: words.share.label }));
    const message = words.share.failed.replace('{url}', 'https://platewise.example/');
    await settle(shown(message));
  });

  it('leaves out every link the owner has not supplied yet', () => {
    open({ links: { ...LINKS, help: null, contact: null, source: null, changelog: null } });
    expect(document.querySelector('[data-ui="about.help"]')).toBeNull();
    expect(document.querySelector('[data-ui="about.link.changelog"]')).toBeNull();
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('shows supplied links: pages in a new tab, the email in the mail app', () => {
    open({ links: SUPPLIED });
    const help = within(part('about.help'));
    expect(help.getAllByRole('link').map((link) => link.textContent)).toEqual([
      words.help.help,
      words.help.contact,
      words.help.source,
    ]);
    const page = screen.getByRole('link', { name: words.help.help });
    expect(page).toHaveAttribute('href', 'https://platewise.example/help');
    expect(page).toHaveAttribute('target', '_blank');
    expect(page).toHaveAttribute('rel', 'noopener noreferrer');
    const mail = screen.getByRole('link', { name: words.help.contact });
    expect(mail).toHaveAttribute('href', 'mailto:hello@platewise.example');
    expect(mail).not.toHaveAttribute('target');
    expect(screen.getByRole('link', { name: words.updates.changelog })).toHaveAttribute(
      'href',
      'https://platewise.example/changes',
    );
  });

  it('opens the calculation methods and the licences and credits pages', () => {
    const { host } = open();
    fireEvent.click(screen.getByRole('button', { name: about.about.methods.title }));
    expect(host.hash()).toBe('#/settings/methods');
    fireEvent.click(screen.getByRole('button', { name: about.about.credits.title }));
    expect(host.hash()).toBe('#/settings/credits');
  });

  it('names the app that inspired Platewise', () => {
    open();
    expect(INSPIRATION.name).toMatch(/\S/);
    expect(part('about.inspired')).toHaveTextContent(
      words.inspired.replace('{name}', INSPIRATION.name),
    );
  });

  it('is a Settings page at #/settings/about, listed under About on the hub', async () => {
    expect(categoryFor(['about'])).toMatchObject({ id: 'about', titleKey: 'about.page.title' });
    const host = memoryHost('#/settings');
    const router = createRouter(host);
    const { rerender } = render(
      <RouterProvider router={router}>
        <ToastProvider>
          <SettingsScreen nested={[]} />
        </ToastProvider>
      </RouterProvider>,
    );
    const info = screen.getByRole('region', { name: settings.settings.group.info });
    expect(within(info).getByRole('button', { name: words.title })).toBeVisible();

    rerender(
      <RouterProvider router={router}>
        <ToastProvider>
          <SettingsScreen nested={['about']} />
        </ToastProvider>
      </RouterProvider>,
    );
    await untilLoaded();
    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    expect(part('about.version')).toBeVisible();
  });
});
