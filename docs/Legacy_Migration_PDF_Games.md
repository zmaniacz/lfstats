# Legacy Migration — PDF-era Games

How the legacy games that were ingested from printed PDF scorecards — legacy `games.tdf_key IS
NULL` — were carried into `lfstats_modern`, the rules behind every mapping, and what was left
different on purpose. The TDF-era migration is recorded separately in
[Legacy_Migration_TDF_Events.md](Legacy_Migration_TDF_Events.md).

> **Status: games migrated 2026-10-17, as social games.** Competitions for these games are a
> later phase; everything they need is staged on `sm5_pdf_game`.

## What these games are

Before TDF files were kept (2012 to early 2020), the legacy site parsed the PDF scorecard the
arena printed. That gives **end-of-game state only**: per-player totals, a per-pair hit matrix,
and penalties entered by hand. There are no events, so no replay, momentum, timeline, uptime,
assists, resets, survival time or modern MVP. The players' IPL ids were not on the PDF either,
so most legacy players were never linked to one.

## Where they live

A shared `game` row (`type = "sm5_pdf"`, `tdf_filename = ""`, `competition_id = NULL`) plus the
`sm5_pdf_*` tables, following the Laserball precedent of a separate table family per data shape.
Every TDF reader filters `game.type = 'sm5'` or joins `sm5_*`, so none of them can see these
games without opting in. Table reference: [Core_Schema.md — PDF-era Tables](Core_Schema.md#pdf-era-tables).

They are **shown, never aggregated**:

| Surface                                 | PDF games                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Game page `/games/{slug}`               | Yes — `PdfGameDetail`, scoreboard + hit matrix + legacy MVP                                                        |
| Game lists (`getGamesList`)             | Yes, badged "Legacy"                                                                                               |
| Player page                             | In the Games tab's game log, badged "Legacy", with the legacy MVP; never in the charts or head-to-head             |
| Nightly `/nightly`                      | Their dates are listed; a "Legacy scorecards" table and the games list show them; the summaries stay modern-only   |
| Career stats, leaderboards, rating      | No                                                                                                                 |
| Query API / MCP `search_games`, `games` | Yes, flagged `legacy: true` (`search_games` `legacy`: include/exclude/only); synthetic players have `ipl_id: null` |
| Query API / MCP aggregates              | No — `player_stats` and `leaderboard` never read them                                                              |
| `/api/games` export                     | No — there is no TDF to export                                                                                     |

## Running it

```
pnpm --filter @lfstats/db legacy-pdf-report                          # read-only profiling
pnpm --filter @lfstats/db migrate-legacy-pdf-games --dry-run         # plan + anomalies
pnpm --filter @lfstats/db migrate-legacy-pdf-games --all
pnpm --filter @lfstats/db migrate-legacy-pdf-games --report          # what is in modern
pnpm --filter @lfstats/db migrate-legacy-pdf-games --all --reset     # delete sm5_pdf games, redo
```

Needs `LEGACY_DATABASE_URL` alongside `DATABASE_URL`; the legacy connection is read-only.
Re-runs skip games already in `sm5_pdf_game`. `--reset` deletes every `sm5_pdf` game first and
keeps the players and `legacy_player_map`, which are reused. Once admins start editing these
games, `--reset` would destroy that work — block it the way `assertLegacyMigrationOpen` blocks
the TDF-era scripts.

## Mapping rules

Every rule below was established by `legacy-pdf-report` against the live data.

### Start time

The PDF importer read each printed, center-local time **as US Pacific** and stored it as UTC.
The wall time is therefore `game_datetime AT TIME ZONE 'America/Los_Angeles'`, whatever the
center's own timezone. Three independent checks agree:

- 15 Brisbane games from November–December 2019 exist in modern as TDF games. Under this
  reading they land on the TDF start time to the second (or the minute); stored as-is they
  were exactly 8 hours late.
- `pdf_id` is the upload time in epoch milliseconds, and a game must end before it is uploaded.
  Read as local time, 4,894 games end after their upload; read as Pacific, 1,700 do — and
  every one of those is also impossible as local time, so for them `pdf_id` is simply not an
  upload time (re-generated files). No game is explained better by the local reading.
- Read as local time, 6,009 games start between 00:00 and 09:00; read as Pacific, 433 do.

TDF-era legacy games used a different path (legacy `game_datetime` is the TDF wall time
labelled UTC — offset 0 on all 7,123 games present in both databases). This rule is for PDF
games only.

**Corrected from the PDFs, 2026-10-26.** The Pacific rule was only right in winter: the legacy
importer used a fixed UTC−8, so `AT TIME ZONE 'America/Los_Angeles'` left every
daylight-saving-season game an hour late. The start time printed in each source PDF's header
is the source of truth, and `fix-legacy-pdf-start-times` rewrote `game.start_time` from it:

```
pnpm --filter @lfstats/db fix-legacy-pdf-start-times --fetch     # download + parse every PDF (needs pdftotext)
pnpm --filter @lfstats/db fix-legacy-pdf-start-times --dry-run   # report the corrections
pnpm --filter @lfstats/db fix-legacy-pdf-start-times --apply
```

The PDFs are public at `https://lfstats-scorecards.s3.amazonaws.com/<pdf_id>.pdf`. Of the
7,152 games, 1,886 already matched and 4,725 were corrected: 4,542 by −1h, plus whole batches
imported another way — Syracuse, Loveland and Auckland in January–February 2020 (+8h, 168),
Syracuse on 5 July 2015 (−14h15m, 11) and four Carmichael games in August–September 2016 (+7h).
No corrected game falls within an hour of a TDF game. Not corrected:

- **335 games** have no `pdf_id`, and **149 PDFs** are missing from the bucket (S3 answers 403).
- **52 PDFs** can't be read: 51 truncated uploads (most from Brisbane, July 2018) and one
  whose header text extracts garbled.
- **4 games** whose printed time is held by a neighbour whose own PDF is missing or unreadable
  (so the neighbour is probably still an hour late).

Those keep the Pacific reading, so the DST-season ones among them are likely still an hour late.

A fifth collision was a duplicate: St George legacy 6308 is the same game as 6311 uploaded twice
(identical scorecards, same printed time). 6308 was deleted on 2026-10-26. A re-run of
`migrate-legacy-pdf-games` without `--reset` would bring it back, since it skips only games
already in `sm5_pdf_game`.

A PDF game within **2 minutes** of a TDF game at the same center is that game, already
ingested from its TDF, and is skipped (`duplicate-of-tdf-game`, 15 games). The first run used
the offset-0 reading, missed them, and was reset and redone.

### Centers

Legacy centers with an IPL id map to `center(country_code, site_code)`. The eight without one
were mapped by hand (`CENTER_OVERRIDES` in the script):

| Legacy center                   | Modern  | Why                                |
| ------------------------------- | ------- | ---------------------------------- |
| Lasertag of Carmichael (Legacy) | `4-3`   | Alias of Carmichael                |
| Detroit Training                | `4-6`   | Alias of Detroit                   |
| Laser Tag of Clinton Township   | `4-6`   | Detroit                            |
| Armageddon 2014, 2015           | `4-23`  | Events, played at Syracuse         |
| Invasion Laser Tag - San Marcos | `4-43`  | Already in modern                  |
| Lasertag of Santa Rosa          | `4-999` | Closed; created with a `-999` site |
| LaserZone Yorkshire             | `7-999` | Closed; created with a `-999` site |

The Armageddon events are recreated as competitions in the later phase.

### Players

Every legacy scorecard has a `player_id`, so every PDF scorecard gets a `player`:

- Legacy player with an IPL id that exists in modern → that player (146).
- Legacy player with an IPL id modern has not seen → a new player with that id (2).
- Legacy player with no IPL id → a **synthetic** player, `ipl_id = 'L-<legacy id>'` (1,075).

`legacy_player_map` records each mapping; once someone identifies a synthetic player, the
[merge tool](#merging-a-synthetic-player) folds them into the real one. Callsign history is written for every player from the PDF scorecards; an existing player's
`current_callsign` is never changed, and `first_seen_at` only moves earlier.

**Split players.** Legacy player 13 has two scorecards — "Renzer" and "I am GROOT" — in each of
legacy games 3261, 3263, 3267 and 3268, presumably two people merged. In those games the
scorecard whose callsign is not the player's usual one becomes a separate synthetic player
`L-13-1`. Hits aimed at player 13 in those games can't be attributed and are skipped.

### Scores, penalties and results

- Scorecard scores sum to the legacy side score in all but two games, and are **penalty-free**:
  legacy `adj` is the non-rescinded player and team penalties plus a 10,000 elimination bonus in
  all but about a dozen sides. So `sm5_pdf_game_team.score` is the scorecard sum,
  `elimination_bonus` is 10,000 when the other side was eliminated, and `penalty_score` is the
  penalty sum. The total is `score + elimination_bonus + penalty_score`, the same as `sm5`.
- Penalties copy across as legacy recorded them (type, value, MVP value, in-game, rescinded);
  there is no `time`. Team penalties go to the side named by `team_color`.
- `result` is recomputed from the totals. `match_penalties` hang off legacy event teams, so they
  wait for the competition phase.

### Hits

Legacy `hits` rows are aggregated per (shooter, target) scorecard; zero rows are dropped. The
shooter is the row's scorecard; the target is the scorecard of `target_id` in the same game.

- 896 non-zero rows (4,608 hits) target a player with no scorecard in that game — dropped.
- 48 rows target player 13 in the split games — dropped.

### Durations and elimination

Legacy `game_length` is seconds and often null. `actual_duration` is `game_length`, else the
longest `survived`, else 900 s; `scheduled_duration` is the longest `survived` (a full-game
survivor), else the same fallbacks. A scorecard is `eliminated` when `lives_left = 0`; the PDF
records no elimination time.

### MVP

The legacy site's MVP is kept as `legacy_mvp_points`, with its component breakdown in
`legacy_mvp_details`, and shown as "MVP\*" with a legacy label. It used an older formula than
modern MVP and is never mixed into modern MVP stats.

## Merging a synthetic player

When a synthetic player is identified as a real IPL player, an admin merges them from the
synthetic player's page (`/players/L-…`): the **Merge into a real player** card searches players
by callsign (synthetic players are excluded) and asks for confirmation before merging. The card
and both of its Server Actions are gated to `admin` and `superAdmin` (see
[Role_Spec.md](Role_Spec.md)); `centerAdmin` does not qualify, since a player is not scoped to a
center.

`mergeSyntheticPlayer(sourceId, targetId)` in `packages/db/src/queries/legacy-player-merge.ts`
does it in one transaction, with both `player` rows locked:

- `sm5_pdf_scorecard.player_id` → the target. The per-game `callsign` stays as printed.
- `player_callsign_history` rows move to the target; where the target already has the callsign,
  the row keeps the earlier `first_seen_at` and the later `last_seen_at`.
- `legacy_player_map` rows → the target, with `synthetic = false`.
- Favorites and POV `game_video` rows follow the player, except where the target already has the
  same one (those duplicates cascade away with the synthetic row).
- The target's `first_seen_at` moves earlier if the legacy games predate it. Its
  `current_callsign` is unchanged.
- The synthetic `player` row is deleted.

It refuses a source that isn't synthetic, a target that is, and — as a guard on the assumption that
synthetic players exist only in PDF-era data — a source with any modern scorecard, referee or
competition row. Nothing needs recomputing afterwards: PDF games feed no rating or aggregate.
After the merge the browser goes to the target's page; the synthetic URL is gone.

There is no undo in the app. To reverse one by hand, re-create the synthetic player and point its
`sm5_pdf_scorecard` rows (find them via `legacy_scorecard_id` against legacy) and
`legacy_player_map` rows back at it.

## Final state

At migration: **7,152 games**, 85,649 scorecards, 401,395 hit pairs, 3,226 penalties, 23 team
penalties, 1,223 legacy players (1,075 synthetic). Skipped: 15 TDF duplicates and 8 placeholder
games with no scorecards ("Fake1", "Dummy Game").

Left as the data has them, and listed by `--dry-run`:

- **Ten side totals** disagree with legacy `score + adj`. Most are penalty rows that don't add up
  to legacy's `adj`; in legacy game 5679 the legacy side scores don't match the scorecards at all.
  Modern computes from the scorecards and penalties.
- **Six winners** differ: four games tied on total where legacy still named a winner (modern says
  draw), and two that follow from the total mismatches above.
- **One scorecard** (legacy 72283, AceKnight, game 5683) had team `"null"`; it was placed on green,
  the only side whose scorecards fall short of the legacy side score by exactly its score.

## Remaining work

The games are in; the following is still open. Items 1–2 were named at handover; the rest
turned up during the migration.

1. **Competitive (league) events.** 2,228 PDF games are legacy `type = 'league'`, staged on
   `sm5_pdf_game` with `legacy_event_id`, `legacy_match_id` and `league_round/match/game`.
   Built 2026-10-28 by `migrate-legacy-pdf-competition` — see the events doc. Originally:
   build their competitions the way `migrate-legacy-competition.ts` did for the TDF era
   (teams, rounds, matches, rosters with mercenaries, solo events as `format = 'solo'`), and
   carry the 3 legacy `match_penalties`. **Done** — see
   [Legacy_Migration_PDF_Events.md](Legacy_Migration_PDF_Events.md), closed 2026-10-28.
2. **Armageddon 2014 and 2015.** Legacy recorded these as their own "centers" (legacy ids 3
   and 9, 35 and 21 games); they were mapped to Syracuse (`4-23`). **Done**: recreated as
   competitions with teams from co-play groups. Their start times match the printed PDFs (55 of
   56; one PDF is missing), early-morning clock readings included.
3. **Lock the migration script.** **Done** 2026-10-28: `migrate-legacy-pdf-games` refuses to
   write (`--all`, `--game`, `--reset`) unless given `--reopen-closed-migration`
   (`assertLegacyPdfMigrationOpen`), and `--reset` also refuses while any PDF game belongs to a
   competition.
4. **Timestamp leftovers.** Start times were corrected from the PDFs (see
   [Start time](#start-time)). Still open: 540 unchecked games (536 with no readable PDF,
   4 blocked by a collision), whose DST-season times are probably still an hour late.
5. **Synthetic player curation.** 1,075 synthetic `L-…` players remain. The merge tool
   handles one at a time; a report of likely matches (same callsign as a real player at the
   same center, overlapping years) would make the curation tractable.
6. **Center details.** The two created centers (`4-999` Lasertag of Santa Rosa, `7-999`
   LaserZone Yorkshire) have no city, country or short name. Separately, `center.timezone` is
   null for every center.
7. **Admin editing of PDF games.** The PDF game page is read-only: no exclude toggle,
   description, tags, penalty editing or competition assignment. Needed before item 1 can be
   corrected by hand.
8. **Basic aggregates (decision).** PDF games are deliberately left out of every career stat.
   Opting them into games played and W/L is possible later; their MVP and advanced stats
   should stay out.
