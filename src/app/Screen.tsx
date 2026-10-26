import { CoachPage } from '../features/coach/CoachPage';
import { HomePage } from '../features/home/HomePage';
import { ProgressPage } from '../features/progress/ProgressPage';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import type { TabRoute } from './router';

/** What each tab route shows. */
export function Screen({ route }: { readonly route: TabRoute }) {
  switch (route.tab) {
    case 'home':
      return <HomePage />;
    case 'progress':
      return <ProgressPage />;
    case 'coach':
      return <CoachPage />;
    case 'settings':
      return <SettingsScreen nested={route.nested} />;
  }
}
