import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createSecretsRepo, FDC_SLOT } from '../../../data/repos/secretsRepo';
import { closeHarnesses, type Harness } from '../../../test/screenHarness';
import { FDC_SIGNUP_URL, FoodDbSection } from './FoodDbSection';
import { openAiPage, pageWords } from './testing/openAiPage';

afterEach(closeHarnesses);

const words = pageWords.foodDb;
const FDC_KEY = 'DEMO4fA9xQ2mZ7bW1cR8tY5uI3oP6aS0dF4gH2jK';
const GEMINI_KEY = 'AIzaSyD-4fA9xQ2mZ7bW1cR8tY5uI3oP6aS0dF4';

const keyField = () => screen.getByLabelText(words.label);
const saveButton = () => screen.getByRole('button', { name: words.save });
const secretsOf = (h: Harness) => createSecretsRepo(h.db);

describe('FoodDbSection', () => {
  it('stores the FoodData Central key trimmed in its own slot and shows it masked', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({ ui: <FoodDbSection /> });
    expect(screen.getByText(words.about)).toBeVisible();
    expect(saveButton()).toBeDisabled();

    await user.click(keyField());
    await user.paste(`  ${FDC_KEY}\n`);
    await user.click(saveButton());
    await h.settled();

    expect(await secretsOf(h).get(FDC_SLOT)).toBe(FDC_KEY);
    expect(screen.getByText('Saved key: DEMO…H2jK')).toBeVisible();
    expect(keyField()).toHaveValue('');
  });

  it('refuses a key with a character a header cannot carry, and stores nothing (R02.18)', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({ ui: <FoodDbSection /> });

    await user.click(keyField());
    await user.paste(`DEMO\u200b${FDC_KEY}`);
    await user.click(saveButton());
    await h.settled();

    expect(screen.getByText(words.unsafe)).toBeVisible();
    expect(keyField()).toHaveAttribute('aria-invalid', 'true');
    expect(await secretsOf(h).slots()).toEqual([]);
  });

  it('forgets the key and leaves the AI keys', async () => {
    const user = userEvent.setup();
    const h = await openAiPage({
      ui: <FoodDbSection />,
      prepare: async (harness) => {
        await secretsOf(harness).set(FDC_SLOT, FDC_KEY);
        await secretsOf(harness).set('gemini', GEMINI_KEY);
      },
    });
    expect(screen.getByText('Saved key: DEMO…H2jK')).toBeVisible();

    await user.click(screen.getByRole('button', { name: words.forget }));
    await h.settled();

    expect(await secretsOf(h).slots()).toEqual(['gemini']);
    expect(screen.queryByText('Saved key: DEMO…H2jK')).toBeNull();
    expect(screen.queryByRole('button', { name: words.forget })).toBeNull();
  });

  it('links to the free sign-up page and says where the key goes', async () => {
    await openAiPage({ ui: <FoodDbSection /> });

    const link = screen.getByRole('link', { name: words.signUp });
    expect(link).toHaveAttribute('href', FDC_SIGNUP_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(words.device)).toBeVisible();
  });
});
