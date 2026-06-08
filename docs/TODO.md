# TODO

Tracking list for known bugs and planned features.

## Features

- **Reingest**: Add a "reingest" capability that re-runs the chomper process against
  a game already in the database and fully recalculates all stats, while retaining
  all existing metadata (same game ID, tags, competition/match/round attachments).
  Also need a bulk-run mode so that when bugs are discovered in chomper, all affected
  games can be brought back to a good state in one pass.

- **App-wide filter state management**: Need a consistent strategy for persisting
  and sharing filter state (e.g. competition, nightly filters) as users navigate
  between pages. Currently filters reset on navigation, which breaks user
  expectations. Requirements and overall approach TBD — needs design discussion
  before implementation.

## Bugs

- **Medic missile hit count is wrong when target has < 2 lives remaining**: Chomper
  and the website currently treat a missile landing on a medic as worth 2 "Medic
  Hits" because it deducts 2 lives. If the medic only has 1 life remaining, the
  missile should only count as 1 Medic Hit (same logic as Nukes). This requires
  adding a new `medic_hits` column to `sm5_scorecard` (and the equivalent for team
  medic missile hits) since 1 medic missile can no longer be assumed to equal 2
  Medic Hits. Once fixed, existing games will need to be corrected via the
  **Reingest** feature above (so that should land first).
