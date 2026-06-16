# Laserball Scorecard Table Spec

Per-player stat definitions for the `lb_scorecard` table. One row per player per game. Laserball
has no roles/positions, so **every stat applies to every player** and is stored `NOT NULL`
(there is no null-vs-zero ambiguity as in SM5).

All stats are a faithful port of the European reference implementation
(`demo_files/laserball-code/process_logs.php`); the cited line numbers are the authoritative
source for each computation. See [laserball-chomper-design.md](laserball-chomper-design.md) for
the simulation overview.

## Identity & context

| Column           | Meaning                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| `game_id`        | FK → `game`.                                                                          |
| `player_id`      | FK → `player`; null for guests without an iplId (`#…`).                               |
| `team_id`        | FK → `lb_game_team`.                                                                  |
| `battlesuit_id`  | FK → `battlesuit`; null if unknown.                                                   |
| `ipl_id`         | Denormalized `#…` identity; null for non-`#` players.                                 |
| `callsign`       | In-game name.                                                                         |
| `time_played_ms` | Last-seen minus first-seen action time (php:641). Players ≤30s are dropped (php:646). |
| `end_time`       | ms of the player's last-seen action (relative to mission start).                      |

## Offensive

| Column                | Meaning                                                                           | Source          |
| --------------------- | --------------------------------------------------------------------------------- | --------------- |
| `goals`               | Goals scored (`1101`/`1102` as actor).                                            | php:554         |
| `big_goals`           | Goals preceded by ≥3 aggressive actions within 5s.                                | php:556-560     |
| `assists1`            | Last non-clear passer in the ≤10s pass chain before a goal.                       | php:569-570     |
| `assists2`            | Second-to-last non-clear passer (if distinct from scorer & assist1).              | php:571-574     |
| `clear_assists1`      | As `assists1` but the assisting pass was a clear (`1109`).                        | php:570         |
| `clear_assists2`      | As `assists2` but via a clear.                                                    | php:573         |
| `passes_done`         | Passes thrown (`1100` as actor).                                                  | php:411         |
| `passes_received`     | Passes caught (`1100` as target).                                                 | php:412         |
| `pass_over_opponent`  | Passer credited when a steal-back chain leads to a goal within 3s.                | php:601-606     |
| `turnover_pass`       | Pass whose receiver lost the ball to a steal within 1s.                           | php:403,427-430 |
| `futile_attacks`      | Steal victim cleared within `MARNE_LIMIT` (5s) of the steal.                      | php:548-549     |
| `futile_attacks_goal` | A futile attack that was followed by a goal within 5s.                            | php:597-599     |
| `bad_attacks_fc`      | Steal followed by a failed clear within 5s (decremented if a real clear follows). | php:400,464-466 |

## Clearing / possession

| Column                   | Meaning                                                                                       | Source      |
| ------------------------ | --------------------------------------------------------------------------------------------- | ----------- |
| `clears_done`            | Clears thrown (`1109` as actor).                                                              | php:411     |
| `clears_received`        | Clears caught (`1109` as target).                                                             | php:412     |
| `clutch_saves`           | A clear within 3s of being blocked, or a block within 3s of clearing.                         | php:406,520 |
| `failed_clears_raw`      | Raw count of failed-clear events (`110A`).                                                    | php:460     |
| `failed_clears_calc`     | Failed clears de-duplicated within a respawn-adjusted cooldown.                               | php:468-472 |
| `inactive_clear_penalty` | Penalty when a teammate was inactive (down/recent) at a failed clear.                         | php:478-508 |
| `no_clear_goal`          | Goal conceded after a steal that followed this player's failed clear.                         | php:608-610 |
| `no_clear_blocks`        | Blocks/steals on an inactive teammate following their failed clear (credited to the blocker). | php:503     |
| `defense_score`          | Decremented by 1 for each opponent goal while on defense (negative accumulates).              | php:580-588 |

## Defensive / blocking

| Column                  | Meaning                                                                   | Source              |
| ----------------------- | ------------------------------------------------------------------------- | ------------------- |
| `steals_done`           | Steals (`1103` as actor).                                                 | php:417             |
| `steals_received`       | Lost the ball to a steal (`1103` as target).                              | php:418             |
| `blocks_done`           | Blocks on an active player (`1104`, target not in state 2).               | php:535             |
| `blocks_received`       | Tagged by a block (target side).                                          | php:536             |
| `blocks_with_ball`      | Blocks made while holding the ball.                                       | php:539             |
| `blocks_before_goal`    | Blocks by the scoring team within the block-before-goal window.           | php:591-595         |
| `reset_blocks_done`     | Blocks on a player already in reset state (state 2).                      | php:531             |
| `reset_blocks_received` | Tagged while in reset state.                                              | php:532             |
| `block_serie_max`       | Longest consecutive run of steals+blocks without conceding possession.    | php:422-423,517-518 |
| `big_mid`               | Count of 3-aggressive-action combos within a 3s sliding window.           | php:286-291         |
| `reset_point`           | Awarded when a shooter resets a different reset-state target than before. | php:526-530         |

## Possession / misc

| Column                | Meaning                                                         | Source              |
| --------------------- | --------------------------------------------------------------- | ------------------- |
| `possession_time_ms`  | Total time holding the ball.                                    | php:370-373,624-627 |
| `misses`              | Missed shots (`0201`).                                          | php:391             |
| `target_reset_self`   | Self target resets (`110B`).                                    | php:392             |
| `target_reset_player` | Times this player was reset (`110C` as target).                 | php:393             |
| `start_round_ball`    | Times this player started a round with the ball (`1107`).       | php:394             |
| `start_round_loss`    | Times this player lost the ball on the first action of a round. | php:434-436         |
| `ball_timeout`        | Possessions ended by timeout (`1108`) while holding.            | php:363-365         |

## State counts (from line type 9; 0 when line 9 absent)

| Column   | Meaning                                             | Source      |
| -------- | --------------------------------------------------- | ----------- |
| `state0` | Transitions into active state.                      | php:336-338 |
| `state2` | Transitions into down/resettable state (codes 1/2). | php:335     |
| `state3` | Transitions into down state (code 3).               | php:330     |

## Team & game level

`lb_game_team.score` = sum of the team's players' `goals` (cross-checked against line-5 score
events). `lb_game_team.result` is `win`/`loss`/`draw`. `game.outcome` is `score` (unequal
totals) or `draw` (equal); `aborted` is reserved for games with fewer than two competing teams.
