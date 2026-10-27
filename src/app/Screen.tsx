import { Suspense } from 'react';
import { HomePage } from '../features/home/HomePage';
import { onDemand } from './onDemand';
import type { TabRoute } from './router';
import { Skeleton } from './Skeleton';

// Home is the first screen, so it comes with the app; the other tabs are fetched on first open.
const ProgressPage = onDemand(() =>
  import('../features/progress/ProgressPage').then((module) => module.ProgressPage),
);
const CoachPage = onDemand(() =>
  import('../features/coach/CoachPage').then((module) => module.CoachPage),
);
const SettingsScreen = onDemand(() =>
  import('../features/settings/SettingsScreen').then((module) => module.SettingsScreen),
);

function TabScreen({ route }: { readonly route: TabRoute }) {
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

/** What each tab route shows; the start-up skeleton while a tab's screen is still loading. */
export function Screen({ route }: { readonly route: TabRoute }) {
  return (
    <Suspense fallback={<Skeleton data-ui="shell.screenLoading" />}>
      <TabScreen route={route} />
    </Suspense>
  );
}
