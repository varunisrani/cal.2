import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Shell } from './Shell';
import { fakeAppData, settingsWith } from './testing/fakeAppData';
import { historyMoved, routerAt, shellWrapper } from './testing/shellHarness';

afterEach(cleanup);

function content(): HTMLElement {
  const area = document.querySelector<HTMLElement>('[data-ui="shell.content"]');
  if (!area) throw new Error('no content area');
  return area;
}

function scrollContentTo(top: number): void {
  content().scrollTop = top;
  fireEvent.scroll(content());
}

describe('Shell', () => {
  it('shows the screen of the route with the tab bar over it', () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    render(<Shell />, {
      wrapper: shellWrapper({ router: routerAt('#/progress'), data: fake.data }),
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Tabs' })).toBeInTheDocument();
    expect(content()).toHaveAttribute('data-tab-bar');
  });

  it('switching back to Home returns to where Home was scrolled (ACC-A1-1)', async () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    render(<Shell />, { wrapper: shellWrapper({ router: routerAt('#/home'), data: fake.data }) });
    scrollContentTo(420);

    await userEvent.click(screen.getByRole('button', { name: 'Progress' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Progress' })).toBeInTheDocument();
    expect(content().scrollTop).toBe(0);
    scrollContentTo(90);

    const moved = historyMoved();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await act(() => moved);
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(content().scrollTop).toBe(420);

    await userEvent.click(screen.getByRole('button', { name: 'Progress' }));
    expect(content().scrollTop).toBe(90);
  });

  it('shows the onboarding screen headed with the app name and no tab bar', () => {
    const fake = fakeAppData();
    fake.settings.ready(settingsWith());
    fake.profile.ready({ kind: 'missing' });
    render(<Shell />, {
      wrapper: shellWrapper({ router: routerAt('#/onboarding'), data: fake.data }),
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Platewise' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(content()).not.toHaveAttribute('data-tab-bar');
  });

  it('shows the Settings screen for a nested Settings address', () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    render(<Shell />, {
      wrapper: shellWrapper({ router: routerAt('#/settings/units'), data: fake.data }),
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });
});
