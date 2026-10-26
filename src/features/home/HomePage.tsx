import { useToday } from '../../app/TodayProvider';
import { useSheet } from '../../app/useRoute';
import { useDayEntries, useSettings, useTargets } from '../../data/hooks';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/icons';
import { Menu, type MenuEntry } from '../../ui/Menu';
import { ManualSheet } from '../log/ManualSheet';
import { DaySummary } from './DaySummary';
import { Diary } from './Diary';
import styles from './home.module.css';
import { tx } from './text';

/** The manual entry sheet's place on the sheet stack. */
export const MANUAL_SHEET = 'manual';

const SETTINGS = ['units.energy', 'meals.times', 'goals.nutrients'] as const;

/**
 * Home for today (the week bar and the day swipe come in P07): the gauge and pillars, the diary
 * by meal, and the "+" button whose menu for now offers Enter manually. Nothing with a number is
 * drawn until the profile, the settings and the day's entries have been read, so a fallback goal
 * never flashes (R05.12); the "+" waits too, since its menu will depend on what is stored.
 */
export function HomePage() {
  const today = useToday();
  // The viewed day; P07 lets the person pick another one.
  const dayKey = today;
  const entries = useDayEntries(dayKey);
  const targets = useTargets(today);
  const settings = useSettings(SETTINGS);
  const manual = useSheet(MANUAL_SHEET);

  const addEntries: readonly MenuEntry[] = [
    {
      kind: 'action',
      id: 'manual',
      label: tx('home.add.manual'),
      icon: <Icon name="pencil" size={20} />,
      onSelect: manual.show,
    },
  ];

  const reads = [entries, targets, settings];
  const failed = reads.some((read) => read.status === 'error');
  let body;
  if (failed) {
    body = (
      <Card data-ui="home.error">
        <p className={styles.empty}>{tx('home.loadFailed')}</p>
      </Card>
    );
  } else if (
    entries.status === 'ready' &&
    targets.status === 'ready' &&
    settings.status === 'ready'
  ) {
    const unit = settings.value['units.energy'];
    const read = targets.value;
    body = (
      <>
        <DaySummary
          entries={entries.value}
          targets={read.kind === 'ok' ? read.targets : null}
          goals={settings.value['goals.nutrients']}
          energyUnit={unit}
        />
        <Diary
          entries={entries.value}
          energyUnit={unit}
          times={settings.value['meals.times']}
          isToday={dayKey === today}
        />
        <div className={styles.fabSlot}>
          <Menu
            label={tx('home.add.label')}
            icon={<Icon name="plus" size={28} />}
            hideLabel
            placement="above"
            align="end"
            triggerClassName={styles.fab}
            entries={addEntries}
            data-ui="home.add"
          />
        </div>
      </>
    );
  } else {
    body = (
      <div className={styles.placeholder} aria-hidden="true" data-ui="home.loading">
        <div className={styles.placeholderSummary} />
        <div className={styles.placeholderRow} />
      </div>
    );
  }

  return (
    <section
      className={styles.page}
      aria-busy={reads.some((read) => read.status === 'loading') || undefined}
      data-ui="screen.home"
    >
      <h1 className={styles.title}>{tx('common.tabs.home')}</h1>
      {body}
      <ManualSheet open={manual.open} onClose={manual.close} dayKey={dayKey} />
    </section>
  );
}
