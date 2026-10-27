import type { MessageTree } from '../catalogue';

/**
 * Words of the About pages (src/features/about): the calculation methods page (P05-13), shown in
 * Settings and from Plan ready. Its numbers are params filled from the domain, never typed here;
 * the activity level names come from the onboarding words (`onboarding.activity.levels`). `page`
 * is About Platewise and `credits` the licences and credits page (P09-16); the name of the app
 * that inspired Platewise is a param, filled at build time, never typed here.
 */
export const about = {
  about: {
    methods: {
      title: 'How your plan is calculated',
      intro:
        'Your plan starts from well-known equations for the energy a body uses. If you set up an AI, it starts from the same equations and may fine-tune them with your own logs and weigh-ins. Every number on this page is the one Platewise itself works with.',
      resting: {
        heading: 'Resting energy',
        lead: 'Resting energy, or basal metabolic rate, is roughly what your body would burn in a day of complete rest. Platewise picks one of two equations for it.',
        mifflinName: 'Mifflin-St Jeor equation',
        mifflinWhen:
          'Used unless you have entered your body fat. It needs your weight, height, age and sex.',
        mifflinMale: 'Male: {perKg} × kg + {perCm} × cm − {perYear} × years + {constant}',
        mifflinOther:
          'Female or other: {perKg} × kg + {perCm} × cm − {perYear} × years − {constant}',
        katchName: 'Katch-McArdle equation',
        katchWhen:
          'Used once you enter your body fat, since it starts from lean mass instead of total weight.',
        katchFormula: '{base} + {perKg} × lean mass in kg',
        leanMass: 'Lean mass = weight × (1 − body fat share)',
      },
      daily: {
        heading: 'Energy for a whole day',
        lead: 'Your daily burn is your resting energy multiplied by a factor for your activity level. The same level decides how much protein the plan starts with.',
        level: 'Level',
        factor: 'Factor',
        protein: 'Protein',
        factorValue: '× {factor}',
        proteinValue: '{rate} g per kg',
      },
      pace: {
        heading: 'Losing or gaining weight',
        perWeight:
          'Platewise counts {perKg} kcal for every kilogram you lose or gain, which is about {perLb} kcal for every pound.',
        rule: 'Your weekly pace in kg times {perKg}, divided by 7, comes off your daily burn when you want to lose and is added to it when you want to gain. Keeping your weight changes nothing.',
        example: '{weekly} kg a week: {perDay} kcal a day',
        kilojoules: 'All of this runs in kilocalories. One kcal is {kj} kJ.',
      },
      macros: {
        heading: 'Protein, fat and carbs',
        protein:
          'Protein: {low} to {high} g per kg of body weight depending on activity, plus {extra} g per kg while you lose weight. It counts your full weight, even when your body fat is known.',
        fat: 'Fat: {perKg} g per kg of body weight.',
        carbs:
          'Carbs: the energy left after protein and fat, at {carbs} kcal per gram. Protein also gives {protein} kcal per gram and fat {fat}.',
        rounding: 'Each amount is cut down to a whole number, never rounded up.',
      },
      meals: {
        heading: 'Values of what you log',
        body: 'The energy and nutrients of a meal you photograph or describe are estimates made by your AI. They can be off, most of all for mixed dishes and portions that are hard to see, so check the label of foods you eat often. Numbers you type in yourself are kept as they are.',
      },
      ai: {
        heading: 'What your AI sees',
        sentLead:
          'When your AI builds or tunes your plan, Platewise sends it numbers and dates only:',
        sentProfile:
          'your sex, age, height, weight, body fat, activity level, goal, pace and goal weight',
        sentDays: 'daily totals of energy, protein, carbs, fat and fibre, each with its date',
        sentReadings: 'your weigh-ins and body fat readings, each with its date',
        sentTargets: 'the equations on this page and your current targets',
        neverLead: 'It never receives:',
        neverNames: 'the names of foods',
        neverNotes: 'your notes',
        neverPhotos: 'photos',
        neverIngredients: 'ingredient lists',
      },
      sources: {
        heading: 'Sources',
        mifflin: {
          who: 'Mifflin, St Jeor and colleagues',
          where: 'American Journal of Clinical Nutrition, 1990, volume 51, pages 241–247',
          what: 'A new predictive equation for resting energy expenditure in healthy individuals',
        },
        katch: {
          who: 'McArdle, Katch and Katch',
          where: 'Textbook, Lippincott Williams & Wilkins, several editions',
          what: 'Exercise Physiology: Nutrition, Energy, and Human Performance',
        },
        energy: {
          who: 'FAO, WHO and UNU',
          where: 'Food and Nutrition Technical Report Series 1, Rome, 2004',
          what: 'Human energy requirements: report of a joint expert consultation',
        },
        pound: {
          who: 'Wishnofsky',
          where: 'American Journal of Clinical Nutrition, 1958, volume 6, pages 542–546',
          what: 'Caloric equivalents of gained or lost weight',
        },
        imbalance: {
          who: 'Hall and colleagues',
          where: 'The Lancet, 2011, volume 378, pages 826–837',
          what: 'Quantification of the effect of energy imbalance on bodyweight',
        },
        protein: {
          who: 'Morton and colleagues',
          where: 'British Journal of Sports Medicine, 2018, volume 52, pages 376–384',
          what: 'A meta-analysis of protein intake and the muscle gained with resistance training',
        },
        reference: {
          who: 'Institute of Medicine',
          where: 'The National Academies Press, Washington, DC, 2005',
          what: 'Dietary Reference Intakes for energy and the macronutrients',
        },
      },
      advice: {
        heading: 'This is not medical advice',
        body: 'Platewise estimates; it does not measure. Equations like these usually land within about 10% of a person’s real resting energy, and some people sit further off. Talk to a doctor or a registered dietitian before a big change in how you eat, above all if you are pregnant or breastfeeding, under 18, managing a medical condition, or have had an eating disorder.',
      },
    },
    page: {
      title: 'About Platewise',
      version: 'Version {version}',
      updates: {
        heading: 'Updates',
        current: 'Up to date',
        currentHint: 'No newer version is waiting.',
        ready: 'Update ready',
        readyHint: 'Reload to start the new version. Finish anything you are typing first.',
        reload: 'Reload',
        changelog: 'What’s changed',
      },
      help: {
        heading: 'Help',
        help: 'Help and feedback',
        contact: 'Contact',
        source: 'Source code',
      },
      more: {
        heading: 'More',
      },
      share: {
        label: 'Share Platewise',
        text: 'Platewise tracks calories and nutrients with your own AI key and keeps your diary on your device.',
        copied: 'Link copied',
        failed: 'Sharing and copying both failed. The address is {url}',
      },
      inspired: 'Inspired by {name}',
    },
    credits: {
      title: 'Licences and credits',
      inspiration: {
        heading: 'Inspiration',
        body: 'The features and flows of Platewise are inspired by {name}, an open-source app. Platewise is a separate product, written from scratch for the web: none of its code, words or artwork comes from {name}.',
        visit: 'Visit {name}',
        notice: 'Licence notice of {name}',
      },
      packages: {
        heading: 'Open-source packages',
        intro:
          'Platewise is built with these packages. Each one comes under its own licence; open a package to read it.',
        version: 'Version {version}',
        license: 'Licence: {license}',
        homepage: 'Project page of {name}',
        noText: 'This package ships no licence text of its own.',
      },
    },
  },
} as const satisfies MessageTree;
