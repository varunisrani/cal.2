import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useToday } from '../../app/TodayProvider';
import { HOME_ROUTE } from '../../app/router';
import { useRouter } from '../../app/useRoute';
import { useSettings } from '../../data/hooks';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import type { WalkPhase, WalkService } from '../../services/walks/service';
import { Button, IconButton } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';
import { LiveWalk } from './LiveWalk';
import { walkDistanceUnit } from './text';
import styles from './walk.module.css';
import { WalkSummary } from './WalkSummary';

const SETTINGS = ['units.energy', 'units.height'] as const;

/** The explanation before Android's own questions, the first time a walk starts. */
function Asking({ service }: { readonly service: WalkService }) {
  const rows = [
    ['location', 'walk.ask.location', 'walk.ask.locationWhy'],
    ['activity', 'walk.ask.activity', 'walk.ask.activityWhy'],
    ['notifications', 'walk.ask.notifications', 'walk.ask.notificationsWhy'],
  ] as const;
  return (
    <Card heading={t('walk.ask.title')} className={styles.card} data-ui="walk.ask">
      <p className={styles.lead}>{t('walk.ask.lead')}</p>
      <ul className={styles.reasons}>
        {rows.map(([key, name, why]) => (
          <li key={key} data-ui={`walk.ask.${key}`}>
            <span className={styles.reasonName}>{t(name)}</span>
            <span className={styles.reasonWhy}>{t(why)}</span>
          </li>
        ))}
      </ul>
      <div className={styles.controls}>
        <Button onClick={() => service.cancelStart()} block data-ui="walk.ask.cancel">
          {t('walk.ask.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={() => service.confirmStart()}
          block
          data-ui="walk.ask.continue"
        >
          {t('walk.ask.continue')}
        </Button>
      </div>
    </Card>
  );
}

function Idle({ service }: { readonly service: WalkService }) {
  return (
    <Card className={styles.card} data-ui="walk.idle">
      <span className={styles.idleIcon} aria-hidden="true">
        <Icon name="walk" size={40} />
      </span>
      <p className={styles.lead}>{t('walk.idle.lead')}</p>
      <p className={styles.note}>{t('walk.idle.screenOff')}</p>
      <Button variant="primary" onClick={() => service.start()} block data-ui="walk.start">
        {t('walk.idle.start')}
      </Button>
    </Card>
  );
}

function Failed({
  service,
  step,
}: {
  readonly service: WalkService;
  readonly step: 'start' | 'store';
}) {
  return (
    <Card className={styles.card} data-ui="walk.failed">
      <p className={styles.problem} role="alert">
        {t(step === 'start' ? 'walk.failed.start' : 'walk.failed.store')}
      </p>
      <div className={styles.controls}>
        <Button onClick={() => service.dismiss()} block data-ui="walk.failed.dismiss">
          {t('walk.failed.dismiss')}
        </Button>
        <Button
          variant="primary"
          onClick={() => (step === 'start' ? service.start() : service.open())}
          block
          data-ui="walk.failed.retry"
        >
          {t('walk.failed.retry')}
        </Button>
      </div>
    </Card>
  );
}

/**
 * The walk recorder (`#/walk`, P15-03), in the Android app only: Start (with the explanation of
 * the permissions the first time), the walk in progress, and once it is stopped the summary with
 * Save (the default) and Discard. Back leaves the screen and the walk goes on; leaving the summary
 * any way but Discard saves it.
 */
export function WalkScreen() {
  const services = useServices();
  const service = services.walks;
  if (!service) throw new Error('WalkScreen: no walk service (the web has none)');
  return <WalkScreenFor service={service} />;
}

function WalkScreenFor({ service }: { readonly service: WalkService }) {
  const { clock } = useServices();
  const router = useRouter();
  const toast = useToast();
  const today = useToday();
  const settings = useSettings(SETTINGS);
  const phase: WalkPhase = useSyncExternalStore(service.subscribe, service.getSnapshot);
  const [discarding, setDiscarding] = useState(false);
  const finished = phase.kind === 'finished';

  // Leaving the screen while the summary shows keeps the walk (Save is the default). Only a real
  // leave counts: by then the route is no longer the walk's (a remount on the same route is not).
  const finishedRef = useRef(finished);
  useEffect(() => {
    finishedRef.current = finished;
  }, [finished]);
  useEffect(
    () => () => {
      if (finishedRef.current && router.current().route.kind !== 'walk') void service.save();
    },
    [router, service],
  );

  const leave = (): void => router.navigate(HOME_ROUTE);

  const save = async (): Promise<void> => {
    const { written } = await service.save();
    if (written) toast.show(t('walk.summary.written'));
    leave();
  };

  const discard = async (): Promise<void> => {
    try {
      await service.discard();
      setDiscarding(false);
      leave();
    } catch (error) {
      console.error('Discarding the walk failed', error);
      setDiscarding(false);
      toast.show(t('walk.summary.discardFailed'));
    }
  };

  let body;
  if (settings.status === 'error') {
    body = <p className={styles.problem}>{t('walk.loadFailed')}</p>;
  } else if (settings.status === 'loading') {
    body = null;
  } else {
    const energyUnit = settings.value['units.energy'];
    const distanceUnit = walkDistanceUnit(settings.value['units.height']);
    switch (phase.kind) {
      case 'idle':
        body = <Idle service={service} />;
        break;
      case 'asking':
        body = <Asking service={service} />;
        break;
      case 'starting':
      case 'stopping':
        body = (
          <p className={styles.busy} role="status" data-ui="walk.busy">
            {t(phase.kind === 'starting' ? 'walk.busy.starting' : 'walk.busy.stopping')}
          </p>
        );
        break;
      case 'active':
        body = (
          <LiveWalk
            walk={phase.walk}
            clock={clock}
            energyUnit={energyUnit}
            distanceUnit={distanceUnit}
            onPause={() => service.pause()}
            onResume={() => service.resume()}
            onStop={() => service.stop()}
          />
        );
        break;
      case 'finished':
        body = (
          <WalkSummary
            walk={phase.walk}
            today={today}
            actions={
              <div className={styles.controls}>
                <Button onClick={() => setDiscarding(true)} block data-ui="walk.discard">
                  {t('walk.summary.discard')}
                </Button>
                <Button variant="primary" onClick={save} block data-ui="walk.save">
                  {t('walk.summary.save')}
                </Button>
              </div>
            }
          />
        );
        break;
      case 'failed':
        body = <Failed service={service} step={phase.step} />;
        break;
    }
  }

  return (
    <section className={styles.page} data-ui="screen.walk" data-phase={phase.kind}>
      <header className={styles.header}>
        <IconButton
          label={t('walk.back')}
          icon={<Icon name="chevronLeft" />}
          onClick={leave}
          data-ui="walk.back"
        />
        <h1 className={styles.title}>
          {phase.kind === 'finished' ? t('walk.summary.title') : t('walk.title')}
        </h1>
      </header>
      {body}
      <Dialog
        open={discarding}
        title={t('walk.summary.discardTitle')}
        message={t('walk.summary.discardMessage')}
        confirmLabel={t('walk.summary.discardConfirm')}
        destructive
        onConfirm={discard}
        onCancel={() => setDiscarding(false)}
        data-ui="walk.discardConfirm"
      />
    </section>
  );
}
