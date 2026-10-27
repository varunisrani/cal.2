import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AllergenFood } from '../../../domain/food/allergens';
import type { ProductInfo } from '../../../domain/model';
import { review } from '../../../i18n/en/review';
import { makeLine, makeProfile } from '../../../test/factories';
import { closeHarnesses, openHarness, untilGone, untilShown } from '../../../test/screenHarness';
import { AllergenLine } from './AllergenLine';

afterEach(closeHarnesses);

const verdicts = review.review.allergens.verdict;
const LINE = '[data-ui="review.allergens"]';

function product(fields: Partial<ProductInfo> = {}): ProductInfo {
  return {
    barcode: '5012345678900',
    allergens: [],
    traces: [],
    labels: [],
    categories: [],
    ...fields,
  };
}

function food(fields: Partial<AllergenFood> = {}): AllergenFood {
  return { name: 'Grain bowl', lines: [], ...fields };
}

/** The line for `shown` with a profile listing `allergens`. */
async function openLine(shown: AllergenFood, allergens: readonly string[]) {
  const h = await openHarness();
  await h.repos.profileRepo.save(makeProfile({ allergens }));
  h.mount(<AllergenLine food={shown} />);
  await untilShown(LINE);
  return { ...h, line: document.querySelector(LINE) as HTMLElement };
}

describe('AllergenLine', () => {
  it('says "Possible allergen: dairy" for whey in the ingredient list (ACC-D24-1)', async () => {
    const { line } = await openLine(
      food({ product: product({ ingredients: 'Water, sugar, whey powder, salt' }) }),
      ['dairy'],
    );
    expect(line).toHaveTextContent(`${verdicts.possible}: dairy`);
    expect(line).toHaveAttribute('data-verdict', 'possible');
    expect(line.querySelector('[data-icon="warning"]')).not.toBeNull();
  });

  it.each([
    [
      'declared',
      food({ product: product({ allergens: ['en:milk'], traces: ['en:peanuts'] }) }),
      ['Peanut', 'Milk'],
      `${verdicts.declared}: Milk`,
    ],
    [
      'mayContain',
      food({ product: product({ traces: ['en:peanuts', 'en:soybeans'] }) }),
      ['Peanut', 'Soy', 'Milk'],
      `${verdicts.mayContain}: Peanut, Soy`,
    ],
    [
      'possible',
      food({ lines: [makeLine({ name: 'Toasted sesame' })] }),
      ['sesame'],
      `${verdicts.possible}: sesame`,
    ],
  ])(
    'names the %s rung and the sensitivities it found',
    async (verdict, shown, allergens, text) => {
      const { line } = await openLine(shown, allergens);
      expect(line).toHaveTextContent(text);
      expect(line).toHaveAttribute('data-verdict', verdict);
    },
  );

  it('says only that it cannot assess a food without evidence: never "safe"', async () => {
    const { line } = await openLine(food({ name: 'Steamed rice' }), ['milk']);
    expect(line.textContent).toBe(verdicts.unknown);
    expect(line).toHaveAttribute('data-verdict', 'unknown');
    expect(line.querySelector('[data-icon="info"]')).not.toBeNull();
  });

  it('shows nothing while the profile lists no sensitivities, and follows changes to it', async () => {
    const h = await openHarness();
    const declared = food({ product: product({ allergens: ['Milk'] }) });
    h.mount(<AllergenLine food={declared} />);
    await h.repos.profileRepo.save(makeProfile({ allergens: ['milk'] }));
    await untilShown(LINE);
    expect(screen.getByText(`${verdicts.declared}: milk`)).toBeInTheDocument();

    await act(() => h.repos.profileRepo.save(makeProfile({ allergens: [] })));
    await untilGone(LINE);
  });
});
