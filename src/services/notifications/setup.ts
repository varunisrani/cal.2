// The Android app's nudges, notices and inbox put together (P17), over the notifications plugin
// the reminders already use. Fetched with the native reminders (`reminders/native.ts`), inside the
// Android app only: the web build downloads none of it.
//
// The reminders' engine gains the nudges' facts and their watch, a channel per kind, the inbox's
// look at every plan handed over and at every notification Android shows while the app runs, and
// taps that open the notification's target and mark its inbox item read.
//
// The Coach's own (D-16.102): what it may do by itself (set reminders, schedule check-ins), the
// message of each check-in whose time has come put into its chat at the same moments the inbox
// looks (start, return, every plan, a notification shown, a tap), and "The Coach replied" for a
// reply the person is not looking at (the page hidden, or another screen or chat on it).

import type { LiveSource } from '../../data/live';
import type { CoachRepo } from '../../data/repos/coachRepo';
import type { DiaryRepo } from '../../data/repos/diaryRepo';
import type { ProfileRepo } from '../../data/repos/profileRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { WaterRepo } from '../../data/repos/waterRepo';
import type { WeightRepo } from '../../data/repos/weightRepo';
import type { CoachMessage } from '../../domain/model';
import { SMART_KINDS } from '../../domain/reminders/notices';
import { preview } from '../../features/coach/chatsList';
import { t } from '../../i18n/t';
import type { AppStateStore } from '../../app/appState';
import type { Router } from '../../app/router';
import type { Clock } from '../../lib/clock';
import type { AnalysisService } from '../analysis';
import { createCheckIns } from '../coach/checkIns';
import { coachScreen } from '../coach/onScreen';
import type { CoachActions } from '../coach/ownTools';
import { createCustomRemindersService } from '../reminders/customReminders';
import type { PageVisibility } from '../reminders/engine';
import type {
  NativeReminderDeps,
  NotificationsPlugin,
  PluginChannel,
} from '../reminders/nativeSync';
import { channelOf } from '../reminders/requests';
import type { NotifyService, OpenTarget } from './contract';
import { watchEvents, type EventDeps } from './hooks';
import { markTapped, reconcile, withPlan } from './inbox';
import { createNotices } from './notices';
import { openTarget, type OpenApp } from './open';
import { createNotifyService } from './service';
import { readNudgeFacts, watchNudgeFacts } from './sources';
import { createNotifyStore } from './store';

/** What the composition root hands over for P17. */
export interface NotifyBase {
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'update' | 'snapshot'>;
  readonly diaryRepo: Pick<DiaryRepo, 'between' | 'byDay'>;
  readonly waterRepo: Pick<WaterRepo, 'byDay'>;
  readonly weightRepo: Pick<WeightRepo, 'latest'>;
  readonly profileRepo: Pick<ProfileRepo, 'get'>;
  /** Where a check-in's message goes when it comes (D-16.102). */
  readonly coachRepo: Pick<CoachRepo, 'append'>;
  /** What a tap opens: the router, Home's day, and the analysis (its review; its events). */
  readonly app: {
    readonly router: Pick<Router, 'navigate'>;
    readonly appState: Pick<AppStateStore, 'selectDay'>;
    readonly analysis: Pick<AnalysisService, 'restore' | 'subscribe' | 'getSnapshot'>;
  };
  /** Live reads (`src/data/live`). */
  live<T>(query: () => T | Promise<T>): LiveSource<T>;
}

/** What the rest of the app gets. */
export interface NotifyParts {
  readonly service: NotifyService;
  /** Starts the event watches once the services they read exist; returns the stop. */
  watchEvents(more: Pick<EventDeps, 'activityRepo' | 'walkRepo'>): () => void;
  /** What the Coach may do by itself (D-16.102). */
  readonly coach: CoachActions;
  /** A Coach reply was stored: "The Coach replied" unless the person is looking at its chat. */
  replied(reply: CoachMessage): void;
}

/** What the reminders' engine gains. */
export type NotifyEngineDeps = Required<
  Pick<NativeReminderDeps, 'nudgeFacts' | 'channels' | 'onHandedOver' | 'onShown' | 'onOpen'>
> &
  Pick<NativeReminderDeps, 'watch'>;

/** A channel for each kind with a switch, and the fasting goal's, named as Settings names them. */
export function kindChannels(): PluginChannel[] {
  return [
    ...SMART_KINDS.map((kind) => ({
      id: channelOf(kind),
      name: t(`reminders.smart.${kind}`),
      description: t(`reminders.smart.${kind}Hint`),
      importance: 3 as const,
    })),
    {
      id: channelOf('fastGoal'),
      name: t('reminders.settings.fastGoal'),
      description: t('reminders.settings.fastGoalHint'),
      importance: 3,
    },
    {
      id: channelOf('coachCheckIn'),
      name: t('reminders.smart.coachCheckIn'),
      description: t('reminders.smart.coachCheckInHint'),
      importance: 3,
    },
  ];
}

export interface NotifyWiring {
  readonly parts: NotifyParts;
  readonly engine: NotifyEngineDeps;
}

export function wireNotify(input: {
  readonly base: NotifyBase;
  readonly plugin: NotificationsPlugin;
  readonly clock: Clock;
  readonly visibility: PageVisibility;
  /** The reminders' own watch, which the nudges' joins. */
  readonly watch?: NativeReminderDeps['watch'];
  readonly onError?: (error: unknown) => void;
}): NotifyWiring {
  const { base, plugin, clock, visibility } = input;
  const onError =
    input.onError ??
    ((error: unknown) => console.error('Platewise: the notification inbox failed', error));
  const store = createNotifyStore(base.settingsRepo);
  const { router, appState, analysis } = base.app;
  const app: OpenApp = {
    navigate: (route) => router.navigate(route),
    selectToday: () => appState.selectDay(null),
    openReview: () => {
      analysis.restore().catch(onError);
    },
    openChat: (chatId) => coachScreen.ask(chatId),
  };
  const open = (target: OpenTarget) => openTarget(target, app);

  const checkIns = createCheckIns({ settingsRepo: base.settingsRepo, clock });
  /** Puts the message of each check-in whose time has come into its chat, once (none: gone). */
  const deliver = async (): Promise<void> => {
    for (const due of await checkIns.takeDue(clock.now())) {
      const { chatId, text, at } = due;
      await base.coachRepo.append({ chatId, role: 'assistant', text, at }).catch(onError);
    }
  };
  const deliverSoon = (): void => {
    deliver().catch(onError);
  };

  const notices = createNotices({
    show: (request) => plugin.schedule({ notifications: [request] }),
    permitted: async () => (await plugin.checkPermissions()).display === 'granted',
    settings: () => base.settingsRepo.snapshot(),
    store,
    clock,
  });
  const service = createNotifyService({
    notices,
    store,
    settingsRepo: base.settingsRepo,
    open,
    live: (query) => base.live(query),
  });
  const nudgeWatch = watchNudgeFacts(base, clock, (query) => base.live(query));

  return {
    parts: {
      service,
      watchEvents: (more) =>
        watchEvents({
          notices,
          store,
          clock,
          visibility,
          diaryRepo: base.diaryRepo,
          profileRepo: base.profileRepo,
          settingsRepo: base.settingsRepo,
          analysis,
          live: (query) => base.live(query),
          ...more,
        }),
      coach: {
        setsReminders: () => base.settingsRepo.get('coach.setsReminders'),
        reminders: createCustomRemindersService({ settingsRepo: base.settingsRepo, clock }),
        checkIns,
      },
      replied(reply) {
        if (visibility.isVisible() && coachScreen.shown() === reply.chatId) return;
        notices
          .post({
            kind: 'coachReplied',
            title: t('reminders.notice.coachReplied'),
            body: preview(reply.text),
            open: { coachChat: reply.chatId },
            onceKey: `coachReplied:${reply.id}`,
          })
          .catch(onError);
      },
    },
    engine: {
      nudgeFacts: (_settings, now) => readNudgeFacts(base, now),
      channels: kindChannels(),
      onHandedOver: async (plan, now) => {
        await store.inbox.change((state) => withPlan(reconcile(state, now), plan, now));
        deliverSoon();
      },
      onShown: () => {
        store.inbox.change((state) => reconcile(state, clock.now())).catch(onError);
        deliverSoon();
      },
      onOpen: (target, id) => {
        deliverSoon();
        open(target);
        if (id === undefined) return;
        const now = clock.now();
        store.inbox.change((state) => markTapped(reconcile(state, now), id, now)).catch(onError);
      },
      watch: (onChange) => {
        const stops = [nudgeWatch(onChange), ...(input.watch ? [input.watch(onChange)] : [])];
        return () => stops.forEach((stop) => stop());
      },
    },
  };
}
