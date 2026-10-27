import { useLayoutEffect } from 'react';
import { tabRoute } from '../../app/router';
import type { AppUpdates } from '../../app/swRegistration';
import { useRouter } from '../../app/useRoute';
import { CategoryFrame } from './CategoryFrame';
import {
  categoryFor,
  SETTINGS_CATEGORIES,
  SETTINGS_LINKS,
  type SettingsCategory,
  type SettingsLink,
} from './registry';
import { SettingsHub } from './SettingsHub';

export interface SettingsScreenProps {
  /** The segments under `#/settings`: none for the hub, the category's id for its page. */
  readonly nested: readonly string[];
  /** The registry's categories by default (tests pass their own). */
  readonly categories?: readonly SettingsCategory[];
  /** The hub's link rows; the registry's by default (tests pass their own). */
  readonly links?: readonly SettingsLink[];
  /** The update flag behind the About row's dot; the app's own by default. */
  readonly updates?: AppUpdates;
}

/**
 * What the Settings tab shows for its address: the hub, or a registered category's page (under
 * its parent, for a sub-page). An address naming no registered category goes to the hub before it
 * is painted.
 */
export function SettingsScreen({
  nested,
  categories = SETTINGS_CATEGORIES,
  links = SETTINGS_LINKS,
  updates,
}: SettingsScreenProps) {
  const router = useRouter();
  const category = categoryFor(nested, categories);
  const unknown = nested.length > 0 && category === undefined;

  useLayoutEffect(() => {
    if (unknown) router.navigate(tabRoute('settings'));
  }, [router, unknown]);

  if (category) {
    const parent =
      category.parent === undefined ? undefined : categoryFor([category.parent], categories);
    return <CategoryFrame category={category} parent={parent} />;
  }
  return <SettingsHub categories={categories} links={links} updates={updates} />;
}
