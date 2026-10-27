import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from '../../../app/useRoute';
import { DataProvider } from '../../../data/DataProvider';
import { GOAL_KEYS } from '../../../domain/nutrients/catalogue';
import { DEFAULT_GOAL_VALUES, type GoalValues } from '../../../domain/nutrients/goalDefaults';
import { common } from '../../../i18n/en/common';
import { goals } from '../../../i18n/en/goals';
import { ServicesProvider, type Services } from '../../../services/context';
import { createTargetEditsService } from '../../../services/goals/targetEdits';
import { closeHarnesses, openHarness, until, untilShown } from '../../../test/screenHarness';
import { ToastProvider } from '../../../ui/Toast';
import { NUTRIENT_GROUPS, NutrientGoalsSheet } from './NutrientGoalsSheet';

afterEach(closeHarnesses);

const words = goals.goals.nutrients;

/** The sheet over real settings and the real target edits service, with `stored` goals. */
async function showSheet(stored: Partial<GoalValues> = {}) {
  const h = await openHarness({ hash: '#/settings/goals' });
  const { profileRepo, settingsRepo } = h.repos;
  await settingsRepo.set('goals.nutrients', { ...DEFAULT_GOAL_VALUES, ...stored });
  const tuneUp = {
    turnOn: async () => ({ kind: 'unchanged', why: 'off' }) as const,
    turnOff: async () => ({ restored: false }),
  };
  const targetEdits = createTargetEditsService({
    profileRepo,
    settingsRepo,
    tuneUp,
    clock: h.clock,
  });
  const saveGoal = vi.spyOn(targetEdits, 'setNutrientGoal');
  const services: Services = { ...h.services, targetEdits };
  render(
    <ServicesProvider services={services}>
      <DataProvider sources={h.sources}>
        <ToastProvider>
          <RouterProvider router={h.router}>
            <NutrientGoalsSheet open onClose={() => undefined} />
          </RouterProvider>
        </ToastProvider>
      </DataProvider>
    </ServicesProvider>,
  );
  await untilShown('[data-ui="goals.nutrients.row.sodium"]');
  const goalsNow = () => settingsRepo.get('goals.nutrients');
  return { ...h, saveGoal, goalsNow, user: userEvent.setup() };
}

const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} `) });
const editor = (name: string) => screen.getByRole('dialog', { name });
const wheel = () => screen.getByRole('combobox');
const field = () => screen.getByRole('textbox');
const save = (name: string) =>
  within(editor(name)).getByRole('button', { name: common.common.save });
const editorGone = () => until(() => document.querySelector('[data-ui="goals.nutrient"]') === null);

describe('NutrientGoalsSheet: the list', () => {
  it('lists the 29 goals in four groups, each with its kind and unit; vitamin D also in IU', async () => {
    await showSheet();

    expect(screen.getAllByRole('region')).toHaveLength(4);
    expect(screen.getByRole('region', { name: words.group.sugarsAndFats })).toBeVisible();
    expect(screen.getByRole('region', { name: words.group.minerals })).toBeVisible();
    expect(screen.getByRole('region', { name: words.group.vitamins })).toBeVisible();
    expect(screen.getByRole('region', { name: words.group.sports })).toBeVisible();
    expect(document.querySelectorAll('[data-ui^="goals.nutrients.row."]')).toHaveLength(29);

    expect(row('Sodium')).toHaveAccessibleName('Sodium Limit 2,300 mg');
    expect(row('Fibre')).toHaveAccessibleName('Fibre Target 30 g');
    expect(row('Vitamin D')).toHaveAccessibleName('Vitamin D Target 20 mcg 800 IU');
    expect(row('Creatine')).toHaveAccessibleName('Creatine Target 0 g');
  });

  it('holds every goal key in exactly one group', () => {
    const listed = NUTRIENT_GROUPS.flatMap(({ keys }) => keys);
    expect(listed).toHaveLength(GOAL_KEYS.length);
    expect(new Set(listed)).toEqual(new Set(GOAL_KEYS));
  });
});

describe('NutrientGoalsSheet: the editor', () => {
  it('opens sodium on a 0–5 000 wheel in steps of 50, at the stored goal', async () => {
    const { user } = await showSheet();

    await user.click(row('Sodium'));

    expect(editor('Sodium')).toHaveTextContent(words.kindLine.limit);
    const options = Array.from(wheel().querySelectorAll('option'), (option) => option.value);
    expect([options[0], options[1], options.at(-1), options.length]).toEqual([
      '0',
      '50',
      '5000',
      101,
    ]);
    expect((wheel() as HTMLSelectElement).value).toBe('2300');
  });

  it('keeps a typed sodium goal of 2 345 exactly and reopens it in typing mode (ACC-C10-1)', async () => {
    const { user, goalsNow } = await showSheet();

    await user.click(row('Sodium'));
    await user.click(screen.getByRole('button', { name: words.editor.typeAmount }));
    expect(field()).toHaveValue('2300');
    await user.clear(field());
    await user.type(field(), '2345');
    await user.click(save('Sodium'));
    await editorGone();

    expect((await goalsNow()).sodium).toBe(2_345);
    await until(() => row('Sodium').textContent?.includes('2,345 mg') === true);

    // 2 345 is not on the wheel, so the editor opens on the typed value.
    await user.click(row('Sodium'));
    expect(field()).toHaveValue('2345');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('opens calcium at 3 000 in typing mode with the upper-limit line; 2 000 has none', async () => {
    const { user } = await showSheet({ calcium: 3_000 });

    await user.click(row('Calcium'));

    expect(field()).toHaveValue('3000');
    const upper = words.editor.upper.replace('{limit}', '2,500 mg');
    expect(editor('Calcium')).toHaveTextContent(upper);

    await user.click(screen.getByRole('button', { name: words.editor.useWheel }));
    expect((wheel() as HTMLSelectElement).value).toBe('2000');
    expect(document.querySelector('[data-ui="goals.nutrient.upper"]')).toBeNull();
  });

  it('shows vitamin D 20 mcg as 800 IU on the wheel, following the wheel', async () => {
    const { user } = await showSheet();

    await user.click(row('Vitamin D'));

    expect((wheel() as HTMLSelectElement).value).toBe('20');
    const iu = () => document.querySelector('[data-ui="goals.nutrient.iu"]');
    expect(iu()).toHaveTextContent('800 IU');
    await user.selectOptions(wheel(), '25');
    expect(iu()).toHaveTextContent('1,000 IU');
  });

  it('stops typing at seven digits and saves anything over 999 999 as 999 999', async () => {
    const { user, goalsNow } = await showSheet();

    await user.click(row('Potassium'));
    await user.click(screen.getByRole('button', { name: words.editor.typeAmount }));
    await user.clear(field());
    await user.type(field(), '12345678');

    expect(field()).toHaveValue('1234567');
    expect(field()).toHaveAccessibleDescription(
      expect.stringContaining(words.editor.tooLarge.replaceAll('{max}', '999,999')),
    );
    await user.click(save('Potassium'));
    await editorGone();

    expect((await goalsNow()).potassium).toBe(999_999);
  });

  it('keeps digits only and cannot save an empty field', async () => {
    const { user } = await showSheet();

    await user.click(row('Zinc'));
    await user.click(screen.getByRole('button', { name: words.editor.typeAmount }));
    await user.clear(field());

    expect(save('Zinc')).toBeDisabled();
    expect(field()).toHaveAccessibleDescription(expect.stringContaining(words.editor.empty));

    await user.type(field(), 'a1b,2 ');
    expect(field()).toHaveValue('12');
    expect(save('Zinc')).toBeEnabled();
  });

  it('saves nothing for an editor left as it opened, so a stored fraction stays', async () => {
    const { user, saveGoal, goalsNow } = await showSheet({ vitaminC: 17.5 });

    expect(row('Vitamin C')).toHaveAccessibleName('Vitamin C Target 17.5 mg');
    await user.click(row('Vitamin C'));
    expect(field()).toHaveValue('17.5');
    await user.click(save('Vitamin C'));
    await editorGone();

    expect(saveGoal).not.toHaveBeenCalled();
    expect((await goalsNow()).vitaminC).toBe(17.5);
  });
});
