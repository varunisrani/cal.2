// How Settings › App settings, Tab bar and Product details write (P09-02, P09-04, P09-06): through
// the `appSettings` service, with each control showing the person's choice the moment it is made.
// A choice is shown until the stored value moves (the write landed, or another tab wrote first),
// and from then on the stored value wins; a write that fails drops the choice at once.

import { useState } from 'react';
import { t } from '../../../i18n/t';
import type { AppSettingsService } from '../../../services/appSettings';
import { useServices } from '../../../services/context';
import { useToast } from '../../../ui/Toast';

/** The app settings service; these pages are never drawn without one. */
export function useAppSettingsService(): AppSettingsService {
  const { appSettings } = useServices();
  if (!appSettings) throw new Error('No appSettings service above this Settings page');
  return appSettings;
}

/** Says that a change was not saved (and logs why). */
export function useSaveFailed(): (error: unknown) => void {
  const toast = useToast();
  return (error) => {
    console.error('An app setting could not be saved', error);
    toast.show(t('appSettings.saveFailed'));
  };
}

/** A choice being written: what to show, and the stored value it was made over. */
interface Choice {
  readonly value: unknown;
  readonly over: unknown;
}

type Choices = Readonly<Record<string, Choice>>;

const NO_CHOICES: Choices = {};

/** `choices` without those whose stored value has moved since they were made. */
function stillWaiting(choices: Choices, stored: Readonly<Record<string, unknown>>): Choices {
  const keys = Object.keys(choices);
  const waiting = keys.filter((key) => Object.is(stored[key], choices[key]?.over));
  if (waiting.length === keys.length) return choices;
  return Object.fromEntries(waiting.map((key) => [key, choices[key] as Choice]));
}

export interface PendingWrites<S extends Readonly<Record<string, unknown>>> {
  /** What the control for `key` shows: the choice being written, else the stored value. */
  shown<K extends keyof S & string>(key: K): S[K];
  /**
   * Shows `value` for `key` at once and runs `save`. Rejects with the error of a failed save, and
   * the control then shows the stored value again.
   */
  write<K extends keyof S & string>(
    key: K,
    value: S[K],
    save: () => Promise<unknown>,
  ): Promise<void>;
}

/**
 * Choices shown while their writes run, over `stored`: one plain value per control (a boolean,
 * a string), compared with `Object.is`.
 */
export function usePendingWrites<S extends Readonly<Record<string, unknown>>>(
  stored: S,
): PendingWrites<S> {
  const [choices, setChoices] = useState<Choices>(NO_CHOICES);
  // A stored value that moved wins over the choice made before it moved; adjusting the state
  // while rendering draws the stored value in this same pass.
  const current = stillWaiting(choices, stored);
  if (current !== choices) setChoices(current);

  return {
    shown: (key) => {
      const choice = current[key];
      return (choice ? choice.value : stored[key]) as S[typeof key];
    },

    async write(key, value, save) {
      const over = stored[key];
      const choice: Choice = { value, over };
      // Choosing the stored value again needs nothing shown in its place.
      setChoices((now) => {
        const { [key]: _replaced, ...others } = now;
        return Object.is(value, over) ? others : { ...others, [key]: choice };
      });
      try {
        await save();
      } catch (error) {
        setChoices((now) => {
          if (now[key] !== choice) return now;
          const { [key]: _dropped, ...others } = now;
          return others;
        });
        throw error;
      }
    },
  };
}
