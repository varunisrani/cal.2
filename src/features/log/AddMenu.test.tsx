import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADD_METHODS,
  DEFAULT_MENU_LAYOUT,
  isOffered,
  type AddMenuLayout,
  type MenuGroup,
  type OfferedMethod,
} from '../../domain/food/addMenu';
import { display } from '../../i18n/en/display';
import { enPartitions } from '../../i18n/en';
import { menu } from '../../i18n/en/menu';
import { lintCatalogue } from '../../i18n/lint';
import { AddMenu, METHODS_NOT_BUILT_YET, type AddMenuProps } from './AddMenu';

afterEach(cleanup);

const words = menu.menu;
const BACK = display.display.menu.back;
const LABEL = 'Add food';

function layoutOf(
  groups: readonly (readonly [string, string, MenuGroup['methods']])[],
  loose: AddMenuLayout['loose'] = [],
): AddMenuLayout {
  return {
    version: 1,
    groups: groups.map(([id, name, methods]) => ({ id, name, methods })),
    loose,
  };
}

/** Draws the menu; every step (a label scan cleared, a method chosen) lands in `steps`. */
function mount(layout: AddMenuLayout, extra: Partial<AddMenuProps> = {}) {
  const steps: string[] = [];
  const clearArmedLabelScan = vi.fn(() => void steps.push('clear'));
  const onChoose = vi.fn((method: OfferedMethod) => void steps.push(method));
  render(
    <AddMenu
      label={LABEL}
      layout={layout}
      clearArmedLabelScan={clearArmedLabelScan}
      onChoose={onChoose}
      data-ui="home.add"
      {...extra}
    />,
  );
  return { steps, clearArmedLabelScan, onChoose };
}

const button = () => screen.getByRole('button', { name: LABEL });
const rowNames = () => screen.getAllByRole('menuitem').map((row) => row.textContent);
const open = () => fireEvent.click(button());
const row = (name: string) => screen.getByRole('menuitem', { name });

describe('AddMenu', () => {
  it("draws the default menu's three groups as pages with their methods and Back (ACC-D3-2)", () => {
    mount(DEFAULT_MENU_LAYOUT, { withheld: [] });
    open();
    expect(rowNames()).toEqual([words.group.snapScan, words.group.describe, words.group.reuse]);
    expect(row(words.group.snapScan)).toHaveAttribute('data-ui', 'home.add.group.snapScan');
    expect(row(words.group.snapScan)).toHaveAttribute('aria-haspopup', 'menu');

    fireEvent.click(row(words.group.snapScan));
    expect(rowNames()).toEqual([
      words.method.camera,
      words.method.library,
      words.method.barcode,
      BACK,
    ]);
    fireEvent.click(row(BACK));
    fireEvent.click(row(words.group.describe));
    expect(rowNames()).toEqual([words.method.describe, words.method.manual, BACK]);
    fireEvent.click(row(BACK));
    fireEvent.click(row(words.group.reuse));
    expect(rowNames()).toEqual([
      words.method.recent,
      words.method.often,
      words.method.saved,
      words.method.copyDay,
      BACK,
    ]);
    expect(row(words.method.saved)).toHaveAttribute('data-ui', 'home.add.saved');
  });

  it('holds nothing back by default, and leaves off a withheld method and a group it leaves empty', () => {
    expect(METHODS_NOT_BUILT_YET).toEqual([]);
    mount(DEFAULT_MENU_LAYOUT, { withheld: ['barcode'] });
    open();
    expect(rowNames()).toEqual([words.group.snapScan, words.group.describe, words.group.reuse]);
    fireEvent.click(row(words.group.snapScan));
    expect(rowNames()).toEqual([words.method.camera, words.method.library, BACK]);
    cleanup();
    mount(layoutOf([['g1', 'Scan', ['barcode']]], ['manual']), { withheld: ['barcode'] });
    open();
    expect(rowNames()).toEqual([words.method.manual]);
  });
  it('clears an armed label scan before every method it hands on (R02.20)', () => {
    const offered = ADD_METHODS.filter(isOffered);
    const { steps, onChoose } = mount(layoutOf([], offered), { withheld: [] });
    for (const method of offered) {
      open();
      fireEvent.click(row(words.method[method]));
    }
    expect(onChoose).toHaveBeenCalledTimes(9);
    expect(steps).toEqual(offered.flatMap((method) => ['clear', method]));
  });

  it('opens a method from inside its group page and closes the menu', () => {
    const { steps } = mount(DEFAULT_MENU_LAYOUT);
    open();
    fireEvent.click(row(words.group.describe));
    fireEvent.click(row(words.method.manual));
    expect(steps).toEqual(['clear', 'manual']);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('draws loose methods under the groups, after a hairline', () => {
    mount(layoutOf([['g1', 'Snacks', ['camera']]], ['manual', 'describe']));
    open();
    expect(rowNames()).toEqual(['Snacks', words.method.manual, words.method.describe]);
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    expect(row(words.method.manual)).toHaveAttribute('data-ui', 'home.add.manual');
  });

  it('draws a flat menu when there are no groups', () => {
    const { steps } = mount(layoutOf([], ['describe', 'camera']));
    open();
    expect(rowNames()).toEqual([words.method.describe, words.method.camera]);
    expect(screen.queryByRole('separator')).toBeNull();
    fireEvent.click(row(words.method.camera));
    expect(steps).toEqual(['clear', 'camera']);
  });

  it("names groups by the person's text, a preset's label, or the generic label when blank", () => {
    mount(
      layoutOf([
        ['a', 'Breakfast things', ['camera']],
        ['b', 'describe', ['describe']],
        ['c', '', ['manual']],
      ]),
    );
    open();
    expect(rowNames()).toEqual(['Breakfast things', words.group.describe, words.group.unnamed]);
  });

  it('never shows the reserved voice, and draws no button when nothing is left to offer', () => {
    mount(layoutOf([['g1', 'Talk', ['voice']]], ['voice', 'recent']), { withheld: ['recent'] });
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    mount({ version: 1, groups: [], loose: [] });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws its words from a catalogue partition that passes the lint', () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
    mount(DEFAULT_MENU_LAYOUT, { withheld: [] });
    expect(button()).toHaveAttribute('data-ui', 'home.add');
    open();
    for (const group of ['snapScan', 'describe', 'reuse'] as const) {
      fireEvent.click(row(words.group[group]));
      for (const name of rowNames()) expect(name).not.toBe('');
      fireEvent.click(row(BACK));
    }
  });
});
