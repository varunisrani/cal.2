import type { MessageTree } from '../catalogue';

/**
 * Words of the Settings hub (src/features/settings). The back link on category pages uses the
 * tab's own name (`common.tabs.settings`). Later phases add their category titles under
 * `settings.category`. `menuEditor` is Settings › Add menu (P09-05); method and group names come
 * from the menu's own words (`menu.method`, `menu.group`).
 */
export const settings = {
  settings: {
    group: {
      prefs: 'Preferences',
      info: 'About',
    },
    empty: 'Nothing to set up here yet. Your preferences will appear in this list.',
    menuEditor: {
      title: 'Add menu',
      food: 'Food',
      groups: 'Groups',
      groupsNote:
        'Each group is a page of the + menu, up to three. With none, every method sits on the menu itself.',
      name: 'Name',
      emptyGroup: 'No methods yet. An empty group stays off the menu.',
      moveUp: 'Move {name} up',
      moveDown: 'Move {name} down',
      remove: 'Remove {name}',
      addMethod: 'Add method',
      loose: 'Straight on the menu',
      looseNote: 'One tap from +, under any groups.',
      hidden: 'Hidden methods',
      restore: 'Put {name} back',
      reset: 'Reset to default',
      footer: 'Water and fasting keep their own rows under the food, whatever you set here.',
    },
  },
} as const satisfies MessageTree;
