# Legacy Migration — TDF-based Events

A record of how competitive events from the legacy `lfstats` database were carried into
`lfstats_modern`, what was verified, and what was deliberately left different. It is a
reference for work already done. The structures being migrated into are specified in
[Competition_Structure.md](Competition_Structure.md).

Only events whose games have a TDF file were in scope. Migrating the pre-TDF games
(late 2019 and earlier) is separate work — see [Out of scope](#out-of-scope).

> **Status: closed on 2026-10-17.** Every legacy event with TDF games is migrated, and
> the modern database is now the source of truth. Do not re-run the migration or the
> back-fills: they would overwrite admin edits made since, and undo the deliberate
> exceptions listed under [Final state](#final-state). The three scripts that write
> (`migrate-legacy-comp`, `migrate-legacy-penalties`, `backfill-solo-format`) exit unless
> given `--reopen-closed-migration`. `--report`, `--dry-run` and `legacy-variance` are
> read-only and still work. The rest of this doc records how the migration was done.

## Overview

Competitions played before go-live were organized in the legacy `lfstats` database and
were never carried over — the **games** were all re-ingested from TDF and already exist
in `lfstats_modern`, but with no competition, team, round, or match structure around
them. `packages/db/src/scripts/migrate-legacy-competition.ts` imports that structure.

```
pnpm --filter @lfstats/db migrate-legacy-comp --report            # status of every legacy event
pnpm --filter @lfstats/db migrate-legacy-comp --event 1312 --dry-run
pnpm --filter @lfstats/db migrate-legacy-comp --event 1312
pnpm --filter @lfstats/db migrate-legacy-comp --all
```

Needs `LEGACY_DATABASE_URL` alongside `DATABASE_URL`. The legacy connection is opened
with `default_transaction_read_only = on` — the legacy site is still live. Per-event
scope and every judgement call live in `packages/db/src/scripts/legacy-events.ts`.

## Join keys

| Concept   | Legacy                                      | Modern                                          | Notes                                            |
| --------- | ------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Game      | `games.tdf_key` (`4-19_20260610180835.tdf`) | `game.tdf_filename` (`4-19-20260610180835.tdf`) | `replace(tdf_key,'_','-')`; matched 1516/1516    |
| Game team | `game_teams.index`                          | `sm5_game_team.tdf_team_index`                  | both come from the TDF; matched 3032/3032        |
| Player    | `players.ipl_id`                            | `player.ipl_id`                                 | not used — rosters derive from modern scorecards |
| Center    | `centers.ipl_id` (`4-19`)                   | `center.country_code` + `site_code`             |                                                  |

## Colour is not migrated

The legacy site assumed every team was either red or green and coerced anything else, so
`game_teams.color_normal` is only ever `'red'` or `'green'`. **St George Summer League
2025 actually played Red vs Blue and Fire vs Ice** — legacy labelled both the Blue and
the Ice side "green".

The migration therefore treats `color_normal` strictly as a **side discriminator** — the
token saying whether a game team is the one named by `games.red_team_id` or by
`games.green_team_id` — and writes no colour data at all. `sm5_game_team.colour_enum` /
`colour_rgb` / `name` come from the TDF at ingest and remain authoritative. Migrated
games therefore render Blue and Ice correctly and **diverge from the legacy site by
design**; that is the more accurate representation, not a bug.

Because the side mapping cannot be checked against colour, the script validates it two
other ways and refuses to proceed if either fails:

- **Structural** — a game's `{red_team_id, green_team_id}` must be exactly its match's
  `{team_1_id, team_2_id}`. Holds for 100% of games.
- **Roster** — players must land on their most-played team in at least 90% of scorecards.
  Observed 92.5%–100%, with the residual tracking known mercenary counts.

## Derived data

- **Rosters.** Legacy has no roster table, so rosters are derived from who actually
  played, reading **modern** scorecards (which sidesteps legacy player-id mapping, and
  makes guests fall out naturally as `player_id IS NULL`). A player's roster team is the
  one they played the most games for; every other team they appear on gets an
  `is_mercenary = true` entry — the only legal way to be attached to two teams in one
  competition. Ties break on earliest appearance.
- **Round numbers.** Legacy `rounds.round` is not unique per event, but modern enforces
  `unique(competition_id, round_number)`. Rounds are sorted finals-last, then by round
  number with NULL last, then by id, and renumbered 1..N. Rounds with zero matches are
  dropped.
- **Team short names.** Legacy team names are free text with emoji and punctuation
  (`🥞Stacked Team🥞`). `slugify` folds anything outside `[a-z0-9_-]` away, but it
  replaces it with underscores rather than words, so a raw name makes for an ugly slug.
  Short names are auto-derived and printed for review — correct them via `shortNames`
  in the config or in the admin UI.

## Penalties

The structure migration carries **no** penalty data. A second script,
`packages/db/src/scripts/migrate-legacy-penalties.ts`, back-fills it:

```
pnpm --filter @lfstats/db migrate-legacy-penalties --dry-run
pnpm --filter @lfstats/db migrate-legacy-penalties
pnpm --filter @lfstats/db migrate-legacy-penalties --report
```

The penalty _rows_ already exist in modern — chomper re-derives them from the TDF's 0600
events at ingest. What legacy held on top of them did not survive: `rescinded` flags,
hand classification (`type`), score `value`, `mvp_value`, and team penalties, which have
no player attribution and were absent entirely.

- **Player penalties** match on `(tdf_filename, ipl_id)` and are applied through
  `updatePenalty()` so MVP components and game results stay consistent.
- **Manual legacy entries** — rows with no TDF event behind them, e.g. `Unknown +6232`
  used as a score award, or `Game Misconduct -5122` — are created via `addPenalty()`
  where modern has none for that player in that game.
- **Team penalties** go to `sm5_game_team_penalty` via `addTeamPenalty()`;
  `recalculateGameResult()` folds both kinds into `sm5_game_team.penalty_score`.
- `match_penalties` (3 rows) are all on pre-TDF events and are out of scope.

**Not automated, reported instead.** Legacy's `penalties` table has no `time` column, so
within a `(game, player)` group the two sides pair up in order. Where counts disagree the
group is skipped rather than guessed at, and where one player has several _differing_
penalties in one game the pairing is applied but flagged — totals are correct either way,
but the type/MVP split between them may be transposed. Run with `--report` for the
current list.

## Standings will not match the legacy site exactly

This is expected, and is **not** a migration defect. The full residue is enumerated by

```
pnpm --filter @lfstats/db legacy-variance                # standings, matches, scores
pnpm --filter @lfstats/db legacy-variance --scores-only  # score disagreements only
```

which is read-only against both databases and is the authority for the figures below.
They were taken at close, 2026-10-17, after the penalty back-fill.

Fifteen competitions are comparable — the eleven migrated team events plus four of the
five built by hand. (`internationals_2026` exists in legacy as a shell: ten placeholder
teams, no games.) Of those fifteen, **eleven reproduce exactly**. Of 82 team-seasons, 8
differ, and **none on points** — all eight are tie-break order (item 2 below).

1. **The two systems score penalties differently** — 54 of 3032 team-game totals
   disagree: 45 where modern counts an in-game deduction legacy dropped, 3 where legacy
   holds an escalation modern lacks, 2 for the elimination bonus legacy left out of
   `adj`, and 4 unexplained (listed below). None of them moves a standings point.
   Before the back-fill there were 405.

   A penalty is scored twice over, and the databases take different views of each half.
   _In-game_, the arena deducts line 1 `penalty` on every `0600` event; that setting is
   per game, and center 4-19 runs `-1000` normally but was set to `0` for the
   Internationals 2024 files. _After the game_, referees meet and decide which penalties
   are escalated, normally to `-1000` score and `-5` MVP; that decision exists only in
   legacy `penalties.value` and arrived via the back-fill. Legacy stored a deduction-free
   score and counted escalations only; modern counts the in-game deduction. Note that
   `score_value` cannot be summed to measure this — where the arena deducted in-game on a
   pre-2.003 TDF the amount is baked into the line 5 score stream and the row's own
   `score_value` is 0.

2. **Tie-breaks.** Four competitions — Darmstadt 2021 Season 1, Armageddon 2024, St
   George Summer League 2025 and (inter)nationals 2024 — reproduce every points total
   exactly and differ only in the order of teams that are level on points, which modern
   breaks on score ratio. Eight team-seasons, no points moved.

Modern's scores are the correct basis for the modern site. The team-to-side mapping is
verified independently by the structural and roster checks above, and by the fact that on
every game the _matching_ side's score agrees with legacy to the point.

## Final state

What was deliberately left unlike legacy when the migration closed, and should stay
that way:

- **Two legacy score awards are rescinded.** Legacy recorded `Unknown` awards of +6232
  (Rockwood, `4-19-20240806230803.tdf`) and +3142 (Bromatized, `4-19-20240807235410.tdf`)
  in Internationals 2024. The back-fill created them, but the TDF score already contained
  most of each correction, so they double-counted: the gap to legacy grew from −350 and
  +2338 to +5882 and +5480. Both are rescinded in modern, and neither game's winner
  changed. A back-fill run would un-rescind them — one reason it is now blocked.
- **Three manual legacy entries were never created.** The Spirit −6482 / King Fox +6482
  score transfer in `4-19-20240805164045.tdf` (Spirit has no scorecard in modern for that
  game, so there is nothing to attach the penalty to) and a rescinded "Penalty Removed"
  for Scout in `4-19-20230816193132.tdf`.
- **42 penalty groups were left as the TDF has them.** Their legacy and modern penalty
  counts disagree (17), or modern has a penalty legacy does not (23), or a team penalty
  already existed (2), so pairing them would have been a guess. Accepted as is.
- **Four score totals stay unexplained** — three in Internationals 2024 and one in
  Syracuse Shindig 2022 (`legacy-variance` lists them with both penalty ledgers).
- **Three competition slugs were renamed** to the URL-safe form after `slugify` was
  tightened: `nerd_sturgis_st_george_2020`, `st_george_random_bonanza_2022` and
  `inter_nationals_2024`. The old URLs no longer resolve.

Left for admins, in the admin UI rather than by script:

- **Syracuse Shindig 2025** (built by hand) is missing ten games from 2025-10-08. They
  are in modern but belong to no competition, and legacy never put them in a match
  either: its round 2 has 15 matches but only 4 games.
- **Solo handicaps** — see Known data loss below.

## Known data loss

- **Solo handicaps.** `event_players.handicap` was not migrated. Modern models handicaps on
  `competition_player.handicap`, but the legacy values are unrecoverable, so every backfilled solo
  event starts with nobody enrolled and an admin must re-enter them. At close, only
  Brisbane 2020 Season 1 had been enrolled. See [Solo Competitions](Competition_Structure.md#solo-competitions).
- **Single-game matches.** Armageddon 2024 is 15 matches × 1 game, and Darmstadt 2021
  Season 1 round 2 is 4 more. Modern awards the match bonus only when both games are
  recorded, so those matches read `incomplete` and contribute 0 match points; game
  points still count. The script warns.

Round multipliers were a known loss when the migration ran, but modern has since gained
`competition_round.multiplier`, and Nerd Sturgis round 4 (the only non-1 value in legacy)
is set to `2`. That event now reproduces legacy exactly.

## Out of scope

Legacy `tdf_key` only starts appearing in late 2019. Competitive events before that
(Nationals 2012–2013, Internationals 2014–2019, ECT 2020, WCT 5, …) have no TDF and their
games **do not exist in the modern database at all** — verified by matching center IPL id
plus timestamp. They are permanently unmigratable. `--report` lists every legacy
competitive event with its status and flags any that have TDF games but no config entry.

**Solo events** (individually-scored leagues: Brisbane solo seasons, Loveland
Duos/Summer/Winter, Auckland Triple Threat, …) have no teams, rounds, or matches in the
legacy schema, and get a competition row plus their game assignments and nothing else.
They are now flagged `format = 'solo'` and served by the individual scoring described in
[Solo Competitions](Competition_Structure.md#solo-competitions) — do **not** "fix" these events by inventing teams.

The migration sets the flag for new runs; the thirteen already-migrated events are flipped by

```
pnpm --filter @lfstats/db backfill-solo-format --dry-run
pnpm --filter @lfstats/db backfill-solo-format
```

which enrolls nobody, so every player lands in the standings page's unenrolled block for an
admin to add with a handicap.
