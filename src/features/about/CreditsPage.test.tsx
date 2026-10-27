import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dependencies } from '../../../package.json';
import { INSPIRATION } from '../../config/credit';
import generated from '../../generated/notices.json';
import { about } from '../../i18n/en/about';
import { categoryFor } from '../settings/registry';
import { ANDROID_NOTICES, CreditsPage, PACKAGE_NOTICES, type PackageNotice } from './CreditsPage';

const words = about.about.credits;

function part(ui: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-ui="${ui}"]`);
  if (!found) throw new Error(`nothing drawn for ${ui}`);
  return found;
}

const fill = (text: string, params: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`);

describe('CreditsPage', () => {
  it('is the Settings page at #/settings/credits', () => {
    expect(categoryFor(['credits'])).toMatchObject({
      id: 'credits',
      titleKey: 'about.credits.title',
    });
  });

  it('lists every package of the generated notices with its version and licence', () => {
    render(<CreditsPage />);
    expect(PACKAGE_NOTICES).toEqual(generated.packages);
    expect(PACKAGE_NOTICES.length).toBeGreaterThan(0);
    const rows = within(part('credits.packages')).getAllByRole('listitem');
    expect(rows).toHaveLength(PACKAGE_NOTICES.length);
    PACKAGE_NOTICES.forEach((notice, index) => {
      const row = rows[index]!;
      expect(row).toHaveAttribute('data-ui', `credits.package.${notice.name}`);
      expect(row).toHaveTextContent(notice.name);
      expect(row).toHaveTextContent(fill(words.packages.version, { version: notice.version }));
      expect(row).toHaveTextContent(fill(words.packages.license, { license: notice.license }));
    });
  });

  it('covers every package the app depends on directly, each with a licence text', () => {
    for (const name of Object.keys(dependencies)) {
      const notice = PACKAGE_NOTICES.find((each) => each.name === name);
      expect(notice, name).toBeDefined();
      expect(notice?.text, name).toMatch(/\S/);
    }
  });

  it('opens a licence text on demand', () => {
    render(<CreditsPage />);
    const react = PACKAGE_NOTICES.find((each) => each.name === 'react')!;
    const row = part('credits.package.react');
    const details = row.querySelector('details')!;
    expect(details.open).toBe(false);

    fireEvent.click(within(row).getByText('react'));

    expect(details.open).toBe(true);
    expect(row.querySelector('pre')?.textContent).toBe(react.text);
    expect(within(row).getByRole('link', { name: 'Project page of react' })).toHaveAttribute(
      'href',
      react.homepage,
    );
  });

  it('says so when a package ships no licence text, and links no project page it lacks', () => {
    const bare: PackageNotice = {
      name: 'bare-package',
      version: '0.0.1',
      license: 'MIT',
      homepage: null,
      text: null,
    };
    render(<CreditsPage packages={[bare]} />);
    const row = part('credits.package.bare-package');
    expect(row).toHaveTextContent(words.packages.noText);
    expect(row.querySelector('pre')).toBeNull();
    expect(within(row).queryByRole('link')).toBeNull();
  });

  it('credits the app that inspired Platewise, with its address and its licence notice', () => {
    render(<CreditsPage />);
    const credit = part('credits.inspiration');
    const name = INSPIRATION.name;
    expect(credit).toHaveTextContent(fill(words.inspiration.body, { name }));
    expect(
      within(credit).getByRole('link', { name: fill(words.inspiration.visit, { name }) }),
    ).toHaveAttribute('href', INSPIRATION.url);
    expect(part('credits.inspiration.notice').textContent).toBe(INSPIRATION.notice);
    expect(INSPIRATION.url).toMatch(/^https:\/\//);
    expect(INSPIRATION.notice).toMatch(/^MIT License\n/);
  });

  it('draws whatever credit it is given', () => {
    render(
      <CreditsPage
        packages={[]}
        inspiration={{ name: 'Example Planner', url: 'https://example.org/', notice: 'Text.' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Visit Example Planner' })).toHaveAttribute(
      'href',
      'https://example.org/',
    );
    expect(part('credits.inspiration.notice')).toHaveTextContent('Text.');
  });
});

describe('CreditsPage in the Android app (P11-05)', () => {
  const texts: Readonly<Record<string, string>> = generated.licenseTexts;
  const insideTheAndroidApp = () => vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the libraries of its APK after the packages, each with its licence text', () => {
    insideTheAndroidApp();
    render(<CreditsPage />);
    expect(ANDROID_NOTICES.map((each) => each.name)).toEqual(
      generated.android.map((each) => each.name),
    );
    expect(ANDROID_NOTICES.length).toBeGreaterThan(0);
    const rows = within(part('credits.packages')).getAllByRole('listitem');
    expect(rows).toHaveLength(PACKAGE_NOTICES.length + ANDROID_NOTICES.length);
    ANDROID_NOTICES.forEach((notice, index) => {
      const row = rows[PACKAGE_NOTICES.length + index]!;
      expect(row).toHaveAttribute('data-ui', `credits.package.${notice.name}`);
      expect(row).toHaveTextContent(fill(words.packages.version, { version: notice.version }));
      expect(row).toHaveTextContent(fill(words.packages.license, { license: notice.license }));
      expect(texts[notice.license], notice.name).toMatch(/\S/);
      expect(notice.text?.endsWith(texts[notice.license]!), notice.name).toBe(true);
    });
  });

  it('puts the copyright line over the standard text where the licence asks for one', () => {
    insideTheAndroidApp();
    render(<CreditsPage />);
    const row = part('credits.package.org.checkerframework:checker-qual');
    fireEvent.click(within(row).getByText('org.checkerframework:checker-qual'));
    expect(row.querySelector('pre')?.textContent).toBe(
      `Copyright 2004-present by the Checker Framework developers\n\n${texts.MIT}`,
    );

    const client = part('credits.package.androidx.health.connect:connect-client');
    fireEvent.click(within(client).getByText('androidx.health.connect:connect-client'));
    expect(client.querySelector('pre')?.textContent).toBe(texts['Apache-2.0']);
    expect(
      within(client).getByRole('link', {
        name: 'Project page of androidx.health.connect:connect-client',
      }),
    ).toHaveAttribute(
      'href',
      'https://developer.android.com/jetpack/androidx/releases/health-connect',
    );
  });

  it('shows none of them on the web', () => {
    render(<CreditsPage />);
    const rows = within(part('credits.packages')).getAllByRole('listitem');
    expect(rows).toHaveLength(PACKAGE_NOTICES.length);
    expect(document.querySelector('[data-ui="credits.package.@capacitor/android"]')).toBeNull();
  });
});
