import { t } from '../i18n/t';
import { PlaceholderPage } from './PlaceholderPage';
import type { Route } from './router';

/**
 * The screen for a route. Every screen is a placeholder until the feature tasks replace its
 * line here (P04-09 onboarding, P04-10 Home, P04-13 Progress, Coach and the Settings hub).
 */
export function RouteScreen({ route }: { readonly route: Route }) {
  switch (route.name) {
    case 'home':
      return <PlaceholderPage data-ui="screen.home" heading={t('common.tabs.home')} />;
    case 'progress':
      return <PlaceholderPage data-ui="screen.progress" heading={t('common.tabs.progress')} />;
    case 'coach':
      return <PlaceholderPage data-ui="screen.coach" heading={t('common.tabs.coach')} />;
    case 'settings':
      return <PlaceholderPage data-ui="screen.settings" heading={t('common.tabs.settings')} />;
    case 'onboarding':
      return <PlaceholderPage data-ui="screen.onboarding" heading={t('common.appName')} />;
  }
}
