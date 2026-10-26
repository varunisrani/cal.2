import { useLayoutEffect } from 'react';
import { tabRoute } from '../../app/router';
import { useRouter } from '../../app/useRoute';
import { CategoryFrame } from './CategoryFrame';
import { categoryFor, SETTINGS_CATEGORIES, type SettingsCategory } from './registry';
import { SettingsHub } from './SettingsHub';

export interface SettingsScreenProps {
  /** The segments under `#/settings`: none for the hub, the category's id for its page. */
  readonly nested: readonly string[];
  /** The registry's categories by default (tests pass their own). */
  readonly categories?: readonly SettingsCategory[];
}

/**
 * What the Settings tab shows for its address: the hub, or a registered category's page. An
 * address naming no registered category goes to the hub before it is painted.
 */
export function SettingsScreen({ nested, categories = SETTINGS_CATEGORIES }: SettingsScreenProps) {
  const router = useRouter();
  const category = categoryFor(nested, categories);
  const unknown = nested.length > 0 && category === undefined;

  useLayoutEffect(() => {
    if (unknown) router.navigate(tabRoute('settings'));
  }, [router, unknown]);

  if (category) return <CategoryFrame category={category} />;
  return <SettingsHub categories={categories} />;
}
