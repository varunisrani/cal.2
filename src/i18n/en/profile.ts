import type { MessageTree } from '../catalogue';

/**
 * Words of Settings › Personal info (src/features/settings/profile, P05-10): the rows, their
 * values and the editors they open. Sex, activity and pace names are the wizard's own words
 * (`onboarding.*`), so both places always say the same.
 */
export const profile = {
  profile: {
    title: 'Personal info',
    planNote:
      'Changing these never changes your daily targets. When the inputs of your plan change, Goals offers to rebuild it.',
    missing: 'Finish setting up Platewise and your details will show here.',
    unreadable: 'Your details could not be read, so they cannot be changed here.',
    saveFailed: "That change wasn't saved. Please try again.",
    groups: {
      body: 'Body',
      goal: 'Goal',
      food: 'Food',
    },
    rows: {
      sex: 'Sex',
      birthday: 'Birthday',
      height: 'Height',
      weight: 'Weight',
      bodyFat: 'Body fat',
      goalBodyFat: 'Goal body fat',
      activity: 'Activity',
      goal: 'Goal',
      pace: 'Weekly pace',
      goalWeight: 'Goal weight',
      allergens: 'Allergen sensitivities',
    },
    /** A row's accessible name: the field, then its value. */
    rowName: '{name}: {value}',
    value: {
      notSet: 'Not set',
      none: 'None',
      birthday: '{date} ({age, plural, one {# year old} other {# years old}})',
      cm: '{value} cm',
      ftIn: '{feet} ft {inches} in',
      kg: '{value} kg',
      percent: '{value} %',
      paceKg: '{amount} kg a week',
    },
    goal: {
      lose: 'Lose weight',
      maintain: 'Maintain weight',
      gain: 'Gain weight',
    },
    birthday: {
      label: 'Date of birth',
      age: '{age, plural, one {That makes you # year old.} other {That makes you # years old.}}',
    },
    units: {
      height: 'Height unit',
      cm: 'cm',
      ftIn: 'ft and in',
    },
    weight: {
      addsWeighIn: 'Saving logs this as a weigh-in for today.',
      current: 'You weigh {weight} now.',
      notBelowCurrent: 'To lose weight, the goal has to be below {weight}. Nothing was saved.',
      notAboveCurrent: 'To gain weight, the goal has to be above {weight}. Nothing was saved.',
    },
    bodyFat: {
      wheel: 'Body fat percentage',
      goalWheel: 'Goal body fat percentage',
      current: 'Your body fat is {value} now.',
      goalNote: 'The goal shows on Progress. It does not change your plan.',
      remove: 'Remove body fat',
      removeNote: 'Removing it also removes your body fat goal.',
      removeGoal: 'Remove the goal',
    },
    allergens: {
      intro: 'List what you react to. Food you log is checked against these names.',
      field: 'Add a sensitivity',
      empty: 'Nothing listed yet.',
      listLabel: 'Your sensitivities',
      remove: 'Remove {name}',
      duplicate: '{name} is already on the list.',
    },
  },
} as const satisfies MessageTree;
