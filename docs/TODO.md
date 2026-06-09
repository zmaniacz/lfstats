# TODO

Tracking list for known bugs and planned features.

## Features

- **Reingest**: Add a "reingest" capability that re-runs the chomper process against
  a game already in the database and fully recalculates all stats, while retaining
  all existing metadata (same game ID, tags, competition/match/round attachments).
  Also need a bulk-run mode so that when bugs are discovered in chomper, all affected
  games can be brought back to a good state in one pass.

- **Split pool competitive rounds**: Add a new round type — "split pool" — where
  teams within a round are divided into a defined number of smaller pools. Requires:
  - Schema support for pools within a round and team-to-pool assignments
  - Admin UI with drag-and-drop to assign teams across pools
  - Separate standings tables per pool on the competition/round view
  - Mixed-round support: a competition may contain both regular and split pool
    rounds simultaneously, so the UI must handle both round types gracefully on
    the same page

- **App-wide filter state management**: Need a consistent strategy for persisting
  and sharing filter state (e.g. competition, nightly filters) as users navigate
  between pages. Currently filters reset on navigation, which breaks user
  expectations. Requirements and overall approach TBD — needs design discussion
  before implementation.
