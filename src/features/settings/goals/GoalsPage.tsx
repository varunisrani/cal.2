import { useEffect, useId, useState } from 'react';
import { tabRoute } from '../../../app/router';
import { useToday } from '../../../app/TodayProvider';
import { useRouter, useSheet } from '../../../app/useRoute';
import { useSettings, useTargets } from '../../../data/hooks';
import { failureMessages } from '../../../ai/errors';
import { estimateMaintenance, MAINTENANCE_BAND } from '../../../domain/goals/maintenance';
import type { PlanField } from '../../../domain/goals/planEdit';
import { MACRO_KEYS, type Profile } from '../../../domain/model';
import { needsRebuild } from '../../../domain/profile/signature';
import { formatEnergy, type EnergyDisplayUnit } from '../../../domain/units/energy';
import { formatInt } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import type { RebuildOutcome } from '../../../services/goals/rebuild';
import type { TargetEditOutcome } from '../../../services/goals/targetEdits';
import type { TuneUpOutcome } from '../../../services/goals/tuneUp';
import { Card } from '../../../ui/Card';
import { Dialog } from '../../../ui/Dialog';
import { IconButton } from '../../../ui/Button';
import { Icon } from '../../../ui/icons';
import { Switch } from '../../../ui/Switch';
import { useToast } from '../../../ui/Toast';
import styles from './goals.module.css';
import { goalAmount } from './NutrientGoalEditor';
import { NutrientGoalsSheet } from './NutrientGoalsSheet';
import { TargetRow } from './TargetRow';
import { TargetSheet } from './TargetSheet';

/** The sheets the page opens, so Back closes them before leaving the page. */
export const TARGET_SHEET = 'goal-target';
export const NUTRIENT_GOALS_SHEET = 'nutrient-goals';

const SETTINGS = [
  'units.energy',
  'tuneUp.on',
  'alerts.goalReached',
  'goals.rebuildBaseline',
  'goals.nutrients',
] as const;

/** A dialog's content: a title and its paragraphs. */
interface Notice {
  readonly title: string;
  readonly lines: readonly string[];
}

/** "2,452 kcal" / "10,259 kJ": a kcal amount written in the person's unit. */
function energyAmount(kcal: number, unit: EnergyDisplayUnit): string {
  return t(`goals.page.amount.${unit}`, { amount: formatEnergy(kcal, unit, currentLocale()) });
}

function gramsAmount(grams: number): string {
  return t('goals.page.amount.g', { amount: formatInt(grams, currentLocale()) });
}

function isLocked(profile: Profile, field: PlanField): boolean {
  return field === 'kcal' ? profile.caloriesLocked : profile.lockedMacros.includes(field);
}

/** The AI's own short why, when it gave one, as the dialog's last paragraph. */
function withReason(lines: readonly string[], reason: string | undefined): readonly string[] {
  return reason ? [...lines, reason] : lines;
}

/** Why the targets cannot be edited while the tune-up is on (ACC-C8-3). */
function tuneUpOwns(): Notice {
  return { title: t('goals.page.edit.tuneUpTitle'), lines: [t('goals.page.edit.tuneUp')] };
}

/** What a target edit the service did not store says; null when it was stored. */
function editNotice(outcome: TargetEditOutcome): Notice | null {
  switch (outcome.kind) {
    case 'saved':
      return null;
    case 'refused':
      return { title: t('goals.page.edit.refusedTitle'), lines: [t('goals.page.edit.refused')] };
    case 'tuneUpOn':
      return tuneUpOwns();
    case 'noProfile':
      return { title: t('goals.page.title'), lines: [t('goals.page.unavailable')] };
  }
}

/** The rebuild's outcome in words; null for a tap that found a rebuild already running. */
function rebuildNotice(outcome: RebuildOutcome, unit: EnergyDisplayUnit): Notice | null {
  switch (outcome.kind) {
    case 'rebuilt':
      return {
        title: t('goals.page.plan.rebuiltTitle'),
        lines: withReason(
          [t('goals.page.plan.rebuilt', { amount: energyAmount(outcome.kcal, unit) })],
          outcome.reason,
        ),
      };
    case 'failed':
      return {
        title: t('goals.page.plan.failedTitle'),
        lines: [
          t('goals.page.plan.failed'),
          ...failureMessages(outcome.failure).map((message) => t(message.key, message.params)),
        ],
      };
    case 'dropped':
      return { title: t('goals.page.plan.droppedTitle'), lines: [t('goals.page.plan.dropped')] };
    case 'noProfile':
      return { title: t('goals.page.title'), lines: [t('goals.page.unavailable')] };
    case 'busy':
      return null;
  }
}

/** The forced run's outcome when the tune-up is switched on (01 §3.10). */
function tuneUpNotice(outcome: TuneUpOutcome, unit: EnergyDisplayUnit): Notice {
  switch (outcome.kind) {
    case 'changed':
      return {
        title: t('goals.page.plan.tunedTitle'),
        lines: withReason(
          [t('goals.page.plan.tuned', { amount: energyAmount(outcome.kcal, unit) })],
          outcome.reason,
        ),
      };
    case 'unchanged':
      return {
        title: t('goals.page.plan.unchangedTitle'),
        lines: [
          outcome.why === 'dropped' || outcome.why === 'abandoned'
            ? t('goals.page.plan.tuneDropped')
            : t('goals.page.plan.unchanged'),
        ],
      };
    case 'failed':
      return {
        title: t('goals.page.plan.tuneFailedTitle'),
        lines: [
          t('goals.page.plan.tuneFailed'),
          ...failureMessages(outcome.failure).map((message) => t(message.key, message.params)),
        ],
      };
  }
}

function useGoalServices() {
  const { targetEdits, rebuild } = useServices();
  if (!targetEdits) throw new Error('GoalsPage: no targetEdits service above it');
  if (!rebuild) throw new Error('GoalsPage: no rebuild service above it');
  return { targetEdits, rebuild };
}

/**
 * Settings › Goals and nutrition (P05-11; 01 §3.7, §3.9, §3.10). The daily targets with lock
 * glyphs and the maintenance estimate; a tap opens the target's picker, and saving goes through
 * the lock engine, so the value is locked and the free ones rebalance. While the weekly tune-up is
 * on the rows are read-only and a tap explains why (ACC-C8-3). Below: Rebuild plan, always
 * tappable, with the "inputs changed" nudge once the plan inputs differ from the baseline (seeded
 * silently on first open, R01.12); the tune-up switch, whose forced run is reported in a dialog;
 * the nutrient goals; the methods page; and the goal-reached alert switch.
 */
export function GoalsPage() {
  const { targetEdits, rebuild } = useGoalServices();
  const today = useToday();
  const read = useTargets(today);
  const settings = useSettings(SETTINGS);
  const router = useRouter();
  const toast = useToast();
  const targetSheet = useSheet(TARGET_SHEET);
  const nutrientsSheet = useSheet(NUTRIENT_GOALS_SHEET);
  const ownsNoteId = useId();
  const [editing, setEditing] = useState<PlanField>('kcal');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [switching, setSwitching] = useState(false);

  // First open: store the baseline the nudge compares with, so the nudge never shows on open.
  useEffect(() => {
    targetEdits.seedRebuildBaseline().catch((error: unknown) => {
      console.error('Storing the rebuild baseline failed', error);
    });
  }, [targetEdits]);

  if (read.status === 'loading' || settings.status === 'loading') return null;
  if (read.status === 'error' || read.value.kind !== 'ok' || settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="goals.unavailable">
        {t('goals.page.unavailable')}
      </p>
    );
  }

  const { profile, targets } = read.value;
  const unit = settings.value['units.energy'];
  const tuneUpOn = settings.value['tuneUp.on'];
  const nutrientGoals = settings.value['goals.nutrients'];
  const nudge = needsRebuild(profile, settings.value['goals.rebuildBaseline']);
  const maintenance = estimateMaintenance(profile, today, targets.kcal);

  const failed = (error: unknown): void => {
    console.error('A goals change could not be saved', error);
    toast.show(t('goals.page.saveFailed'));
  };

  const openTarget = (field: PlanField): void => {
    if (tuneUpOn) {
      setNotice(tuneUpOwns());
      return;
    }
    setEditing(field);
    targetSheet.show();
  };

  const settleEdit = async (edit: Promise<TargetEditOutcome>): Promise<void> => {
    try {
      const outcome = await edit;
      targetSheet.close();
      setNotice(editNotice(outcome));
    } catch (error) {
      failed(error);
    }
  };

  const runRebuild = async (): Promise<void> => {
    if (rebuilding) return;
    setRebuilding(true);
    try {
      const shown = rebuildNotice(await rebuild.rebuild(), unit);
      if (shown) setNotice(shown);
    } catch (error) {
      failed(error);
    } finally {
      setRebuilding(false);
    }
  };

  const switchTuneUp = async (on: boolean): Promise<void> => {
    setSwitching(true);
    try {
      const outcome = await targetEdits.setTuneUp(on);
      if (outcome.kind === 'on') setNotice(tuneUpNotice(outcome.run, unit));
      else if (outcome.restored) toast.show(t('goals.page.plan.restored'));
    } catch (error) {
      failed(error);
    } finally {
      setSwitching(false);
    }
  };

  const balance =
    maintenance.balance === 'close'
      ? t('goals.page.maintenance.close')
      : t(
          maintenance.balance === 'deficit'
            ? 'goals.page.maintenance.under'
            : 'goals.page.maintenance.over',
          { amount: energyAmount(Math.abs(maintenance.difference), unit) },
        );

  const targetRow = (field: PlanField) => (
    <TargetRow
      label={t(`goals.page.targets.label.${field === 'kcal' ? unit : field}`)}
      value={field === 'kcal' ? energyAmount(targets.kcal, unit) : gramsAmount(targets[field])}
      locked={isLocked(profile, field)}
      readOnly={tuneUpOn}
      describedBy={tuneUpOn ? ownsNoteId : undefined}
      onSelect={() => openTarget(field)}
      data-ui={`goals.target.${field}`}
    />
  );

  return (
    <>
      <Card
        heading={t('goals.page.targets.heading')}
        className={styles.card}
        data-ui="goals.targets"
      >
        <ul className={styles.rows}>
          <li className={styles.rowItem}>{targetRow('kcal')}</li>
          <li className={styles.rowItem}>
            <button
              type="button"
              className={styles.row}
              data-ui="goals.maintenance"
              onClick={() =>
                setNotice({
                  title: t('goals.page.maintenance.infoTitle'),
                  lines: [
                    t('goals.page.maintenance.info', {
                      band: energyAmount(MAINTENANCE_BAND, unit),
                    }),
                  ],
                })
              }
            >
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{t('goals.page.maintenance.label')}</span>{' '}
                <span className={styles.rowSub} data-ui="goals.maintenance.balance">
                  {balance}
                </span>
              </span>{' '}
              <span className={styles.rowValue}>
                {energyAmount(maintenance.maintenanceKcal, unit)}
              </span>
              <Icon name="info" size={18} className={styles.chevron} />
            </button>
          </li>
          {MACRO_KEYS.map((macro) => (
            <li key={macro} className={styles.rowItem}>
              {targetRow(macro)}
            </li>
          ))}
        </ul>
        {tuneUpOn ? (
          <p id={ownsNoteId} className={styles.cardNote} data-ui="goals.targets.tuneUp">
            {t('goals.page.targets.tuneUpOwns')}
          </p>
        ) : (
          <p className={styles.cardNote}>{t('goals.page.targets.howLocks')}</p>
        )}
      </Card>

      <Card heading={t('goals.page.plan.heading')} className={styles.card} data-ui="goals.plan">
        <ul className={styles.rows}>
          <li className={styles.rowItem}>
            <button
              type="button"
              className={styles.row}
              aria-busy={rebuilding || undefined}
              data-ui="goals.rebuild"
              onClick={() => void runRebuild()}
            >
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{t('goals.page.plan.rebuild')}</span>{' '}
                {rebuilding ? (
                  <span className={styles.rowSub}>{t('goals.page.plan.rebuilding')}</span>
                ) : nudge ? (
                  <span className={styles.nudge} data-ui="goals.rebuild.nudge">
                    {t('goals.page.plan.nudge')}
                  </span>
                ) : (
                  <span className={styles.rowSub}>{t('goals.page.plan.rebuildHint')}</span>
                )}
              </span>
              <Icon name="chevronRight" size={18} className={styles.chevron} />
            </button>
          </li>
          <li className={`${styles.rowItem} ${styles.switchItem}`}>
            <Switch
              label={t('goals.page.plan.tuneUp')}
              description={t(switching ? 'goals.page.plan.checking' : 'goals.page.plan.tuneUpHint')}
              checked={tuneUpOn}
              disabled={switching}
              onChange={(on) => void switchTuneUp(on)}
              data-ui="goals.tuneUp"
            />
            <IconButton
              label={t('goals.page.plan.tuneUpInfoLabel')}
              icon={<Icon name="info" size={20} />}
              data-ui="goals.tuneUp.info"
              onClick={() =>
                setNotice({
                  title: t('goals.page.plan.tuneUp'),
                  lines: [t('goals.page.plan.tuneUpInfo')],
                })
              }
            />
          </li>
          <li className={styles.rowItem}>
            <button
              type="button"
              className={styles.row}
              data-ui="goals.nutrients.open"
              onClick={nutrientsSheet.show}
            >
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{t('goals.page.plan.nutrients')}</span>{' '}
                <span className={styles.rowSub}>
                  {t('goals.page.plan.nutrientsSummary', {
                    fibre: goalAmount('fibre', nutrientGoals.fibre),
                    sodium: goalAmount('sodium', nutrientGoals.sodium),
                  })}
                </span>
              </span>{' '}
              <Icon name="chevronRight" size={18} className={styles.chevron} />
            </button>
          </li>
          <li className={styles.rowItem}>
            <button
              type="button"
              className={styles.row}
              data-ui="goals.methods"
              onClick={() => router.navigate(tabRoute('settings', 'methods'))}
            >
              <span className={styles.rowLabel}>{t('about.methods.title')}</span>
              <Icon name="chevronRight" size={18} className={styles.chevron} />
            </button>
          </li>
        </ul>
      </Card>

      <Card heading={t('goals.page.alerts.heading')} className={styles.card} data-ui="goals.alerts">
        <Switch
          label={t('goals.page.alerts.goalReached')}
          description={t('goals.page.alerts.goalReachedHint')}
          checked={settings.value['alerts.goalReached']}
          onChange={(on) => {
            targetEdits.setGoalReachedAlert(on).catch(failed);
          }}
          data-ui="goals.goalReached"
        />
      </Card>

      {targetSheet.open ? (
        <TargetSheet
          key={editing}
          field={editing}
          targets={targets}
          locked={isLocked(profile, editing)}
          unit={unit}
          onSave={(value) => settleEdit(targetEdits.setTarget(editing, value))}
          onReset={() => settleEdit(targetEdits.resetToAuto(editing))}
          onClose={targetSheet.close}
        />
      ) : null}
      <NutrientGoalsSheet open={nutrientsSheet.open} onClose={nutrientsSheet.close} />
      <Dialog
        open={notice !== null}
        title={notice?.title ?? ''}
        message={notice?.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        confirmLabel={t('goals.page.ok')}
        cancelLabel={null}
        onConfirm={() => setNotice(null)}
        onCancel={() => setNotice(null)}
        data-ui="goals.notice"
      />
    </>
  );
}
