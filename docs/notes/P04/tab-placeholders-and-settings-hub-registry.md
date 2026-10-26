# Task: Tab placeholders and settings hub registry (P04-13) · Phase: 04 · Owner: builder (wt-p04s5, slice S5)

Read (reference @ `10e14b67`): `A/ui/settings/SettingsScreen.kt` lines 2185–2365 (the hub: two
cards of category rows, each row an icon bubble, a title and a chevron; the category header with a
back link labelled with the Settings tab's name above a large title) and the category list near
line 291 (only to see that categories carry a title, an icon and a group), `T/ui/settings/SettingsCategoryTest.kt`
(the hub keeps every category, titles are distinct, two groups). Research spec
`06-settings-data.md` §3.1 (hub and navigation), `05-home-progress.md` §3.1.1 (re-tapping Settings
returns to the hub, handled by the router). Acceptance id ACC-J1-1.

What it does (own words): Progress and Coach show a titled placeholder page until P07 and P08
build them. The Settings tab shows a hub built from a registry: each category is one record (id,
title key, icon, route, group `prefs` or `info`, and the page to show). The hub lists the
categories in registry order, the preferences group first and the information group second, each
group as one card of rows (icon, title, chevron); a row opens its category's page at
`#/settings/<id>`. Every category page has a back link labelled "Settings" above its title; it
goes back up to the hub (stepping back over the nested page, so the browser history stays short).
An address naming no registered category goes to the hub. Later phases add their categories to the
registry, one task per phase owning that edit (P05-10, P07-06, P09-01); P04 registers none, so the
hub shows a short note until they arrive.

Inputs → outputs: the route's nested segments (from `Screen`), the registry → the hub or a category
page; `router.navigate` for the rows and the back link.

Files: created `src/features/progress/ProgressPage.tsx`, `src/features/progress/progress.module.css`,
`src/features/coach/CoachPage.tsx`, `src/features/coach/coach.module.css`,
`src/features/settings/SettingsHub.tsx`, `SettingsHub.test.tsx`, `registry.ts`, `registry.test.ts`,
`SettingsScreen.tsx` (hub or category page for the route), `CategoryFrame.tsx` (back link, title,
page), `settings.module.css`, `src/i18n/en/settings.ts`. Shared: `src/app/Screen.tsx`.

Edge cases / failure modes:
- Registry empty → the hub shows the note card, no empty group cards.
- A group with no categories → no card for it.
- Two categories with one id, or an id that is not a valid page segment → `defineCategories`
  throws (a programming error caught by the registry test).
- `#/settings/unknown` → replaced by `#/settings` before paint.
- A nested sub-page (`#/settings/<id>/<sub>`) still shows the category's page; the page reads the
  sub-segment itself.

Our design differences / decisions:
- The registry entry also carries the page component (`page`), so a later phase registers its page
  in one place and the hub and the router need no edits.
- The two cards carry visible group headings ("Preferences", "About") for the outline; the
  reference's cards are unlabelled. No footer yet (P09-16 owns About).
- The back link is a button that navigates up through the router (not an `href`), so Back after it
  does not return to the category page.
- Progress and Coach placeholders show only the tab's name as the page title.

Tests we will write:
- `registry.test.ts`: `defineCategories` builds `#/settings/<id>` routes and keeps order; refuses a
  repeated id and a bad id; `categoryFor` finds by the first nested segment and nothing for an
  unknown one; `groupsOf` gives prefs then info and skips empty groups; the registered list passes
  the same checks.
- `SettingsHub.test.tsx`: the hub renders registered rows in order, in their group cards, and a row
  navigates to its route; the category page shows a back link labelled Settings and its title, and
  the back link returns to the hub (ACC-J1-1); an unknown category address goes to the hub; the
  empty registry shows the note; Progress and Coach show their titles.

Compare checklist (filled after the rewrite; reopened `SettingsScreen.kt` 2185–2365 and
`SettingsCategoryTest.kt`):
- [x] Hub: preferences card first, about card second; rows in registry order with an icon bubble,
      the title and a chevron (`SettingsHub.test.tsx > SettingsHub > lists the registered
      categories in order, preferences first, then about`; `registry.test.ts > groupsOf > lists
      preferences, then about, each in registry order`, `> leaves out a group with no category`)
- [x] A row opens its page under a back link labelled Settings and a large title; the back link
      returns to the hub (ACC-J1-1) (`SettingsHub.test.tsx > SettingsHub > opens a category from its
      row, under a back link labelled Settings (ACC-J1-1)`, `> goes back to the hub from the back
      link, stepping back over the page (ACC-J1-1)`, `> opens a category page straight from its
      address, and its back link reaches the hub`); re-tapping the tab is the router's (P04-05)
- [x] Distinct ids and titles; routes the router reads back (`registry.test.ts > the registered
      categories > have distinct ids and titles, and routes the router reads back as themselves`,
      `> defineCategories > refuses an id registered twice`, `> refuses "Units", which is not a page
      segment` and the other cases, `> keeps the order given and gives each category its
      #/settings/<id> route`; `> categoryFor > finds the category named by the first segment under
      #/settings`, `> finds nothing for the hub or an unregistered page`)
- [x] Unknown category address → hub; empty registry → a note (`SettingsHub.test.tsx > SettingsHub >
      goes to the hub from the address of a category that is not registered`, `> shows a note and
      no empty cards while no category is registered`)
- [x] Progress and Coach titled placeholders (`SettingsHub.test.tsx > tab placeholders > give
      Progress and Coach a page titled with the tab name`)
- Deliberate differences: visible group headings; the registry also carries the page component;
  a note on the hub while nothing is registered.
- Not taken: the categories themselves and the footer (P05-10, P07-06, P09-01, P09-16); the
  settings-load spinner on category pages (P09-01, R06.22).

## Status

Done (2026-10-26). Registry (empty), hub, category frame, Settings screen, placeholders and tests
are in; `src/app/Screen.tsx` renders them (shared). The first categories arrive with P05-10.
