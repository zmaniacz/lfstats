# Competition Structure

**Last Updated:** 2026-06

---

## Overview

A **competition** is a structured event that groups a set of SM5 games together and gives them organisational meaning. The most common type is a **tournament**, where a fixed set of teams play each other in **matches** across multiple **rounds**, with standings derived from match results.

The base `competition` table and `game.competition_id` FK were the starting point. The tournament structure built on top of that is described here.

---

## Design Decisions

- **Teams are per-competition.** A team is created for each event and does not carry identity across competitions.
- **Matches are 2 games.** Teams play once on each color (e.g. Red → Green). Each game is recorded as game 1 or game 2 of the match.
- **Color mapping is explicit.** `competition_match_game` records which `sm5_game_team` row corresponds to each competition team in each game. This is required because team color assignments swap between games.
- **Match numbers are per-round.** Each round has its own 1-N sequence. Drag-and-drop reordering in the admin UI reassigns match numbers.
- **Bracket structure is not modeled.** Finals rounds are flat — rounds have a `type` of `pool` or `finals`, but bracket advancement is handled externally.
- **Points are derived, never stored.** Standings are calculated at query time from `sm5_game_team.result` and scores.
- **Mercenaries are flagged on the scorecard.** A player subbing in outside their registered roster gets `sm5_scorecard.is_mercenary = true`. Mercenary scorecards are excluded from aggregate competition stats.
- **Multi-center support.** Games in a competition can be played at different centers with no constraint.

---

## Schema

### `competition` (pre-existing)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | |
| `type` | enum | `"competitive"` or `"social"` |
| `host_center_id` | uuid FK → center | nullable |
| `start_date` | date | |
| `end_date` | date | nullable |
| `description` | text | nullable |

### `competition_team`

One row per team per competition. Teams do not persist across competitions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `competition_id` | uuid FK → competition | cascade delete |
| `name` | text | |
| `short_name` | text | nullable |

**Unique:** `(competition_id, name)`

### `competition_team_player`

Official roster for a team within a competition. Used to detect mercenary appearances and build per-team stats.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `competition_team_id` | uuid FK → competition_team | cascade delete |
| `player_id` | uuid FK → player | |

**Unique:** `(competition_team_id, player_id)`

### `competition_round`

A named phase of a competition (e.g. "Round 1", "Quarterfinals"). Rounds are ordered by `round_number`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `competition_id` | uuid FK → competition | cascade delete |
| `name` | text | |
| `round_number` | integer | Sort order |
| `type` | enum | `"pool"` or `"finals"` |

**Unique:** `(competition_id, round_number)`

### `competition_match`

A match between two teams within a round. A match consists of 2 games where the teams swap colors.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `competition_id` | uuid FK → competition | Denormalized for query convenience |
| `round_id` | uuid FK → competition_round | cascade delete |
| `match_number` | integer | Per-round sequence; drag-and-drop reorderable |
| `team1_id` | uuid FK → competition_team | Arbitrary stable label |
| `team2_id` | uuid FK → competition_team | |
| `scheduled_time` | timestamp | nullable |

**Unique:** `(round_id, match_number)`

### `competition_match_game`

Links an ingested game to a match slot and records which color each team played in that game.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `match_id` | uuid FK → competition_match | cascade delete |
| `game_id` | uuid FK → game | cascade delete |
| `game_number` | integer | 1 or 2 |
| `team1_game_team_id` | uuid FK → sm5_game_team | Which `sm5_game_team` row is `match.team1` in this game |
| `team2_game_team_id` | uuid FK → sm5_game_team | Which `sm5_game_team` row is `match.team2` in this game |

**Unique:** `(match_id, game_number)` — one game per slot  
**Unique:** `(game_id)` — a game belongs to at most one match

`team1_game_team_id` / `team2_game_team_id` are the critical join point between competition team identity and per-game color assignments.

### `sm5_scorecard.is_mercenary` (added column)

`boolean NOT NULL DEFAULT false`. Set to true when a player subs in for a team but is not on that team's official roster. Mercenary scorecards are excluded when aggregating a player's competition stats.

---

## Entity Relationships

```
competition
  ├── competition_team ──── competition_team_player ──── player
  └── competition_round
        └── competition_match (team1_id, team2_id → competition_team)
              └── competition_match_game
                    ├── game.id
                    ├── sm5_game_team (team1_game_team_id)
                    └── sm5_game_team (team2_game_team_id)

game.competition_id ──── competition   (denormalized; set when game is bulk-assigned)
sm5_scorecard.is_mercenary             (inline merc flag; no separate table)
```

---

## Points Calculation

Points are derived at query time — never stored. For each match:

1. Fetch both `competition_match_game` rows.
2. For each game, look up `sm5_game_team.result`, `score`, and `elimination_bonus` for each side via `team1/2_game_team_id`.
3. **Game points:** win = 2, draw = 1 each, loss = 0.
4. **Match bonus:** compare combined totals (`score + elimination_bonus`) across both games. Winner gets +2; draw gives +1 each.
5. Sum per team across all matches in a round or the full competition for standings.

---

## Mercenary Rules

A player is a mercenary for a competition game when:
- They appear in a `sm5_scorecard` for a game linked to the competition, **and**
- `sm5_scorecard.is_mercenary = true`

Mercenary scorecards are excluded from:
- The player's aggregate competition stats
- Any per-team competition stat totals

Mercenary games are not excluded from the game record itself — the scorecards exist and are visible on the game page, but are flagged so queries can filter them out.

---

## Game Display Conventions

Games assigned to a match are displayed throughout the UI using the structured label:

> **Round 1 · Match 3 · Game 2 · Team Alpha vs Team Bravo**

The team names in this label come from `competition_team.name` (resolved via `competition_match_game` → `competition_match` → `competition_team`), not from the raw `sm5_game_team.name` (e.g. "Red Team").

---

## Admin Workflow

1. Create a competition (`/admin/competitions/new`)
2. Bulk-assign games to the competition by center + date range
3. Add teams and their rosters (`/admin/competitions/[id]/teams`)
4. Create rounds and matches (`/admin/competitions/[id]/rounds`)
5. Assign games to match slots — either from the match detail page or directly on the game page
6. Mark any sub-in players as mercenaries on their individual scorecards

Games can also be assigned to a competition and to a match slot directly from the game detail page (`/games/[slug]`) by admins and center admins.
