# Highlights Spec

**Status:** Built. A community poll will gather more categories. Only games
from 2026-11-01 onward are planned for backfill, so older games have no highlights.

Highlights automatically call out exceptional moments in an SM5 game and link to that spot in the
replay. They are derived data: detectors read the stored replay rows and write a small table that
the game page reads.

**In scope:** SM5 games with replay data, and the categories below.

**Out of scope for now:** Laserball, `sm5_pdf` games (they have no events), admin curation, player
career highlights, cross-game feeds, and API or MCP exposure. The schema should not prevent any of
these later.

---

## Categories

All times are milliseconds since mission start.

| Category        | Name          | Rule                                                                                                                    | Timestamp             | `magnitude`        |
| --------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------ |
| `nuke_saved`    | Nuke Saved    | A nuking commander downs an opponent who had hit them earlier in that nuke, and the nuke detonates.                     | First qualifying down | Attackers downed   |
| `nuke_denied`   | Nuke Denied   | An opponent ends a commander's nuke before it detonates.                                                                | The cancelling event  | Always 1           |
| `medic_save`    | Medic Save    | During an enemy nuke, a medic resupplies a teammate on 3 or fewer lives, and the teammate survives the detonation.      | The resupply          | Teammates saved    |
| `comeback`      | Comeback      | A team trails by more than 10,000 at some point and wins.                                                               | Largest deficit       | Largest deficit    |
| `last_stand`    | Last Stand    | A player stays on exactly one life for more than 60 seconds.                                                            | Start of the run      | Run length (ms)    |
| `missile_chain` | Missile Chain | A commander or heavy lands 3 or more missile hits on opposing players, with each 3 in a row inside 15 seconds.          | First missile         | Missiles in chain  |
| `nuke_chain`    | 5 Chain       | A commander detonates 5 nukes in a row, with no cancelled nuke between them, within 35 seconds of the first activation. | Fifth detonation      | Span (ms), fastest |

### Rule details

**Nuke attempts.** Used by `nuke_saved`, `nuke_denied`, `medic_save` and `nuke_chain`. An attempt runs from the
commander's first `is_nuking = true` state row to their next `is_nuking = false` row. It detonated
if that later row belongs to the commander's own `0405`.

The flag alone does not identify a cancel: the simulator snapshots the commander before clearing
`is_nuking`, so the false row lands on an event after the cancel. To find the cause, take the first
event in the attempt window that is either of these:

- `0206`, `0306`, `0308`, `0500`, `0502` or `0209` targeting the commander
- `0405` by an opposing commander

It is a `nuke_denied` only if that event has an opposing player as its actor. Friendly fire,
teammate resupplies, warbots and penalties also end a nuke, but they are not highlights.

**Nuke Saved.** A down is `0206` or `0306` by the commander on an opponent, inside the attempt
window. An attacker is the target of that down, provided they landed a `0205` on the commander
after the attempt started and before the down. Only `0205` qualifies, because a deactivating hit
would have cancelled the nuke. One attempt produces at most one highlight.

**Medic Save.** A resupply is a `0502` or `0512` by a medic, between the enemy commander's activation
and detonation. A detonation costs 3 lives, so a teammate must be on 3 or fewer lives just before the
resupply and on more than 3 just before the detonation. A cancelled nuke saves nobody, and a teammate
pushed back to 3 by a later hit was not saved. Beacon resupplies do not count. One resupply produces
one highlight, however many teammates it saves.

A `0512` names no target, so its recipients are the teammates with a state row on that event showing
more lives than before. Files with TDF line types 11–13 confirm exactly who received the boost, and
the simulator writes rows for those players. In older files, rows exist only for teammates who were
active, so anyone whose boost is uncertain is left out, and the rest are simulator inference.

**Comeback.** The deficit is the best other team's running total minus the winner's, summed from
each player's latest state-row `score`. These scores exclude penalties and elimination bonuses.

- The winner is `sm5_game_team.result = 'win'`. Elimination wins count.
- Draws produce nothing.
- Only `score` and `elimination` outcomes qualify, so forfeits cannot create a comeback.

**Last Stand.** The run ends when `lives` changes or the game ends. It counts however it ends,
including elimination, and time spent down counts. All positions are treated the same. A player can
have several runs in one game, and each is a separate highlight.

**Missile Chain.** Only `0306` hits on opponents count. Generators, friendly fire and misses do not.
The window rolls, so the chain as a whole can exceed 15 seconds: the goal is a high volume of
missiles in a tight timeline. Overlapping windows merge into one highlight.

**5 Chain.** The span is measured from the first `0404` to the fifth `0405`, and five nukes in a row
means five consecutive attempts all detonated. Each nuke costs 20 SP and SP caps at 99, so five nukes
need 100 SP. A chain therefore requires earning SP during the run. One highlight per commander per
game, using their fastest run.

---

## Observed frequency

Random samples of the 9,266 non-excluded SM5 games, from a read-only spike (see commit `ec0cc98`).
These are estimates from 300 games, not archive totals; rare categories have wide error.

| Category        | Per game | Games with one | Notes                                                 |
| --------------- | -------- | -------------- | ----------------------------------------------------- |
| `nuke_saved`    | ~0.08    | Not measured   | 24 of the 100 hits before the attacker rule was added |
| `nuke_denied`   | 0.23     | 21.7%          | Matched scorecards exactly, 70 to 70                  |
| `medic_save`    | ~0.03    | Not measured   | 8 hits in a separate 300-game sample, 2 from boosts   |
| `comeback`      | 0.01     | 0.7%           | 2 hits                                                |
| `last_stand`    | 0.40     | 32.3%          | Median 84s, longest 330s                              |
| `missile_chain` | 0.06     | 6.0%           | Best was 5 missiles in 12.4s                          |
| `nuke_chain`    | 0.003    | 0.3%           | 1 hit, checked by hand against the event log          |

Of 32 commanders with five uncancelled nukes in a row, the fastest five took 26.8s, the next 156.4s
and the median 531s. The 35-second limit sits in a clear gap and should not need tuning.

A full archive backfill would write roughly 7,000 rows.

---

## Architecture

```
ingest / reingest / result change / backfill
                   │
                   ▼
       generateHighlights(gameId)
                   │  load stored rows → run detectors → replace rows
                   ▼
          sm5_game_highlight  ──►  game page, replay markers
```

Detection runs after ingest, not inside the simulator. Thresholds will change, and retuning must not
require re-reading TDFs or touching scorecards. Highlights are stored, not computed in `ReplayTab`,
because stats are not computed at render time and the replay payload is too heavy for the game page.

### Detectors

Detectors are pure functions in `packages/db/src/lib/highlights/`, one per category, with thresholds
as named constants beside them:

```ts
type Detector = {
  category: string;
  version: number;
  detect(timeline: GameTimeline): HighlightCandidate[];
};
```

They need no database access, so each can be unit tested with small hand-built timelines. Each
category needs tests for its boundaries: exactly 60 seconds, exactly 10,000, and a chain broken by a
cancel.

`GameTimeline` holds the game's events, state rows, players and teams. It should load only the
columns the detectors use.

Things detectors must allow for:

- **Sparse state rows:** rows exist at events, not on a clock. A value holds until the next row.
- **Same-millisecond events:** `sm5_game_event` has no sequence column, so ties have no reliable
  order. Compare times, and do not rely on row order within a millisecond.
- **Older files:** only files with TDF line types 11–13 have hardware resource totals. Lives in older
  files are simulator inference.

### When it runs

| Trigger                  | Where                                                  | Failure behaviour                |
| ------------------------ | ------------------------------------------------------ | -------------------------------- |
| Ingest                   | `process-file.ts`, after commit, before notify         | Log only; the game is committed  |
| Single and bulk reingest | After `reingest()` commits                             | Log only; backfill can repair it |
| Team result change       | Penalty writes in `queries/penalties.ts`, after commit | Log only; backfill can repair it |
| Detector change          | Backfill CLI                                           | Reports failed game ids          |

A penalty can change the winner, which adds or removes a Comeback. Forfeits need no trigger: they are
created as new games with no events. Marking a game replayed or aborted needs none either, because
reads hide those games.

Each run replaces a game's rows in one transaction, so all triggers are idempotent. The backfill
takes `--category` and a pause between games. Run it off-peak and sequentially: the replay tables are
about 85% of the database and share an 8 GB VM with the web container.

---

## Schema

New table `sm5_game_highlight`:

| Column                   | Type             | Null | Description                                                                     |
| ------------------------ | ---------------- | ---- | ------------------------------------------------------------------------------- |
| `id`                     | uuid             | no   | Primary key.                                                                    |
| `game_id`                | uuid             | no   | References `game`, on delete cascade.                                           |
| `category`               | text             | no   | One of the category keys.                                                       |
| `detector_version`       | integer          | no   | Version of the detector that wrote the row.                                     |
| `time`                   | integer          | no   | The moment to seek to, in ms since mission start.                               |
| `window_start`           | integer          | no   | Start of the sequence, in ms.                                                   |
| `window_end`             | integer          | no   | End of the sequence, in ms.                                                     |
| `primary_scorecard_id`   | uuid             | yes  | Player credited. Null for `comeback`. On delete cascade.                        |
| `secondary_scorecard_id` | uuid             | yes  | Other player involved, such as the cancelled commander. On delete cascade.      |
| `tdf_team_index`         | integer          | yes  | Winning team for `comeback`. Null otherwise.                                    |
| `magnitude`              | double precision | no   | Raw measure, as in the category table. Used for ranking.                        |
| `details`                | jsonb            | no   | Category-specific extras needed for display, such as the cancelling event type. |

Indexes: `game_id`; `(category, magnitude)`; partial indexes on both scorecard columns, to serve the
cascades.

### Reingest

`deleteGameChildren()` must delete this table explicitly. The `game` row survives a reingest, so its
cascade never fires, and a `comeback` row has no scorecard to cascade from. A missed delete would
leave stale rows or duplicates.

The table has no foreign key to `sm5_game_team` or `sm5_game_event`, because both get new uuids on
reingest. That is why Comeback stores `tdf_team_index`. It also keeps the table outside
`assertReingestHandlesGameTeamReferences()`.

---

## Display

**Game page.** A Highlights card on the Scoreboard tab of `apps/web/src/app/games/[slug]/page.tsx`,
with each row linking to the replay. The card is hidden when a game has no highlights: without a full
backfill, "none" would be wrong for older games.

Reads hide excluded and aborted games, plus games with the `replay` outcome.

**Ranking.** Show at most 5 highlights per game and at most 2 per category. Sort by category in this
fixed order, which follows the frequencies above: 5 Chain, Comeback, Medic Save, Missile Chain, Nuke
Saved, Nuke Denied, Last Stand.

Within a category, the best magnitude comes first, then the earliest `time`. For 5 Chain, the best
magnitude is the shortest span; for every other category it is the largest. Rarity percentiles can
replace the fixed order later without changing the schema, since `magnitude` holds the raw measure.

**Replay deep link.** `/games/<slug>?tab=replay&t=<ms>`:

- `page.tsx` reads `tab` and `t` from `searchParams`, sets the `Tabs` `defaultValue`, and keys `Tabs`
  on both so a link followed from the same page takes effect.
- `ReplayTab` takes a `highlightTime` prop and starts paused 5 seconds before the moment, clamped to
  0, so viewers see it build.

**Replay markers.** Add highlight markers along the replay slider for every highlight in the game,
including those past the card's cap. Clicking one seeks to its lead-in point.

**Video link (later).** For games with video, a highlight can link to YouTube at
`game_start_offset + time / 1000` seconds. This would be the first use of `game_start_offset` as a
sync anchor.

---

## Release

1. Apply migration `0064_sm5_game_highlight` **before** deploying the web app. The game page reads
   the new table, so deploying first breaks every SM5 game page.
2. Deploy the web app and chomper worker.
3. Backfill the agreed dates:
   ```
   pnpm --filter @lfstats/db backfill-highlights --from 2026-11-01 --to 2026-11-02
   ```
   A range or `--all` is required. `--dry-run` reports what would be stored and writes nothing.
4. Run the community poll using real examples from the site, and ask for precise triggers rather than
   category names. Each new category is a detector plus a backfill with `--category`.

## After release

The longest sampled Last Stand runs were often medics. Check this against the backfilled data, and
consider position-aware ranking if medics crowd out other positions.
