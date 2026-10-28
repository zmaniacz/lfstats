# Legacy Migration — PDF-era Competitive Events (plan)

> **Status: Phases 1–4 done 2026-10-28.** Migrations 0061–0062 are applied and all 34 PDF-era
> events are built in `lfstats_modern` — see [Built](#built-phase-3). Still open: teams for the
> four shell events (Phase 5) and closing the script (Phase 7).
> Inventory figures come from read-only queries against both databases on that date.

The PDF-era games are in modern as social `sm5_pdf` games
([Legacy_Migration_PDF_Games.md](Legacy_Migration_PDF_Games.md)). This phase rebuilds the
competitive events around them — competitions, teams, rounds, matches, game assignments,
rosters and match penalties — the way [Legacy_Migration_TDF_Events.md](Legacy_Migration_TDF_Events.md)
did for the TDF era.

## Inventory

Legacy has 63 `is_comp` events (all `type = 'league'`). 28 are already in modern (the TDF-era
migration plus five built by hand); 3 are empty shells (793 duplicate Armageddon 2019,
1748 Asra Awakens, 2024 Internationals 2026 — already built by hand). That leaves **32 events
with PDF games**, plus **Armageddon 2014 and 2015**, which legacy recorded as their own
"centers" with social events (130, 194) rather than as competitions.

| Shape                                        | Events                                                                                                                                           |  Games |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -----: |
| **Full structure** — teams, rounds, matches  | 2, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 413, 419, 434, 507, 557, 566, 687, 764, 808, 845, 853, 911, 948, 959                             | ~1,860 |
| Structure, but 8 games outside any match     | 1 LTC Season 1 (games `G1`–`G8`)                                                                                                                 |     44 |
| Teams + game sides, **no rounds or matches** | 6 ECT 5 — every team pair plays twice with sides swapped, so matches are recoverable by pairing                                                  |     79 |
| **No teams at all**                          | 4 Nationals 2012, 5 Nationals 2013, Armageddon 2014 (ev 130), Armageddon 2015 (ev 194) — only "Red Team"/"Green Team"                            |    248 |
| Mixed PDF + TDF                              | 895 Brisbane 2019 Season 2 — 35 games are `sm5_pdf`, 15 (2019-11-18 → 12-02) were skipped as duplicates of TDF games and live in modern as `sm5` |     50 |

Modern holds 2,205 of the 2,228 legacy league PDF games on `sm5_pdf_game` with
`legacy_event_id` staged (1,926 also with `legacy_match_id`). The gap is the 15 Brisbane TDF
duplicates and 8 placeholder games ("Fake1", "Dummy Game"). None is in a competition yet.

### Data quality (from the legacy side)

- **Side mapping is clean.** Every in-match game's `{red_team_id, green_team_id}` equals its
  match's `{team_1_id, team_2_id}` except **2 games in Internationals 2017** (legacy 3248,
  3249: played by teams 71 v 72, filed under match 71 v 78). No duplicate `league_game`
  within a match; every `league_game` is 1 or 2.
- **Legacy `game_teams` exist for PDF games** but carry no `event_team_id`; the side
  discriminator is `games.red_team_id` / `green_team_id` ↔ `sm5_pdf_game_team.side`, which the
  PDF migration already wrote from the same legacy columns. No colour caveat this time: PDF
  games really were red v green.
- **Unplayed matches:** 35 matches with no games (10: 8, 13: 12, 14: 2, 15: 3, 17: 1, 18: 1,
  808: 1, 845: 6, 911: 1). 17 of those have a null team — bracket placeholders that were never
  filled (13: 7, 14: 2, 808: 1, 845: 6, 911: 1).
- **No round multipliers** other than 1. Finals rounds: 0–2 per event.
- **Event 895** is `scoring = 'solo'` yet has 4 teams, 4 rounds, 26 matches and 4
  `event_players` handicaps (Tragedy 4, Screaver 6, Anarki 9, one 0).

### Other legacy data

| Item                                      | Legacy                                     | Modern today                                                      | Plan                                  |
| ----------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------- |
| Player / team penalties on PDF games      | 3,255 / 27                                 | 3,226 / 23 (dupes + placeholders likely explain the gap — verify) | verify only                           |
| `match_penalties`                         | 3 rows: JFK −1, −2 (566); FSA −2 (845)     | `competition_team_adjustment` (Phase 2)                           | carried (Phase 3)                     |
| Penalty overrides on **TDF social** games | 2,596 rows, 34 rescinded, 347 with a value | 2,616 rows, **0 rescinded**                                       | separate task (see Phase 6)           |
| `events.description`, `challonge_link`    | 7 Challonge links, a few descriptions      | —                                                                 | carry onto `competition`              |
| `event_teams.country_code`                | only Internationals 2017 (8 teams)         | no column                                                         | drop, or put in team name/description |
| `event_teams.points`                      | only LTC Season 2 (18, 18, 6, 2)           | points are derived                                                | report against derived standings      |
| `event_players.handicap`                  | event 895 only, 4 rows                     | `competition_player.handicap`                                     | record in the 895 description only    |
| `games_tags`                              | `social` / `competition` only              | redundant with event type                                         | skip                                  |

## Matches holding PDF games (Phase 1, done)

`competition_match_game` used to point only at `sm5_game_team`, and `competition-tournament.ts`
joined `sm5_game_team` / `sm5_scorecard` throughout, so a PDF game could not sit in a match.
Migration `0061_pdf_competition_match_games` (hand-edited: drizzle's version dropped the
existing links) changes that — full description in
[Competition_Structure.md](Competition_Structure.md#competition_match_game):

- The existing pair became `team1/2_sm5_game_team_id`, a new pair `team1/2_pdf_game_team_id`
  points at `sm5_pdf_game_team`, and a check requires exactly one pair. Both keep real FKs.
- `team1/2_game_team_id` are now **generated** `coalesce(sm5, pdf)` columns, so every reader
  that already used them is unchanged.
- View `competition_game_side` (both team tables) feeds standings, match results, the game
  lists, the schedule and results-by-colour; view `competition_scorecard` (both scorecard
  tables) feeds roster games-played, the unrostered-players list and the unassigned count.
- `sm5_pdf_scorecard.is_mercenary`, stamped by `assignGameToMatch()`, which also works out which
  pair to write from the ids it is given. The admin match-game form lists PDF games' teams.
- `migrate-legacy-pdf-games --reset` refuses once any PDF game belongs to a competition.

Verified in a rolled-back transaction on `lfstats_modern`: all 1,216 existing match games read
identical totals, results and colours through the view, the check rejects a mixed row, and a
legacy Internationals 2014 match built as a fixture scores through the standings joins.

Still open from this area:

- Per-player competition pages (top players, position leaders, team player stats) read
  `sm5_scorecard` only, so they are empty for PDF games. Add PDF variants (score, legacy
  MVP\*, accuracy) or hide those tabs for PDF competitions.
- Rating (`rating/load.ts`) joins `sm5_*` and so still ignores PDF games, as it must.
- `getNightlyPdfScorecards` (`sm5-pdf.ts`) filters `competition_id IS NULL`, so these games
  drop out of the nightly legacy table once assigned — the same as TDF games do.

## Built (Phase 3)

```
pnpm --filter @lfstats/db migrate-legacy-pdf-competition --report
pnpm --filter @lfstats/db migrate-legacy-pdf-competition --event 7 --dry-run [--verbose]
pnpm --filter @lfstats/db migrate-legacy-pdf-competition --event 7 [--force]
```

`src/scripts/migrate-legacy-pdf-competition.ts`, configured by `LEGACY_PDF_EVENTS` in
`legacy-events.ts` (each event's `shape`, `category`, any name override). Applied event by event
on 2026-10-28: **34 competitions, 2,283 games** (2,268 `sm5_pdf`, 15 TDF), 1,931 PDF match
games, 3 standings adjustments. Every league PDF game now belongs to a competition.

| Shape     | Events | What came across                                                        |
| --------- | -----: | ----------------------------------------------------------------------- |
| `matches` |     29 | teams, rounds, matches, match games, derived rosters, adjustments       |
| `sides`   |      1 | ECT 5: teams, rosters (100% consistent), and matches rebuilt in Phase 4 |
| `shell`   |      4 | Nationals 2012/2013, Armageddon 2014/2015: competition and games only   |

How the script resolves things the plan left open:

- **Brisbane 2019 Season 2's 15 TDF games** are found by the PDF migration's own rule (a modern
  game at the same center within two minutes) and their sides mapped by who played: legacy
  player → `legacy_player_map`, else IPL id → the `sm5_game_team` they played on. All 15 mapped
  on 7 + 7 players. PDF-era legacy scorecards often have no `team_id`; their side is the `team`
  text.
- **Result-only games.** Seven legacy in-match games had no scorecards — hand-entered forfeits
  (`Fake1`, `G545454`, …) and real games whose PDF was lost (`R1M10G2`, Nats 2016 `G1`). The
  PDF migration had skipped them as placeholders. Decided 2026-10-28: they come across as
  `sm5_pdf` games with both team totals and no scorecards, described "Result only — no
  scorecard in legacy." Each side's total is legacy `score + adj`; an `adj` carrying the
  10,000 against an eliminated opponent becomes `elimination_bonus`, the rest is `score`.
- **Names.** Legacy's except: WCT4 → WCT 4, ECT6 → ECT 6, ECT7 → ECT 7, and the two Armageddon
  events (legacy: "Socials 2014-06-30" / "Socials 2015-06-27").
- **Roster consistency** is under 90% in nine league seasons (as low as 74.7%, Brisbane 2018
  Season 1). It is reported as a note, not a warning: legacy's match points independently
  confirm every side mapping, and players genuinely moved between teams across a season.

### Against legacy's own points

Legacy stored its points for every played match (`matches.team_1_points` / `team_2_points`);
the dry run scores each match the modern way and compares. Every match agrees except six, and
every team total (pool rounds plus adjustments) agrees except in LTC Season 1:

| Event                     | Match                     | Legacy | Modern | Why                                                |
| ------------------------- | ------------------------- | -----: | -----: | -------------------------------------------------- |
| LTC Season 1              | R3 M1 Fat v Guardians     |    6-0 |    4-2 | legacy ignored a −1,000 penalty deciding game 2    |
| Internationals 2015       | Finals M10 Lov 1 v Sac B  |    2-4 |    4-2 | side total disagrees with legacy (PDF-era residue) |
| Detroit Invitational 2018 | Finals M1 M1cro v Beanz   |    4-2 |    6-0 | legacy ignored penalties                           |
| Detroit Invitational 2018 | Finals M13 Scythe v Baden |    2-4 |    4-2 | legacy's match bonus ignored Scythe's −3,000       |
| Internationals 2019       | Finals M7                 |    4-2 |    2-0 | legacy has points for two games but only one game  |
| LLT Season 4              | Finals M3                 |    6-0 |    2-0 | the same                                           |

LTC Season 1 therefore stands Guardians 32 (legacy 30), Team Fat Guy 24 (legacy 26). Modern
counts penalties in results and the match bonus — the rule the rest of the site uses.

Checked in the browser: Internationals 2014 standings equal legacy's for all 7 teams; Brisbane
2018 Season 2 shows Team JFK at 17\* with both deductions listed; a result-only game page
renders its two totals with empty scoreboards; a shell event's standings say no teams yet.

## Phases

1. **Schema + queries** — done, see above. Apply migration 0061 with `pnpm db:migrate`.
2. **Standings adjustments** — done (migration 0062, applied 2026-10-28):
   `competition_team_adjustment(competition_id, team_id, points, reason)`, added to the
   whole-competition standings, listed under the standings table, and edited on the admin Teams
   page. Phase 3 writes the 3 legacy `match_penalties` there (`type` and `description` joined
   into `reason`).
3. **Done** — see [Built](#built-phase-3). The original plan for it:
   **`migrate-legacy-pdf-competition` script** — modelled on `migrate-legacy-competition.ts`,
   own config entries in `legacy-events.ts` (new `LEGACY_PDF_EVENTS` list), `--report`,
   `--dry-run`, `--event`, `--all`, `--force`; writes guarded the same way and closed when done.
   - Competition: name, host center (by `CENTER_OVERRIDES` for the legacy-only centers),
     dates from the games, description, Challonge link, `type = competitive`,
     `state = completed`, `format` from config.
   - Games: `game.competition_id` for every `sm5_pdf_game` with that `legacy_event_id`, plus
     for 895 the 15 TDF games found by the same 2-minute center/time rule that skipped them.
   - Teams, rounds (same finals-last renumbering), matches.
   - Match games: legacy `match_id` + `league_game`; sides via `red_team_id`/`green_team_id` →
     `sm5_pdf_game_team.side`. Structural check refuses on mismatch; the two Internationals 2017
     games are excluded by config and reported.
   - Rosters from `sm5_pdf_scorecard` (every row has a player — real or synthetic `L-…`):
     most-played team is the roster team, others mercenary; 90% consistency floor.
   - Match penalties → `competition_team_adjustment`.
   - Verification: legacy-vs-modern standings per event, as `legacy-variance` does for TDF.
4. **Partial-structure events** — done 2026-10-28.
   - **ECT 5**: no pairing heuristic was needed. Legacy kept no rounds or matches, but every game
     carries `league_round` / `league_match` / `league_game`, and those give the whole
     structure: days 1 and 2 are each a full 15-match round robin of the six teams, day 3 a
     10-match bracket ending in a one-game final. `shape: "sides"` events now rebuild their
     rounds and matches from those numbers (`withLeagueStructure()`), and the existing match
     planner checks every game of a match is the same two teams. `finalsLeagueRounds: [3]`
     marks day 3 as finals, as ECT 6 and ECT 7 run theirs. Rebuilt with `--force`: 3 rounds,
     40 matches, 79 match games. Legacy stored no points to compare against; modern stands
     Detroit A 54, Craig A 52, Syracuse 38, Detroit B 14, Craig B 14, Craig C 8, and Detroit A
     won the final.
   - **LTC Season 1**: games `G1`–`G8` left assigned to the competition but not to a match.
5. **Unstructured events** (Nationals 2012/2013, Armageddon 2014/2015): competition + game
   assignment only. Teams and rosters built by hand in the admin UI. To make that tractable,
   the script prints a **co-play report** per event: clusters of players who repeatedly share a
   side, as candidate teams. Armageddon 2014/2015 host at Syracuse `4-23` (where their games
   already sit).
6. **TDF social-game penalty back-fill** — run the existing `migrate-legacy-penalties` matching
   rules over legacy TDF games outside competitive events (34 rescinded flags, 347 hand values
   missing). **Its own task**, outside this effort; needs the closed-migration guard reopened
   deliberately for that scope only.
7. **Close** — record final state in this doc and add `assertLegacyMigrationOpen` to the new
   script.

## Decisions (2026-10-28)

1. **Schema:** the parallel FK pair with generated columns (Phase 1).
2. **Brisbane 2019 Season 2 (895)** migrates as a **team** event despite legacy `scoring = solo`:
   its four teams are named for their captains (Rusty, Anarki, Glaedr, Tragedy) and every game is
   between two of them. The four player handicaps have no team-format equivalent and are recorded
   in the competition description only.
3. **Unplayed matches:** keep the 18 with both teams set (they show as unplayed and score
   nothing); drop the 17 with an empty slot, which are bracket placeholders never filled.
4. **TDF social-game penalty back-fill** (Phase 6) is its own task, outside this effort.
