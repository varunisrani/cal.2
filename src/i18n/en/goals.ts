import type { MessageTree } from '../catalogue';

/**
 * Words of the goal features (src/features/goals, src/features/settings/goals): the dialog shown
 * when a weigh-in reaches the goal weight (P05-14, D-16.13), the Settings page of targets, plan
 * and alerts (P05-11) and the optional nutrient goals sheet (P05-12).
 */
export const goals = {
  goals: {
    reached: {
      title: 'You reached your goal weight',
      message:
        'You weighed in at {weight}, right where you were aiming. Set a new goal to give your plan its next direction, or keep this one for now.',
      messageNoWeight:
        'Your latest weigh-in is right where you were aiming. Set a new goal to give your plan its next direction, or keep this one for now.',
      setNewGoal: 'Set a new goal',
      dismiss: 'Dismiss',
      weight: {
        kg: '{amount} kg',
      },
    },
    page: {
      title: 'Goals and nutrition',
      unavailable:
        "Your targets can't be shown right now. Once your profile is set up and readable they appear here.",
      ok: 'OK',
      saveFailed: "That change couldn't be saved. Please try again.",
      amount: {
        kcal: '{amount} kcal',
        kJ: '{amount} kJ',
        g: '{amount} g',
      },
      unit: {
        kcal: 'kcal',
        kJ: 'kJ',
        g: 'g',
      },
      targets: {
        heading: 'Daily targets',
        label: {
          kcal: 'Calories',
          kJ: 'Kilojoules',
          protein: 'Protein',
          carbs: 'Carbs',
          fat: 'Fat',
        },
        locked: 'Locked',
        auto: 'Auto',
        howLocks:
          'A value you set stays locked while the others shift to fit it. Calories and up to two of the macros can be locked at once.',
        tuneUpOwns:
          'The weekly tune-up sets these numbers for you. Switch it off below to pick and lock your own.',
      },
      edit: {
        title: {
          kcal: 'Daily calories',
          kJ: 'Daily kilojoules',
          protein: 'Daily protein',
          carbs: 'Daily carbs',
          fat: 'Daily fat',
        },
        reset: 'Reset to auto',
        refusedTitle: 'Nothing can make room for this',
        refused:
          'Calories and both other macros are locked, so no value is free to shift. Reset one of them to auto, then make this change again.',
        tuneUpTitle: 'The tune-up sets your targets',
        tuneUp:
          'While the weekly tune-up is on it works these numbers out again every week, so a change of yours would not last. Switch it off to set your own targets and lock them.',
      },
      maintenance: {
        label: 'Maintenance estimate',
        under: 'Your target is {amount} a day below it',
        over: 'Your target is {amount} a day above it',
        close: 'Your target is close to it',
        infoTitle: 'Maintenance estimate',
        info: 'A rough figure for what you burn on an ordinary day, worked out with standard equations from your age, sex, height, weight and activity level. Nothing measured it, so your real burn may sit some way above or below. The line under it compares your daily target with this figure, and gaps of less than {band} count as close.',
      },
      plan: {
        heading: 'Your plan',
        rebuild: 'Rebuild plan',
        rebuildHint: 'Ask your AI for a fresh plan from your profile and logs',
        nudge: 'Inputs changed — rebuild',
        rebuilding: 'Rebuilding your plan…',
        rebuiltTitle: 'Plan rebuilt',
        rebuilt: 'Your new daily target is {amount}.',
        failedTitle: "Couldn't rebuild your plan",
        failed:
          'No usable plan came back from your AI provider, so your goals stay as they were. Check AI settings, then try again.',
        droppedTitle: 'Plan left as it was',
        dropped:
          'Your profile changed while the new plan was being worked out, so it was set aside. Rebuild again to use your latest details.',
        tuneUp: 'Weekly tune-up',
        tuneUpHint: 'Adjusts your targets once a week from your logs and weigh-ins',
        tuneUpInfoLabel: 'About the weekly tune-up',
        tuneUpInfo:
          'Once a week, when you open Platewise, your AI goes over your recent logging and weigh-ins and adjusts your daily targets. Your goal stays the same; only the numbers move. While it is on, it owns your targets. Switching it off brings back the plan you had before its first change, and lets you set targets yourself.',
        checking: 'Checking your plan…',
        tunedTitle: 'Plan tuned up',
        tuned: 'Your daily target is now {amount}, worked out from your latest logs and weigh-ins.',
        unchangedTitle: 'Weekly tune-up is on',
        unchanged:
          'Your plan stays as it is for now. Each week the tune-up looks again and changes the numbers once your logs and weigh-ins show a reason to.',
        tuneDropped:
          'Your profile changed during the check, so nothing was applied. The tune-up looks again next week.',
        tuneFailedTitle: "Couldn't reach your AI",
        tuneFailed:
          'Your goals stay as they were, and the tune-up will look again next week. Check AI settings in the meantime.',
        restored: 'Your plan from before the tune-up is back.',
        nutrients: 'Nutrient goals',
        nutrientsSummary: 'Fibre {fibre} · Sodium {sodium}',
      },
      alerts: {
        heading: 'Alerts',
        goalReached: 'Goal weight reached',
        goalReachedHint: 'Send a notification when a weigh-in reaches your goal weight',
      },
    },
    nutrients: {
      title: 'Nutrient goals',
      intro:
        'Daily goals beyond calories and macros. A limit is an amount to stay under; a target is an amount to reach.',
      group: {
        sugarsAndFats: 'Sugars, fibre and fats',
        minerals: 'Minerals',
        vitamins: 'Vitamins',
        sports: 'Caffeine and sports compounds',
      },
      kind: {
        limit: 'Limit',
        target: 'Target',
      },
      kindLine: {
        limit: 'A daily limit to stay under',
        target: 'A daily amount to reach',
      },
      amount: {
        g: '{amount} g',
        mg: '{amount} mg',
        mcg: '{amount} mcg',
      },
      unit: {
        g: 'g',
        mg: 'mg',
        mcg: 'mcg',
      },
      iu: '{amount} IU',
      // In the model's order: grams, milligrams, micrograms, then the sports compounds.
      name: {
        addedSugar: 'Added sugar',
        fibre: 'Fibre',
        omega3: 'Omega-3',
        saturatedFat: 'Saturated fat',
        sugar: 'Sugar',
        transFat: 'Trans fat',
        caffeine: 'Caffeine',
        calcium: 'Calcium',
        cholesterol: 'Cholesterol',
        iron: 'Iron',
        magnesium: 'Magnesium',
        potassium: 'Potassium',
        sodium: 'Sodium',
        vitaminC: 'Vitamin C',
        vitaminE: 'Vitamin E',
        zinc: 'Zinc',
        folate: 'Folate',
        vitaminA: 'Vitamin A',
        vitaminB12: 'Vitamin B12',
        vitaminD: 'Vitamin D',
        vitaminK: 'Vitamin K',
        arginine: 'L-arginine',
        betaAlanine: 'Beta-alanine',
        betaine: 'Betaine',
        carnitine: 'L-carnitine',
        citrulline: 'L-citrulline',
        creatine: 'Creatine',
        hmb: 'HMB',
        taurine: 'Taurine',
      },
      editor: {
        typeAmount: 'Type an amount',
        useWheel: 'Use the wheel',
        empty: 'Type the amount in whole numbers, digits only.',
        tooLarge: 'Goals stop at {max}, so this one will be saved as {max}.',
        upper:
          'More than the {limit} most adults should stay under. Only aim this high if a doctor or dietitian advised it.',
      },
    },
  },
} as const satisfies MessageTree;
