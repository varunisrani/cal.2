// Meal names as every screen shows them (diary sections, the manual sheet's meal picker).

import type { MealKind } from '../../domain/model';
import type { TxKey } from '../home/text';

/** Each meal's name in the catalogue. */
export const MEAL_NAME_KEYS: Readonly<Record<MealKind, TxKey>> = {
  breakfast: 'log.meal.breakfast',
  lunch: 'log.meal.lunch',
  dinner: 'log.meal.dinner',
  snack: 'log.meal.snack',
  other: 'log.meal.other',
};
