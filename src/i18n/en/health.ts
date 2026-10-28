import type { MessageTree } from '../catalogue';

/**
 * Words of Health Connect on the Android app (P11-04): Settings › Health Connect
 * (src/features/settings/health), Home's activity card (src/features/home) and Progress's
 * activity card (src/features/progress); Home's budget line is `healthBudget`. Energy amounts come
 * in already written with their unit (`home.energy`); the web app never shows any of these.
 */
export const health = {
  health: {
    page: {
      title: 'Health Connect',
      unavailable:
        "Health Connect settings can't be shown right now. Reload the page to try again.",
    },
    status: {
      heading: 'Connection',
      checking: 'Checking Health Connect…',
      notInstalled: 'Health Connect is not installed on this phone.',
      updateRequired: 'Health Connect needs an update before Platewise can use it.',
      notSupported: 'This phone does not support Health Connect.',
      notConnected: 'Not connected. Connect to see your steps, burned calories and workouts here.',
      connected: 'Connected. Platewise reads the last 30 days.',
      revoked: 'Access was removed in Health Connect, so nothing is read.',
      refused: 'No access was given, so nothing is read.',
      failed: "Health Connect didn't answer. Please try again.",
      connect: 'Connect',
      grant: 'Grant access',
      disconnect: 'Disconnect',
      disconnectNote: 'Disconnect stops reading. To remove access, open Health Connect.',
      open: 'Open Health Connect',
    },
    data: {
      heading: 'Data',
      allowed: 'Allowed',
      notAllowed: 'Not allowed',
      read: {
        steps: 'Steps',
        activeCalories: 'Active calories',
        totalCalories: 'Total calories',
        distance: 'Distance',
        exercise: 'Workouts',
        weight: 'Weight',
        heartRate: 'Heart rate',
      },
      write: {
        nutrition: 'Meals sent',
        weight: 'Weigh-ins sent',
        walk: 'Walks sent',
      },
    },
    options: {
      heading: 'Options',
      count: 'Count active calories',
      countHint:
        "Adds the day's active calories to your calorie target on Home. Your goal stays as it is.",
      // P15: before Health Connect is connected, the switch counts the walks recorded here.
      countWalksHint:
        "Adds the active calories of the day's recorded walks to your calorie target on Home. Your goal stays as it is.",
      importWeights: 'Import weigh-ins',
      importWeightsHint: 'Adds weigh-ins from other apps to your weight history.',
      writeBack: 'Send meals, weigh-ins and walks',
      writeBackHint: 'Writes what you log in Platewise to Health Connect.',
      writeRefused: 'No write access was given, so nothing is sent.',
      saveFailed: "That change wasn't saved. Please try again.",
    },
    sync: {
      heading: 'Sync',
      last: 'Last synced {day}, {time}',
      never: 'Not synced yet',
      now: 'Sync now',
      failed: "The last sync didn't finish. Your diary is not affected.",
    },
    home: {
      title: 'Activity',
      steps: '{count, plural, one {# step} other {# steps}}',
      active: '{amount} active',
      total: '{amount} total',
      // Distance follows the length unit: km beside cm, miles beside feet and inches.
      distance: {
        km: '{amount} km',
        mi: '{amount} mi',
      },
      // The distance's accessible name, with the unit spelled out.
      distanceName: {
        km: 'Distance {amount} kilometres',
        mi: 'Distance {amount} miles',
      },
      workouts: 'Workouts',
      workout: '{name}, {length}',
      workoutEnergy: '{name}, {length}, {amount}',
      empty: 'No Health Connect data for this day.',
      type: {
        running: 'Running',
        walking: 'Walking',
        cycling: 'Cycling',
        swimming: 'Swimming',
        strength: 'Strength training',
        other: 'Workout',
      },
    },
    progress: {
      title: 'Activity',
      days: 'Days shown',
      week: '7 days',
      month: '30 days',
      steps: 'Steps',
      stepsChart: 'Steps chart',
      active: 'Active calories',
      activeChart: 'Active calories chart',
      // Shown, never counted (D-16.89).
      total: 'Total calories',
      totalChart: 'Total calories chart',
      // In km beside centimetres, miles beside feet and inches, as on Home.
      distance: 'Distance',
      distanceChart: 'Distance chart',
      average: 'Avg {amount}',
      empty: 'No Health Connect data for these days.',
    },
  },
} as const satisfies MessageTree;
