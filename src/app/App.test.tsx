import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n/t';
import { App } from './App';

describe('App', () => {
  it('renders the product name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Platewise' })).toBeInTheDocument();
  });

  it('shows only text from the catalogue', () => {
    const { container } = render(<App />);
    expect(container.textContent).toBe(t('common.appName'));
  });
});
