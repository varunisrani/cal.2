import { useState } from 'react';
import { tabRoute } from '../../app/router';
import { useRouter } from '../../app/useRoute';
import { useGoalReached, useSettings } from '../../data/hooks';
import { formatWeight } from '../../domain/units/body';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { Dialog } from '../../ui/Dialog';

const SETTINGS = ['units.weight'] as const;

/** Settings › Personal info, where the goal and the target weight are edited (P05-10). */
export const NEW_GOAL_ROUTE = tabRoute('settings', 'profile');

/**
 * The congratulation shown when a new weigh-in reaches the goal weight, from whichever screen
 * added it (R01.11): mounted once in the app frame, it listens for `goal-reached`. "Set a new
 * goal" opens the goal editor (D-16.13); Dismiss closes. A message that arrives while the dialog
 * is open changes nothing, so two in a row show one dialog.
 */
export function GoalReachedDialog() {
  const router = useRouter();
  const settings = useSettings(SETTINGS);
  const [reachedKg, setReachedKg] = useState<number | null>(null);

  useGoalReached((kg) => setReachedKg((shown) => shown ?? kg));

  const close = (): void => setReachedKg(null);
  const unit = settings.status === 'ready' ? settings.value['units.weight'] : null;
  const message =
    reachedKg === null || unit === null
      ? t('goals.reached.messageNoWeight')
      : t('goals.reached.message', {
          weight: t(unit === 'lb' ? 'goals.reached.weight.lb' : 'goals.reached.weight.kg', {
            amount: formatWeight(reachedKg, unit, currentLocale()),
          }),
        });

  return (
    <Dialog
      open={reachedKg !== null}
      title={t('goals.reached.title')}
      message={message}
      confirmLabel={t('goals.reached.setNewGoal')}
      cancelLabel={t('goals.reached.dismiss')}
      onConfirm={() => {
        close();
        router.navigate(NEW_GOAL_ROUTE);
      }}
      onCancel={close}
      data-ui="goal.reached"
    />
  );
}
