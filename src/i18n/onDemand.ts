import { createLiveCatalogue, type MessageTree } from './catalogue';
import type { OnDemandPartition } from './en';
import { startupPartitions } from './startup';

/**
 * Catalogue partitions on demand (P18-00). The app's catalogue starts with the start-up partitions
 * and takes in the others as the chunks that use them are fetched: whatever fetches a screen or a
 * service names the partitions its modules use, `withPartitions(['walk'], import('./WalkScreen'))`,
 * and gets the module only once they are registered, so nothing draws before its words are there.
 * A static test (onDemandCoverage.test.ts) checks that every such fetch names what its chunk
 * uses.
 *
 * To add a partition fetched on demand: list it in `onDemandPartitions` (en.ts), give it its
 * loader line below (the compiler asks for it), and name it where its screen or service is
 * fetched.
 */

/** One loader per on-demand partition: each file its own small chunk. */
const LOADERS: {
  readonly [P in OnDemandPartition]: () => Promise<Readonly<Record<P, MessageTree>>>;
} = {
  onboarding: () => import('./en/onboarding'),
  settings: () => import('./en/settings'),
  charts: () => import('./en/charts'),
  about: () => import('./en/about'),
  goals: () => import('./en/goals'),
  aiSetup: () => import('./en/aiSetup'),
  profile: () => import('./en/profile'),
  review: () => import('./en/review'),
  ingredients: () => import('./en/ingredients'),
  fitCheck: () => import('./en/fitCheck'),
  editor: () => import('./en/editor'),
  progress: () => import('./en/progress'),
  reminders: () => import('./en/reminders'),
  transfer: () => import('./en/transfer'),
  backup: () => import('./en/backup'),
  data: () => import('./en/data'),
  health: () => import('./en/health'),
  walk: () => import('./en/walk'),
  sources: () => import('./en/sources'),
};

/** The catalogue the app's `t()` reads: the start-up partitions, then each one registered. */
export const appCatalogue = createLiveCatalogue(startupPartitions);

/** Adds an on-demand partition to the app's catalogue; registering it again does nothing. */
export function registerPartition(name: OnDemandPartition, partition: MessageTree): void {
  appCatalogue.register(name, partition);
}

const fetching = new Map<OnDemandPartition, Promise<void>>();

function loadPartition<P extends OnDemandPartition>(name: P): Promise<void> {
  if (appCatalogue.has(name)) return Promise.resolve();
  let pending = fetching.get(name);
  if (!pending) {
    const load: () => Promise<Readonly<Record<P, MessageTree>>> = LOADERS[name];
    pending = load().then(
      (module) => registerPartition(name, module[name]),
      (error: unknown) => {
        // A later fetch tries again (the chunk may come back once online).
        fetching.delete(name);
        throw error;
      },
    );
    fetching.set(name, pending);
  }
  return pending;
}

/** Fetches and registers the named partitions; resolves once all are registered. */
export async function loadPartitions(names: readonly OnDemandPartition[]): Promise<void> {
  await Promise.all(names.map(loadPartition));
}

/**
 * `chunk` (a dynamic import already under way) once the named partitions are registered too; both
 * are fetched side by side. Rejects when either cannot be fetched, like a chunk alone would.
 */
export async function withPartitions<M>(
  names: readonly OnDemandPartition[],
  chunk: Promise<M>,
): Promise<M> {
  const [module] = await Promise.all([chunk, loadPartitions(names)]);
  return module;
}

const isOnDemand = (name: string): name is OnDemandPartition => Object.hasOwn(LOADERS, name);

/**
 * The on-demand partition a key belongs to when it is not registered yet, else `undefined`. An
 * on-demand partition is rooted at its own name, so the key's first segment names it.
 */
export function pendingPartition(key: string): OnDemandPartition | undefined {
  const root = key.split('.', 1)[0] ?? '';
  return isOnDemand(root) && !appCatalogue.has(root) ? root : undefined;
}

const missed = new Set<OnDemandPartition>();

/**
 * After a draw asked for words of a partition its loader did not name (a bug: the static test
 * should have caught it): says so once and fetches it, so the next draw has the words.
 */
export function fetchMissed(name: OnDemandPartition): void {
  if (missed.has(name)) return;
  missed.add(name);
  console.error(`Platewise: the words of "${name}" were used before they were fetched`);
  loadPartition(name).catch((error: unknown) => {
    missed.delete(name);
    console.error(`Platewise: the words of "${name}" could not be fetched`, error);
  });
}
