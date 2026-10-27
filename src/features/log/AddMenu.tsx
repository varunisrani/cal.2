import { Suspense } from 'react';
import { onDemand } from '../../app/onDemand';
import type { DayKey } from '../../domain/dates/dayKey';
import {
  isOffered,
  isPresetGroupName,
  RESERVED_METHODS,
  withoutMethods,
  type AddMenuLayout,
  type AddMethod,
  type OfferedMethod,
  type PresetGroupName,
} from '../../domain/food/addMenu';
import type { Fast } from '../../domain/model';
import { t, type TKey } from '../../i18n/t';
import { useOptionalServices } from '../../services/context';
import type { FastResult } from '../../services/fasting';
import { Icon, type IconName } from '../../ui/icons';
import { Menu, type MenuAction, type MenuEntry, type MenuPanelControls } from '../../ui/Menu';
import { useToast } from '../../ui/Toast';

// The water page is the water feature's own; it is fetched the first time it opens.
const WaterMenuPage = onDemand(() =>
  import('../water/WaterMenuPage').then((module) => module.WaterMenuPage),
);

/**
 * Methods whose sheets are not built yet. They stay in the layout (and the default) but are left
 * off the drawn menu; each slice deleted its own here when its sheet landed, and none is left.
 */
export const METHODS_NOT_BUILT_YET: readonly AddMethod[] = [];

const GROUP_WORDS: Record<PresetGroupName, TKey> = {
  snapScan: 'menu.group.snapScan',
  describe: 'menu.group.describe',
  reuse: 'menu.group.reuse',
};

const METHOD_LOOKS: Record<OfferedMethod, { readonly label: TKey; readonly icon: IconName }> = {
  camera: { label: 'menu.method.camera', icon: 'camera' },
  library: { label: 'menu.method.library', icon: 'photos' },
  barcode: { label: 'menu.method.barcode', icon: 'barcode' },
  describe: { label: 'menu.method.describe', icon: 'text' },
  manual: { label: 'menu.method.manual', icon: 'pencil' },
  recent: { label: 'menu.method.recent', icon: 'clock' },
  often: { label: 'menu.method.often', icon: 'chart' },
  saved: { label: 'menu.method.saved', icon: 'heart' },
  copyDay: { label: 'menu.method.copyDay', icon: 'copy' },
};

/** A group's name in words: a preset's label, the person's text, or the generic label. */
export function groupLabel(name: string): string {
  if (isPresetGroupName(name)) return t(GROUP_WORDS[name]);
  return name === '' ? t('menu.group.unnamed') : name;
}

/** What the menu offers under the food: water and fasting (P07-08). */
export interface AddMenuTrackers {
  /** The day Home shows: water is logged on it. */
  readonly day: DayKey;
  /** Water tracking is on: Water opens the water page. */
  readonly waterOn: boolean;
  /** Fasting tracking is on: Start fast while no fast runs. */
  readonly fastingOn: boolean;
  /** The running fast, or null. While one runs the food is left off and Fasting is offered. */
  readonly activeFast: Fast | null;
  /** The water page's Custom amount: the menu has closed; the host shows the custom sheet. */
  readonly onCustomWater: () => void;
  /** Start fast: the menu has closed; the host shows the start sheet. */
  readonly onStartFast: () => void;
}

export interface AddMenuProps {
  /** The "+" button's accessible name. */
  readonly label: string;
  /** The tidied layout (`decodeLayout` of the stored setting). */
  readonly layout: AddMenuLayout;
  /**
   * Runs before every method: a label scan armed after a barcode miss (P06-17) must not reach
   * any other method, or a stale code would link an unrelated meal to a product (R02.20).
   */
  readonly clearArmedLabelScan: () => void;
  /** Opens the chosen method's sheet. */
  readonly onChoose: (method: OfferedMethod) => void;
  /** Methods to leave off the menu; the ones not built yet by default. */
  readonly withheld?: readonly AddMethod[];
  /** Water and fasting under the food; without it the menu offers food only. */
  readonly trackers?: AddMenuTrackers;
  readonly triggerClassName?: string;
  /** Hook for the button; a method row is `<hook>.<method>`, a group row `<hook>.group.<id>`. */
  readonly 'data-ui'?: string;
}

/**
 * The add menu (02 §3.18, 05 §3.4): each group of the layout is a page with its methods and a
 * Back row, and the loose methods follow the groups. Reserved methods and withheld ones (those not
 * built yet) are left off, and so is a group left with none. Under a hairline come the trackers:
 * Water (while water is tracked) opens the water page inside the menu; Start fast (fasting
 * tracked, none running) hands over to the start sheet; Fasting (a fast running) is a page with
 * End fast and Cancel fast, which act at once. While a fast runs the food is left off entirely
 * (the store refuses food then anyway, R05.1). With nothing to offer there is no button.
 */
export function AddMenu({
  label,
  layout,
  clearArmedLabelScan,
  onChoose,
  withheld = METHODS_NOT_BUILT_YET,
  trackers,
  triggerClassName,
  'data-ui': dataUi,
}: AddMenuProps) {
  const services = useOptionalServices();
  const toast = useToast();
  const shown = withoutMethods(layout, [...RESERVED_METHODS, ...withheld]);
  const running = trackers?.activeFast ?? null;

  const rowFor = (method: AddMethod): MenuAction[] => {
    if (!isOffered(method)) return [];
    const look = METHOD_LOOKS[method];
    return [
      {
        kind: 'action',
        id: method,
        label: t(look.label),
        icon: <Icon name={look.icon} size={20} />,
        onSelect: () => {
          clearArmedLabelScan();
          onChoose(method);
        },
      },
    ];
  };

  const groups: MenuEntry[] = shown.groups.flatMap((group) => {
    const rows = group.methods.flatMap(rowFor);
    const first = rows[0];
    if (!first) return [];
    return [
      {
        kind: 'page',
        id: `group.${group.id}`,
        label: groupLabel(group.name),
        icon: first.icon,
        entries: rows,
      },
    ];
  });
  const loose = shown.loose.flatMap(rowFor);
  const food: MenuEntry[] = running
    ? []
    : [
        ...groups,
        ...(groups.length > 0 && loose.length > 0
          ? [{ kind: 'separator', id: 'loose' } as const]
          : []),
        ...loose,
      ];

  /** End fast and Cancel fast: at once, through the fasting service; a refusal or failure is said. */
  const changeFast = (fast: Fast, change: 'end' | 'cancel'): void => {
    const failed = (error: unknown): void => {
      console.error('Changing the running fast failed', error);
      toast.show(t('menu.tracker.failed'));
    };
    const service = services?.fasting;
    if (!service) {
      failed(new Error('No fasting service above the add menu'));
      return;
    }
    service[change](fast.id).then((result: FastResult) => {
      // Ended or deleted somewhere else meanwhile: nothing changed here.
      if (!result.ok) toast.show(t('menu.tracker.gone'));
    }, failed);
  };

  const tracked: MenuEntry[] = [];
  if (trackers?.waterOn) {
    const { day, onCustomWater } = trackers;
    tracked.push({
      kind: 'panel',
      id: 'water',
      label: t('menu.tracker.water'),
      icon: <Icon name="drop" size={20} />,
      render: ({ close, back }: MenuPanelControls) => (
        <Suspense fallback={null}>
          <WaterMenuPage
            day={day}
            onDone={close}
            onBack={back}
            onCustom={() => {
              close();
              onCustomWater();
            }}
          />
        </Suspense>
      ),
    });
  }
  // A running fast is offered even with fasting switched off, so it can always be ended (R05.2).
  if (running) {
    tracked.push({
      kind: 'page',
      id: 'fasting',
      label: t('menu.tracker.fasting'),
      icon: <Icon name="hourglass" size={20} />,
      entries: [
        {
          kind: 'action',
          id: 'endFast',
          label: t('menu.tracker.endFast'),
          icon: <Icon name="check" size={20} />,
          onSelect: () => changeFast(running, 'end'),
        },
        {
          kind: 'action',
          id: 'cancelFast',
          label: t('menu.tracker.cancelFast'),
          icon: <Icon name="close" size={20} />,
          onSelect: () => changeFast(running, 'cancel'),
        },
      ],
    });
  } else if (trackers?.fastingOn) {
    const { onStartFast } = trackers;
    tracked.push({
      kind: 'action',
      id: 'startFast',
      label: t('menu.tracker.startFast'),
      icon: <Icon name="hourglass" size={20} />,
      onSelect: onStartFast,
    });
  }

  const entries: MenuEntry[] = [
    ...food,
    ...(food.length > 0 && tracked.length > 0
      ? [{ kind: 'separator', id: 'trackers' } as const]
      : []),
    ...tracked,
  ];
  if (entries.length === 0) return null;

  return (
    <Menu
      label={label}
      icon={<Icon name="plus" size={28} />}
      hideLabel
      placement="above"
      align="end"
      entries={entries}
      triggerClassName={triggerClassName}
      data-ui={dataUi}
    />
  );
}
