import type { MessageTree } from '../catalogue';

/**
 * Words of the diary file (src/features/settings/data, src/services/transfer): the export sheet,
 * the Markdown file it writes, and the import sheet with its preview and refusals (P09-10,
 * P09-11).
 */
export const transfer = {
  transfer: {
    export: {
      title: 'Export diary',
      intro: 'Save your diary as a file. Energy is always written in kcal.',
      range: {
        label: 'Days',
        today: 'Today',
        week: 'This week',
        month: 'This month',
        all: 'All time',
        custom: 'Custom',
      },
      from: 'From',
      to: 'To',
      format: {
        label: 'File type',
        json: 'JSON',
        markdown: 'Markdown',
        csv: 'CSV',
      },
      formatHint: {
        json: 'For importing back into Platewise.',
        markdown: 'Easy to read, with a table for each meal.',
        csv: 'For spreadsheets: one row per food and water log.',
      },
      action: 'Export',
      empty: 'Nothing is logged on these days, so there is nothing to export.',
      failed: "The file couldn't be made. Please try again.",
      downloaded: 'Diary file saved to your downloads.',
    },
    markdown: {
      title: 'Platewise diary',
      range: 'Days {start} to {end}',
      madeWith: 'Exported from Platewise.',
      kcalNote: 'Energy in this file is in kcal, as Platewise stores it. 1 kcal is 4.184 kJ.',
      energy: 'Energy: {eaten} of {target} kcal, {left} left',
      macro: '{name}: {eaten} of {target} g',
      water: 'Water: {total} ml',
      waterLogs: 'Water logs: {logs}',
      waterLog: '{time} {ml} ml',
      column: {
        time: 'Time',
        food: 'Food',
        weight: 'Weight',
        kcal: 'kcal',
        protein: 'Protein (g)',
        carbs: 'Carbs (g)',
        fat: 'Fat (g)',
        nutrients: 'Other nutrients',
        parts: 'Parts',
        source: 'Source',
        note: 'Note',
      },
      source: {
        manual: 'Entered',
        ai: 'Estimated',
      },
    },
    import: {
      title: 'Import diary',
      intro: 'Pick a diary file exported from Platewise as JSON.',
      choose: 'Choose file',
      chooseAnother: 'Choose another file',
      reading: 'Reading the file…',
      foods: 'Foods',
      water: 'Water logs',
      days: 'Days',
      explain:
        'Replace these dates makes those days match the file: foods already there that match one in the file keep their photos, and the rest of those days is cleared. Add as new keeps your diary and adds everything in the file.',
      replace: 'Replace these dates',
      add: 'Add as new',
      done: '{foods, plural, one {# food} other {# foods}} and {water, plural, one {# water log} other {# water logs}} imported.',
      failed: 'Nothing was imported. Please try again.',
      problem: {
        tooLarge: 'This file is larger than 20 MB, so it was not opened.',
        unreadable: "This file couldn't be read.",
        notDiary: "This isn't a Platewise diary file.",
        version: 'This diary file was made by a newer Platewise and cannot be imported here.',
        empty: 'This file has no foods or water logs to import.',
        date: 'This file has a date that cannot be used: {detail}. Nothing was imported.',
        meal: 'This file has an unknown meal: {detail}. Nothing was imported.',
        food: 'This file has a food with a missing or invalid value: {detail}. Nothing was imported.',
        water:
          'This file has a water log with a missing or invalid value on {detail}. Nothing was imported.',
        time: 'This file has a time that does not exist on that day: {detail}. Nothing was imported.',
      },
    },
  },
} as const satisfies MessageTree;
