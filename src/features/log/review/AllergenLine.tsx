import { useProfile } from '../../../data/hooks';
import { checkAllergens, type AllergenFood } from '../../../domain/food/allergens';
import { t } from '../../../i18n/t';
import { cx } from '../../../ui/classes';
import { Icon } from '../../../ui/icons';
import styles from './product.module.css';

const NONE: readonly string[] = [];

/**
 * The sensitivities the profile lists; none while it loads, before onboarding, or when it cannot
 * be read.
 */
export function useSensitivities(): readonly string[] {
  const profile = useProfile();
  if (profile.status !== 'ready' || profile.value.kind !== 'ok') return NONE;
  return profile.value.value.allergens;
}

/**
 * The allergen line (02 §3.14, D24) under the review's name: "<verdict>: <sensitivities found>",
 * or only the verdict when nothing names one ("Can't assess", never "safe"). Shown only while the
 * profile lists sensitivities.
 */
export function AllergenLine({ food }: { readonly food: AllergenFood }) {
  const sensitivities = useSensitivities();
  if (sensitivities.length === 0) return null;
  const { verdict, matches } = checkAllergens(food, sensitivities);
  const named = t(`review.allergens.verdict.${verdict}`);
  const found = verdict !== 'unknown';
  return (
    <p
      className={cx(styles.allergenLine, found && styles.allergenFound)}
      data-ui="review.allergens"
      data-verdict={verdict}
    >
      <Icon name={found ? 'warning' : 'info'} size={18} className={styles.allergenIcon} />
      <span>
        {found
          ? t('review.allergens.line', { verdict: named, matches: matches.join(', ') })
          : named}
      </span>
    </p>
  );
}
