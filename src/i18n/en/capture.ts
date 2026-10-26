import type { MessageTree } from '../catalogue';

/**
 * Words of the meal-photos sheet (src/features/log/capture): the count, the cards, the pickers,
 * the "plate built in steps" switch, the note, and why a pick was cut short or refused. The
 * analysis overlay (P06-04) adds its words here.
 */
export const capture = {
  capture: {
    title: 'Meal photos',
    analyse: 'Analyse',
    count: '{count} of 10 photos',
    photo: 'Photo {number}',
    remove: 'Remove photo {number}',
    addPhoto: 'Add photo',
    addPhotos: 'Add photos',
    adding: 'Saving photos…',
    steps: {
      label: 'Plate built in steps',
      description: 'For photos of one plate taken as each part was added.',
      about: 'About plate built in steps',
      aboutBody:
        'Use it for one plate photographed again each time something went onto it, for example on a kitchen scale. Each new food is worked out from what changed since the photo before, so keep the photos in the order you took them and the scale’s number readable. A finished meal seen from several sides does not need it.',
      gotIt: 'Got it',
    },
    note: {
      label: 'Note for the analysis (optional)',
      placeholder: 'For example: about 200 g of rice, no butter on the bread',
    },
    leftOut:
      'A meal takes up to 10 photos, so {count, plural, one {# photo was} other {# photos were}} left out.',
    refused: {
      tooLarge: 'One of these photos is over 25 MB, so none of them were added.',
      unreadable: "One of these photos couldn't be read, so none of them were added.",
      unsupportedImage:
        "This browser can't open one of these photos (HEIC photos open in Safari), so none of them were added.",
      storageFailed: "These photos couldn't be saved on this device, so none of them were added.",
    },
    loadFailed: "The saved photos couldn't be loaded. Add them again.",
  },
} as const satisfies MessageTree;
