import { QuickStart } from '../features/onboarding/QuickStart';
import { t } from '../i18n/t';
import { useAppData } from './appDataContext';
import { PlaceholderPage } from './PlaceholderPage';
import { HOME_ROUTE, type Route } from './router';
import { useRoute } from './useRoute';

/**
 * The screen for a route. Onboarding is the temporary quick start (P04-09); the others are
 * placeholders until the feature tasks replace their line here (P04-10 Home, P04-13 Progress,
 * Coach and the Settings hub).
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
      return <OnboardingScreen />;
  }
}

/** The quick start, storing the setup through the app's data and then showing Home. */
function OnboardingScreen() {
  const { onboarding } = useAppData();
  const { navigate } = useRoute();
  return (
    <QuickStart
      onStart={() => onboarding.startWithDefaults(navigator.language)}
      onDone={() => navigate(HOME_ROUTE)}
    />
  );
}
