import { useLayoutEffect, useRef, useState } from 'react';
import { useSettings } from '../../../data/hooks';
import {
  decodeLayout,
  DEFAULT_MENU_LAYOUT,
  isOffered,
  isPresetGroupName,
  MAX_MENU_GROUPS,
  restoreMethod,
  type AddMenuLayout,
  type AddMethod,
  type MenuGroup,
  type OfferedMethod,
  type RestoreTarget,
} from '../../../domain/food/addMenu';
import { t } from '../../../i18n/t';
import { Button, IconButton } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Field } from '../../../ui/Field';
import { Icon, type IconName } from '../../../ui/icons';
import { ListPicker } from '../../../ui/ListPicker';
import { Stepper } from '../../../ui/Stepper';
import { groupLabel } from '../../log/AddMenu';
import styles from './appSettings.module.css';
import own from './menuEditor.module.css';
import {
  hiddenMethods,
  layoutKey,
  moveGroup,
  moveMethod,
  removeMethod,
  renameGroup,
  withGroupCount,
} from './menuEdits';
import { useAppSettingsService, useSaveFailed } from './writes';

const SETTINGS = ['menu.layout'] as const;

/** Each method's picture, as the + menu draws it. */
const METHOD_ICONS: Record<OfferedMethod, IconName> = {
  camera: 'camera',
  library: 'photos',
  barcode: 'barcode',
  describe: 'text',
  manual: 'pencil',
  recent: 'clock',
  often: 'chart',
  saved: 'heart',
  copyDay: 'copy',
};

const methodName = (method: OfferedMethod): string => t(`menu.method.${method}`);

/** A group's name in words, as the menu will show it once saved (trimmed). */
const nameOf = (group: MenuGroup): string => groupLabel(group.name.trim());

/**
 * Settings › Add menu (06 §3.6, P09-05): the number of groups (0–3), a card per group (its name,
 * its place among the groups, its methods, each moved or removed, and Add method from the hidden
 * ones), the methods straight on the menu, the hidden methods (a tap puts one back), Reset to
 * default and a note that water and fasting keep their own rows. Nothing is drawn until the
 * stored menu is read, so no edit is made over a menu not yet known (R06.21, R06.22).
 */
export function MenuEditorPage() {
  const settings = useSettings(SETTINGS);
  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="menuEditor.unavailable">
        {t('appSettings.unavailable')}
      </p>
    );
  }
  return <MenuEditor stored={decodeLayout(settings.value['menu.layout'])} />;
}

/** The page's writes, kept between renders. */
interface Writes {
  /** The stored menu's key as last read. */
  seen: string;
  /** The stored menu as last read: where a failed write goes back to. */
  read: AddMenuLayout;
  /** Writes not yet settled. */
  running: number;
  /** Keys of this page's writes not read back yet, oldest first. */
  unread: string[];
}

/**
 * The page's own copy of the menu, which may hold empty groups and names as typed, and the ways
 * to change it. Each change is stored at once, tidied (R06.21). A menu read from the store
 * replaces the copy only when it is news: not the copy itself tidied, not read while a write of
 * this page runs (that write lands after it and replaces it), and not an older write of this
 * page read late while a newer one is still to come back. A change made elsewhere (another tab,
 * a restore) is taken.
 */
function useMenuCopy(stored: AddMenuLayout) {
  const service = useAppSettingsService();
  const failed = useSaveFailed();
  const storedKey = layoutKey(stored);
  const [copy, setCopy] = useState(stored);
  const writes = useRef<Writes>({ seen: storedKey, read: stored, running: 0, unread: [] });

  useLayoutEffect(() => {
    const w = writes.current;
    w.read = stored;
    if (w.seen === storedKey) return;
    w.seen = storedKey;
    const ours = w.unread.indexOf(storedKey);
    if (ours >= 0) w.unread = w.unread.slice(ours + 1);
    const waiting = w.running > 0 || (ours >= 0 && w.unread.length > 0);
    setCopy((now) => (waiting || layoutKey(now) === storedKey ? now : stored));
  }, [stored, storedKey]);

  const save = (next: AddMenuLayout, write: () => Promise<unknown>): void => {
    const w = writes.current;
    const key = layoutKey(next);
    // A write that stores what is stored already is never read back.
    const changes = key !== (w.unread.at(-1) ?? w.seen);
    if (changes) w.unread.push(key);
    w.running += 1;
    setCopy(next);
    write().then(
      () => {
        w.running -= 1;
      },
      (error: unknown) => {
        w.running -= 1;
        const at = w.unread.lastIndexOf(key);
        if (changes && at >= 0) w.unread.splice(at, 1);
        setCopy(w.read);
        failed(error);
      },
    );
  };

  return {
    copy,
    edit: (change: (now: AddMenuLayout) => AddMenuLayout): void => {
      const next = change(copy);
      save(next, () => service.setMenuLayout(next));
    },
    reset: (): void => save(DEFAULT_MENU_LAYOUT, () => service.resetMenuLayout()),
  };
}

type Edit = (change: (now: AddMenuLayout) => AddMenuLayout) => void;

function MenuEditor({ stored }: { readonly stored: AddMenuLayout }) {
  const { copy, edit, reset } = useMenuCopy(stored);
  // Where Add method puts the method picked; null while the picker is closed.
  const [adding, setAdding] = useState<RestoreTarget | null>(null);
  const hidden = hiddenMethods(copy);
  const loose = copy.loose.filter(isOffered);

  return (
    <div className={styles.page} data-ui="menuEditor">
      <div className={styles.section}>
        <Card heading={t('settings.menuEditor.food')} className={styles.card}>
          <div className={own.count}>
            <span className={own.countLabel} aria-hidden="true">
              {t('settings.menuEditor.groups')}
            </span>
            <Stepper
              label={t('settings.menuEditor.groups')}
              value={copy.groups.length}
              min={0}
              max={MAX_MENU_GROUPS}
              onChange={(count) => edit((now) => withGroupCount(now, count))}
              data-ui="menuEditor.groups"
            />
          </div>
        </Card>
        <p className={styles.note}>{t('settings.menuEditor.groupsNote')}</p>
      </div>

      {copy.groups.map((group, index) => (
        <GroupCard
          key={group.id}
          group={group}
          first={index === 0}
          last={index === copy.groups.length - 1}
          canAdd={hidden.length > 0}
          edit={edit}
          onAdd={() => setAdding({ group: group.id })}
        />
      ))}

      {loose.length > 0 || hidden.length > 0 ? (
        <div className={styles.section}>
          <Card
            heading={t('settings.menuEditor.loose')}
            className={styles.card}
            data-ui="menuEditor.loose"
          >
            <MethodRows methods={loose} edit={edit} />
            {hidden.length > 0 ? (
              <AddMethodButton onClick={() => setAdding('loose')} data-ui="menuEditor.loose.add" />
            ) : null}
          </Card>
          <p className={styles.note}>{t('settings.menuEditor.looseNote')}</p>
        </div>
      ) : null}

      {hidden.length > 0 ? (
        <Card
          heading={t('settings.menuEditor.hidden')}
          className={styles.card}
          data-ui="menuEditor.hidden"
        >
          <ul className={styles.rows}>
            {hidden.map((method) => (
              <li key={method} className={styles.rowItem}>
                <button
                  type="button"
                  className={own.restore}
                  aria-label={t('settings.menuEditor.restore', { name: methodName(method) })}
                  data-ui={`menuEditor.hidden.${method}`}
                  onClick={() => edit((now) => restoreMethod(now, method))}
                >
                  <Icon name={METHOD_ICONS[method]} size={20} className={own.methodIcon} />
                  <span className={own.methodName}>{methodName(method)}</span>
                  <Icon name="plus" size={20} className={own.restoreIcon} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className={styles.section}>
        <Button variant="quiet" block onClick={reset} data-ui="menuEditor.reset">
          {t('settings.menuEditor.reset')}
        </Button>
        <p className={styles.note} data-ui="menuEditor.footer">
          {t('settings.menuEditor.footer')}
        </p>
      </div>

      <ListPicker
        open={adding !== null}
        title={t('settings.menuEditor.addMethod')}
        options={hidden.map((method) => ({ value: method, label: methodName(method) }))}
        value={undefined}
        onSelect={(method) => {
          if (adding !== null) edit((now) => restoreMethod(now, method, adding));
        }}
        onClose={() => setAdding(null)}
        data-ui="menuEditor.addSheet"
      />
    </div>
  );
}

interface GroupCardProps {
  readonly group: MenuGroup;
  readonly first: boolean;
  readonly last: boolean;
  /** Some method is hidden, so Add method has something to offer. */
  readonly canAdd: boolean;
  readonly edit: Edit;
  readonly onAdd: () => void;
}

/** One group: its name and place, its methods, and Add method. */
function GroupCard({ group, first, last, canAdd, edit, onAdd }: GroupCardProps) {
  const name = nameOf(group);
  const methods = group.methods.filter(isOffered);
  const ui = `menuEditor.group.${group.id}`;
  return (
    <Card heading={name} className={styles.card} data-ui={ui}>
      <div className={own.groupHead}>
        <Field
          label={t('settings.menuEditor.name')}
          // A preset name is ours, not the person's: the field shows it as a hint only.
          value={isPresetGroupName(group.name) ? '' : group.name}
          placeholder={name}
          onChange={(text) => edit((now) => renameGroup(now, group.id, text))}
          className={own.name}
          data-ui={`${ui}.name`}
        />
        {first && last ? null : (
          <span className={own.moves}>
            <IconButton
              label={t('settings.menuEditor.moveUp', { name })}
              icon={<Icon name="chevronUp" size={20} />}
              disabled={first}
              onClick={() => edit((now) => moveGroup(now, group.id, -1))}
              data-ui={`${ui}.up`}
            />
            <IconButton
              label={t('settings.menuEditor.moveDown', { name })}
              icon={<Icon name="chevronDown" size={20} />}
              disabled={last}
              onClick={() => edit((now) => moveGroup(now, group.id, 1))}
              data-ui={`${ui}.down`}
            />
          </span>
        )}
      </div>
      {methods.length > 0 ? (
        <MethodRows methods={methods} edit={edit} />
      ) : (
        <p className={own.empty}>{t('settings.menuEditor.emptyGroup')}</p>
      )}
      {canAdd ? <AddMethodButton onClick={onAdd} data-ui={`${ui}.add`} /> : null}
    </Card>
  );
}

/** A list's methods, each with its moves and Remove (which hides it). */
function MethodRows({
  methods,
  edit,
}: {
  readonly methods: readonly OfferedMethod[];
  readonly edit: Edit;
}) {
  if (methods.length === 0) return null;
  const move = (method: AddMethod, by: -1 | 1) => edit((now) => moveMethod(now, method, by));
  return (
    <ul className={styles.rows}>
      {methods.map((method, index) => {
        const name = methodName(method);
        const ui = `menuEditor.method.${method}`;
        return (
          <li key={method} className={`${styles.rowItem} ${own.method}`} data-ui={ui}>
            <Icon name={METHOD_ICONS[method]} size={20} className={own.methodIcon} />
            <span className={own.methodName}>{name}</span>
            <IconButton
              label={t('settings.menuEditor.moveUp', { name })}
              icon={<Icon name="chevronUp" size={20} />}
              disabled={index === 0}
              onClick={() => move(method, -1)}
              data-ui={`${ui}.up`}
            />
            <IconButton
              label={t('settings.menuEditor.moveDown', { name })}
              icon={<Icon name="chevronDown" size={20} />}
              disabled={index === methods.length - 1}
              onClick={() => move(method, 1)}
              data-ui={`${ui}.down`}
            />
            <IconButton
              label={t('settings.menuEditor.remove', { name })}
              icon={<Icon name="minus" size={20} />}
              onClick={() => edit((now) => removeMethod(now, method))}
              data-ui={`${ui}.remove`}
            />
          </li>
        );
      })}
    </ul>
  );
}

function AddMethodButton({
  onClick,
  'data-ui': ui,
}: {
  readonly onClick: () => void;
  readonly 'data-ui': string;
}) {
  return (
    <div className={own.add}>
      <Button variant="quiet" onClick={onClick} data-ui={ui}>
        <Icon name="plus" size={18} />
        {t('settings.menuEditor.addMethod')}
      </Button>
    </div>
  );
}
