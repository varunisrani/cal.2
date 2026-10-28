import { Suspense, type ReactNode } from 'react';
import { onDemand } from '../../app/onDemand';
import { useOptionalServices } from '../../services/context';

// Only the Android app has these; fetched the first time Home is drawn there.
const HomeNotifyParts = onDemand(() =>
  import('./HomeNotifyParts').then((module) => module.HomeNotifyParts),
);

/**
 * Home's title (P17, D-16.103): as it is on the web; in the Android app with the notifications'
 * bell beside it and the one-time "Let Platewise nudge you" card under it.
 */
export function NotifyHeader({ children }: { readonly children: ReactNode }) {
  const notify = useOptionalServices()?.notify;
  if (!notify) return children;
  return (
    <Suspense fallback={children}>
      <HomeNotifyParts notify={notify}>{children}</HomeNotifyParts>
    </Suspense>
  );
}
