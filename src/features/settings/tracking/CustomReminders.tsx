import { useRef, useState } from 'react';
import { useSheet } from '../../../app/useRoute';
import { useToday } from '../../../app/TodayProvider';
import { useSettings } from '../../../data/hooks';
import type { DayKey } from '../../../domain/dates/dayKey';
import {
  CUSTOM_REMINDER_LIMIT,
  WEEKDAYS,
  type CustomReminder,
  type CustomReminderInput,
  type CustomReminderProblem,
  type Weekday,
} from '../../../domain/reminders/custom';
import { dateFormat, formatDay, formatNameList } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import type { Clock } from '../../../lib/clock';
import { useOptionalServices } from '../../../services/context';
import type { CustomRemindersService } from '../../../services/reminders/customReminders';
import { nextOccurrence } from '../../../services/reminders/schedule';
import type { TrackingSettingsService } from '../../../services/trackingSettings';
import { Button, IconButton } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { DateTimeField } from '../../../ui/DateTimeField';
import { Field } from '../../../ui/Field';
import { Icon } from '../../../ui/icons';
import { Segmented } from '../../../ui/Segmented';
import { Sheet } from '../../../ui/Sheet';
import { Switch } from '../../../ui/Switch';
import { useToast } from '../../../ui/Toast';
import { clockText } from './clockText';
import own from './customReminders.module.css';
import styles from './tracking.module.css';
import { usePermission } from './usePermission';

/** The editor is a sheet with its own history entry, so Back closes it first. */
export const CUSTOM_REMINDER_SHEET = 'custom-reminder';

const SETTINGS = ['remind.custom', 'remind.master', 'display.weekStart'] as const;

/** A new reminder starts here: every day at nine. */
const NEW_TIME = '09:00';

type Repeat = 'days' | 'once';

/** The form's fields, as typed. */
interface Draft {
  readonly text: string;
  readonly time: string;
  readonly repeat: Repeat;
  readonly days: readonly Weekday[];
  readonly date: DayKey;
}

/** The problems shown under the text field; every other one shows under the timing. */
const TEXT_PROBLEMS: ReadonlySet<CustomReminderProblem> = new Set(['noText', 'textTooLong']);

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Weekday names in the locale: 2024-01-01 was a Monday. */
function weekdayName(day: Weekday, style: 'short' | 'long', locale: string): string {
  const offset = WEEKDAYS.indexOf(day);
  return dateFormat(locale, { weekday: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 1 + offset)),
  );
}

/** The weekdays in the order the person's week starts. */
function weekOrder(start: 'mon' | 'sun'): readonly Weekday[] {
  return start === 'sun' ? ['sun', ...WEEKDAYS.slice(0, 6)] : WEEKDAYS;
}

/** When a reminder comes, in a line: every day, which days, once on a date, or passed. */
function timingText(reminder: CustomReminder, now: number, locale: string): string {
  const time = clockText(minutesOf(reminder.time), locale);
  if (reminder.date !== undefined) {
    const date = formatDay(reminder.date, 'medium', locale);
    return nextOccurrence(reminder, now) === null
      ? t('reminders.yours.passed', { date, time })
      : t('reminders.yours.once', { date, time });
  }
  if (reminder.days.length === WEEKDAYS.length) return t('reminders.yours.everyDay', { time });
  const days = formatNameList(
    reminder.days.map((day) => weekdayName(day, 'short', locale)),
    locale,
  );
  return t('reminders.yours.onDays', { days, time });
}

function inputOf(draft: Draft, on: boolean): CustomReminderInput {
  return draft.repeat === 'days'
    ? { text: draft.text, time: draft.time, days: draft.days, on }
    : { text: draft.text, time: draft.time, date: draft.date, on };
}

/**
 * "Your reminders" on Settings › Tracking & reminders (P13, D-16.93): the reminders the person
 * wrote, each a switch named by its text with when it comes under it and an Edit button; Add opens
 * the same sheet empty. At 20 the Add button is off and a line says why. Like every reminder they
 * show only while the Notifications switch is on and allowed: a line says so while it is not, and
 * switching one on (or adding one) then asks for the permission in the same press, as the
 * Notifications switch does; a refusal leaves it off and the Notifications card points to the
 * settings. Nothing is drawn until the settings are read (R06.22), nor without the services.
 */
export function CustomRemindersCard() {
  const services = useOptionalServices();
  const reminders = services?.customReminders;
  const tracking = services?.trackingSettings;
  return services && reminders && tracking ? (
    <YourReminders service={reminders} tracking={tracking} clock={services.clock} />
  ) : null;
}

interface CardProps {
  readonly service: CustomRemindersService;
  readonly tracking: TrackingSettingsService;
  /** "Now", to tell a once reminder that has passed. */
  readonly clock: Clock;
}

/** Which reminder the sheet edits: a new one, or the one with this id. */
type Editing = { readonly kind: 'new' } | { readonly kind: 'edit'; readonly id: string };

function YourReminders({ service, tracking, clock }: CardProps) {
  const settings = useSettings(SETTINGS);
  const permission = usePermission(tracking);
  const toast = useToast();
  const sheet = useSheet(CUSTOM_REMINDER_SHEET);
  const [editing, setEditing] = useState<Editing>({ kind: 'new' });
  const [writing, setWriting] = useState<ReadonlySet<string>>(() => new Set());

  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="reminders.yours.unavailable">
        {t('reminders.settings.unavailable')}
      </p>
    );
  }

  const locale = currentLocale();
  const now = clock.now();
  const list = settings.value['remind.custom'];
  const full = list.length >= CUSTOM_REMINDER_LIMIT;
  const notificationsOn = settings.value['remind.master'] && permission === 'granted';

  /**
   * Asks for the permission when notifications are not on yet (call it inside the press, before
   * anything is awaited); resolves whether a new reminder may be on.
   */
  const allowed = (): Promise<boolean> =>
    notificationsOn
      ? Promise.resolve(true)
      : tracking.turnRemindersOn().then((answer) => answer === 'granted');

  /** Runs one switch's write, holding that switch until it settles. */
  const run = async (id: string, write: () => Promise<unknown>): Promise<void> => {
    setWriting((ids) => new Set(ids).add(id));
    try {
      await write();
    } catch (error) {
      console.error('A reminder could not be saved', error);
      toast.show(t('reminders.settings.saveFailed'));
    } finally {
      setWriting((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  };

  const switchOne = (reminder: CustomReminder, on: boolean): void => {
    const asked = on ? allowed() : Promise.resolve(true);
    void run(reminder.id, async () => {
      // Refused: the switch stays off, and the Notifications card says where to allow it.
      if (await asked) await service.setCustomReminderOn(reminder.id, on);
    });
  };

  const open = (next: Editing): void => {
    setEditing(next);
    sheet.show();
  };

  const edited = editing.kind === 'edit' ? list.find((each) => each.id === editing.id) : undefined;

  return (
    <Card heading={t('reminders.yours.heading')} className={styles.card} data-ui="reminders.yours">
      {list.length > 0 ? (
        <ul className={styles.rows}>
          {list.map((reminder) => (
            <li
              key={reminder.id}
              className={`${styles.rowItem} ${own.item}`}
              data-ui="reminders.yours.item"
            >
              <div className={own.switch}>
                <Switch
                  label={reminder.text}
                  description={timingText(reminder, now, locale)}
                  checked={reminder.on}
                  disabled={writing.has(reminder.id)}
                  onChange={(on) => switchOne(reminder, on)}
                  data-ui="reminders.yours.switch"
                />
              </div>
              <IconButton
                icon={<Icon name="pencil" size={20} />}
                label={t('reminders.yours.edit', { text: reminder.text })}
                onClick={() => open({ kind: 'edit', id: reminder.id })}
                data-ui="reminders.yours.edit"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${styles.note} ${styles.cardNote}`} data-ui="reminders.yours.empty">
          {t('reminders.yours.empty')}
        </p>
      )}
      {list.length > 0 && !notificationsOn ? (
        <p className={`${styles.note} ${styles.cardNote}`} data-ui="reminders.yours.needsOn">
          {t('reminders.yours.needsNotifications')}
        </p>
      ) : null}
      {full ? (
        <p className={`${styles.note} ${styles.cardNote}`} data-ui="reminders.yours.full">
          {t('reminders.yours.full')}
        </p>
      ) : null}
      <div className={own.add}>
        <Button
          variant="secondary"
          block
          disabled={full}
          data-ui="reminders.yours.add"
          onClick={() => open({ kind: 'new' })}
        >
          {t('reminders.yours.add')}
        </Button>
      </div>

      {sheet.open && (editing.kind === 'new' || edited) ? (
        <ReminderSheet
          key={editing.kind === 'new' ? 'new' : editing.id}
          reminder={edited ?? null}
          weekStart={settings.value['display.weekStart']}
          service={service}
          allowed={allowed}
          onClose={sheet.close}
          onDeleted={() => toast.show(t('reminders.yours.deleted'))}
        />
      ) : null}
    </Card>
  );
}

export interface SheetProps {
  /** The reminder to edit, or null for a new one. */
  readonly reminder: CustomReminder | null;
  readonly weekStart: 'mon' | 'sun';
  readonly service: CustomRemindersService;
  /** Asks for the permission if needed; resolves whether a new reminder may be on. */
  readonly allowed: () => Promise<boolean>;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}

function draftOf(reminder: CustomReminder | null, today: DayKey): Draft {
  if (reminder === null) {
    return { text: '', time: NEW_TIME, repeat: 'days', days: WEEKDAYS, date: today };
  }
  return reminder.date !== undefined
    ? {
        text: reminder.text,
        time: reminder.time,
        repeat: 'once',
        days: WEEKDAYS,
        date: reminder.date,
      }
    : {
        text: reminder.text,
        time: reminder.time,
        repeat: 'days',
        days: reminder.days,
        date: today,
      };
}

/**
 * The reminder's sheet: what it says, its time, and whether it repeats on days (weekday buttons,
 * all seven to start) or comes once on a date (today or later). Save checks the fields first and
 * says what is wrong under the field it is about; a new reminder is saved on when notifications
 * are on or allowed in the same press, else off. Editing keeps the reminder's switch as it is and
 * offers Delete. The Coach's "Reminder set" card opens it too (P17).
 */
export function ReminderSheet({
  reminder,
  weekStart,
  service,
  allowed,
  onClose,
  onDeleted,
}: SheetProps) {
  const today = useToday();
  const toast = useToast();
  const locale = currentLocale();
  const [draft, setDraft] = useState<Draft>(() => draftOf(reminder, today));
  const [problem, setProblem] = useState<CustomReminderProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const textField = useRef<HTMLInputElement>(null);
  const isNew = reminder === null;

  const change = (next: Partial<Draft>): void => {
    setDraft((current) => ({ ...current, ...next }));
    setProblem(null);
  };

  const toggleDay = (day: Weekday): void => {
    const has = draft.days.includes(day);
    change({ days: WEEKDAYS.filter((each) => (each === day ? !has : draft.days.includes(each))) });
  };

  const save = async (): Promise<void> => {
    const found = service.problemWith(inputOf(draft, true));
    if (found !== null) {
      setProblem(found);
      if (TEXT_PROBLEMS.has(found)) textField.current?.focus();
      return;
    }
    // Asked before anything is awaited: browsers prompt only inside the press.
    const asked = isNew ? allowed() : Promise.resolve(reminder.on);
    setSaving(true);
    try {
      const on = await asked;
      const result = isNew
        ? await service.addCustomReminder(inputOf(draft, on))
        : await service.updateCustomReminder(reminder.id, inputOf(draft, on));
      if (result.ok) onClose();
      else setProblem(result.error);
    } catch (error) {
      console.error('A reminder could not be saved', error);
      toast.show(t('reminders.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (reminder === null) return;
    try {
      await service.removeCustomReminder(reminder.id);
      onClose();
      onDeleted();
    } catch (error) {
      console.error('A reminder could not be deleted', error);
      toast.show(t('reminders.settings.saveFailed'));
    }
  };

  const problemText = problem === null ? null : t(`reminders.yours.problems.${problem}`);
  const textProblem = problem !== null && TEXT_PROBLEMS.has(problem) ? problemText : null;
  const timingProblem = problem !== null && !TEXT_PROBLEMS.has(problem) ? problemText : null;

  return (
    <Sheet
      open
      title={t(isNew ? 'reminders.yours.newTitle' : 'reminders.yours.editTitle')}
      onClose={onClose}
      initialFocus={textField}
      data-ui="reminders.yours.sheet"
      leading={
        <Button variant="quiet" data-ui="reminders.yours.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          disabled={saving}
          data-ui="reminders.yours.save"
          onClick={() => save()}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.editor}>
        <Field
          ref={textField}
          label={t('reminders.yours.text')}
          hint={t('reminders.yours.textHint')}
          error={textProblem ?? undefined}
          value={draft.text}
          onChange={(text) => change({ text })}
          autoComplete="off"
          enterKeyHint="done"
          data-ui="reminders.yours.text"
        />
        <DateTimeField
          kind="time"
          label={t('reminders.yours.time')}
          value={draft.time}
          onChange={(time) => change({ time })}
          data-ui="reminders.yours.time"
        />
        <Segmented<Repeat>
          label={t('reminders.yours.repeat')}
          options={[
            { value: 'days', label: t('reminders.yours.onTheseDays') },
            { value: 'once', label: t('reminders.yours.onceOnly') },
          ]}
          value={draft.repeat}
          onChange={(repeat) => change({ repeat })}
          data-ui="reminders.yours.repeat"
        />
        {draft.repeat === 'days' ? (
          <fieldset className={own.days} data-ui="reminders.yours.days">
            <legend className={own.legend}>{t('reminders.yours.days')}</legend>
            <div className={own.dayButtons}>
              {weekOrder(weekStart).map((day) => (
                <button
                  key={day}
                  type="button"
                  className={own.day}
                  aria-pressed={draft.days.includes(day)}
                  aria-label={weekdayName(day, 'long', locale)}
                  data-ui={`reminders.yours.day.${day}`}
                  onClick={() => toggleDay(day)}
                >
                  {weekdayName(day, 'short', locale)}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <DateTimeField
            kind="date"
            label={t('reminders.yours.date')}
            value={draft.date}
            min={today}
            onChange={(date) => change({ date })}
            data-ui="reminders.yours.date"
          />
        )}
        {timingProblem !== null ? (
          <p className={own.problem} role="alert" data-ui="reminders.yours.problem">
            {timingProblem}
          </p>
        ) : null}
        {isNew ? null : (
          <Button variant="danger" block data-ui="reminders.yours.delete" onClick={remove}>
            {t('reminders.yours.delete')}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
