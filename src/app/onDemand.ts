import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * A component fetched with its chunk the first time it is drawn (`React.lazy` over a named
 * export), so it stays out of the start-up download (the 250 kB budget, P10-08). Draw it inside
 * a `Suspense`; a chunk that cannot be fetched throws into the nearest error boundary.
 */
export function onDemand<P extends object>(
  load: () => Promise<ComponentType<P>>,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => ({ default: await load() }));
}
