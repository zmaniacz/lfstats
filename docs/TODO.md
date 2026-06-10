# TODO

Tracking list for known bugs and planned features.

## Features

- **Split pool competitive rounds**: Add a new round type — "split pool" — where
  teams within a round are divided into a defined number of smaller pools. Requires:
  - Schema support for pools within a round and team-to-pool assignments
  - Admin UI with drag-and-drop to assign teams across pools
  - Separate standings tables per pool on the competition/round view
  - Mixed-round support: a competition may contain both regular and split pool
    rounds simultaneously, so the UI must handle both round types gracefully on
    the same page

- **Upload to Events**: Need to change upload behavior to be able to upload directly to
  a competition. Should use the competition slug as an S3 prefix then have chomper
  read the prefix to assign an uploaded game to a competition. Also want to be able to
  toggle events between 'pre-launch', 'upcoming', 'active' and 'ended'. Upload
  shoudl only be avaialble for active events. 'pre-launch' are hidden except to admins.
  'upcoming' and 'active' given priority on main page.
