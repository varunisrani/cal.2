import type { MessageTree } from '../catalogue';

/**
 * Words of Health Connect on the Android app (P11-04): Settings › Health Connect
 * (src/features/settings/health), Home's activity card and budget line (src/features/home) and
 * Progress's activity card (src/features/progress). Energy amounts come in already written with
 * their unit (`home.energy`); the web app never shows any of these.
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
      },
      write: {
        nutrition: 'Meals sent',
        weight: 'Weigh-ins sent',
      },
    },
    options: {
      heading: 'Options',
      count: 'Count active calories',
      countHint:
        "Adds the day's active calories to your calorie target on Home. Your goal stays as it is.",
      importWeights: 'Import weigh-ins',
      importWeightsHint: 'Adds weigh-ins from other apps to your weight history.',
      writeBack: 'Send meals and weigh-ins',
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
      budget: '{goal} goal + {burned} burned',
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
      average: 'Avg {amount}',
      empty: 'No Health Connect data for these days.',
    },
  },
} as const satisfies MessageTree;
