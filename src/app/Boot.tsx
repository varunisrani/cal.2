import { useEffect, useState, type ReactNode } from 'react';
import type { LiveState } from '../data/live';
import type { Settings } from '../data/settingsSchema';
import { useFeed } from '../data/useLive';
import { t, type TKey } from '../i18n/t';
import type { AppOpening, OpenProblem, ProfileRead } from '../services/appData';
import { Button } from '../ui/Button';
import { AppDataContext, useAppData } from './appDataContext';
import { reloadPage } from './ErrorBoundary';
import { ProblemCard } from './ProblemCard';
import { HOME_ROUTE } from './router';
import styles from './shell.module.css';
import { ThemeProvider } from './ThemeProvider';
import { useRoute } from './useRoute';

/** Problems that keep the app from starting, each with its card's words. */
type StartProblem = OpenProblem | 'read-failed' | 'profile-unreadable';

const PROBLEM_TEXT: Readonly<Record<StartProblem, { title: TKey; body: TKey }>> = {
  'newer-schema': { title: 'shell.problem.newerData.title', body: 'shell.problem.newerData.body' },
  'upgrade-failed': {
    title: 'shell.problem.upgradeFailed.title',
    body: 'shell.problem.upgradeFailed.body',
  },
  unavailable: { title: 'shell.problem.noStorage.title', body: 'shell.problem.noStorage.body' },
  failed: { title: 'shell.problem.openFailed.title', body: 'shell.problem.openFailed.body' },
  'read-failed': { title: 'shell.problem.readFailed.title', body: 'shell.problem.readFailed.body' },
  'profile-unreadable': {
    title: 'shell.problem.profileUnreadable.title',
    body: 'shell.problem.profileUnreadable.body',
  },
};

/** Where the start-up reads point: still waiting, a problem, onboarding or the app. */
export type StartVerdict =
  | { readonly kind: 'wait' }
  | { readonly kind: 'problem'; readonly problem: StartProblem }
  | { readonly kind: 'onboarding' }
  | { readonly kind: 'app' };

/**
 * Judges the first reads. Waits until both the settings snapshot and the profile read are in
 * (R05.12, R06.22). A finished setup is the setting `onboarding.done` with a readable profile; a
 * profile that cannot be read is never taken for a missing one (R01.17) unless the person chose
 * to set up again.
 */
export function startVerdict(
  settings: LiveState<Settings>,
  profile: LiveState<ProfileRead>,
  settingUpAgain: boolean,
): StartVerdict {
  if (settings.status === 'error' || profile.status === 'error') {
    return { kind: 'problem', problem: 'read-failed' };
  }
  if (settings.status === 'loading' || profile.status === 'loading') return { kind: 'wait' };
  const read = profile.value;
  if (read.kind === 'corrupt' && !settingUpAgain) {
    return { kind: 'problem', problem: 'profile-unreadable' };
  }
  const finished = settings.value['onboarding.done'] && read.kind === 'ok';
  return finished ? { kind: 'app' } : { kind: 'onboarding' };
}

export interface BootProps {
  /** Opens the app's data; `openAppData` in the app, a fake in tests. */
  readonly open: () => Promise<AppOpening>;
  /** The app, shown once its data is read and the route agrees with it. */
  readonly children?: ReactNode;
  /** What Reload does; the page reload by default. */
  readonly reload?: () => void;
}

/**
 * The start of the app: a neutral skeleton while the database opens and the profile and
 * settings are first read, a recovery card when that fails, then onboarding or the app. It
 * keeps watching, so finishing onboarding shows Home and erasing everything shows onboarding.
 */
export function Boot({ open, children, reload = reloadPage }: BootProps) {
  const [opening, setOpening] = useState<AppOpening | null>(null);

  useEffect(() => {
    let current = true;
    open().then(
      (result) => current && setOpening(result),
      () => current && setOpening({ kind: 'failed', problem: 'failed' }),
    );
    return () => {
      current = false;
    };
  }, [open]);

  if (opening === null) return <BootSkeleton />;
  if (opening.kind === 'failed')
    return <StartProblemCard problem={opening.problem} reload={reload} />;
  return (
    <AppDataContext.Provider value={opening.data}>
      <ThemeProvider>
        <StartGate reload={reload}>{children}</StartGate>
      </ThemeProvider>
    </AppDataContext.Provider>
  );
}

function StartGate({ children, reload }: { children?: ReactNode; reload: () => void }) {
  const data = useAppData();
  const settings = useFeed(data.settings.feed);
  const profile = useFeed(data.profile.feed);
  const { route, navigate } = useRoute();
  const [settingUpAgain, setSettingUpAgain] = useState(false);
  const verdict = startVerdict(settings, profile, settingUpAgain);
  const onOnboarding = route.name === 'onboarding';
  const misplaced =
    (verdict.kind === 'onboarding' && !onOnboarding) || (verdict.kind === 'app' && onOnboarding);

  useEffect(() => {
    if (!misplaced) return;
    navigate(verdict.kind === 'onboarding' ? { name: 'onboarding' } : HOME_ROUTE);
  }, [misplaced, verdict.kind, navigate]);

  if (verdict.kind === 'problem') {
    return (
      <StartProblemCard
        problem={verdict.problem}
        reload={reload}
        onStartOver={
          verdict.problem === 'profile-unreadable' ? () => setSettingUpAgain(true) : undefined
        }
      />
    );
  }
  // Until the route agrees with the verdict, nothing of the app is drawn, not even for a frame.
  if (verdict.kind === 'wait' || misplaced) return <BootSkeleton />;
  return children;
}

/** Shapes only: no numbers, no switches, no default goals that could flash. */
function BootSkeleton() {
  return (
    <div
      className={styles.skeleton}
      role="status"
      aria-busy="true"
      aria-label={t('shell.loading')}
      data-ui="shell.skeleton"
    >
      <div className={`${styles.bone} ${styles.boneTitle}`} />
      <div className={`${styles.bone} ${styles.boneHero}`} />
      <div className={`${styles.bone} ${styles.boneRow}`} />
      <div className={`${styles.bone} ${styles.boneRow}`} />
    </div>
  );
}

function StartProblemCard({
  problem,
  reload,
  onStartOver,
}: {
  problem: StartProblem;
  reload: () => void;
  onStartOver?: () => void;
}) {
  const text = PROBLEM_TEXT[problem];
  return (
    <ProblemCard
      data-ui={`shell.problem.${problem}`}
      title={t(text.title)}
      body={t(text.body)}
      actions={
        <>
          {onStartOver && (
            <Button data-ui="shell.problem.startOver" onClick={onStartOver}>
              {t('shell.startOver')}
            </Button>
          )}
          <Button variant="primary" data-ui="shell.problem.reload" onClick={() => reload()}>
            {t('shell.reload')}
          </Button>
        </>
      }
    />
  );
}
