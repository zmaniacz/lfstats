# Player Rating

The global SM5 player ranking: what it computes, how it was chosen, and how to change it.

This is the engineering document. The player-facing explanation is the `/about-rating` page
(`apps/web/src/app/about-rating/page.tsx`) — keep the two consistent when the model changes.

---

## What it is

A regularised **Bradley-Terry** model, fitted in batch over a rolling window:

```
P(A beats B) = sigmoid( Σ_{i∈A} θ_i − Σ_{j∈B} θ_j )
```

minimising weighted log-loss plus an L2 penalty pulling `θ` toward 0. Each player has one
parameter `θ`; the fit solves for all of them simultaneously so that the predicted results
best match the recorded ones.

Implementation: `packages/db/src/lib/rating.ts` (`computeRatings`). Pure functions over plain
data, no database access.

### Why batch and not online

Elo and TrueSkill/Weng-Lin update player by player as games arrive. Bradley-Terry solves the
whole system at once. That has three consequences that decided the choice:

- **It separates a player from their teammates.** This is inherent to a joint fit, and is the
  property that makes the rating fair to someone stuck on weak teams. No per-player performance
  stat is needed to achieve it.
- **It has no ordering dependence.** `game.start_time` is center-local with no timezone applied
  (see [Core_Schema.md](Core_Schema.md)), so a globally-ordered stream is only approximate. A
  batch fit does not care.
- **There is no correct incremental update.** One new game shifts every player's number. This is
  why the recompute is a full replay — see below.

### Inputs

| Input   | Source                                             | Notes                                                                                                  |
| ------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Outcome | `sm5_game_team.result`                             | Authoritative. Never derived from score — an eliminated team is `loss` even when its score is higher.  |
| Rosters | `sm5_scorecard.team_id` → `sm5_game_team.id`       | `is_neutral = true` rows are always excluded.                                                          |
| Margin  | `sm5_game_team.score`                              | Raw score only. `elimination_bonus` would make the distribution bimodal and swamp the continuous part. |
| Context | `competition_round.multiplier`, `competition.type` | Social games are down-weighted; competition games use the round's own multiplier.                      |

Hard filters: `game.exclude = false`, `game.outcome NOT IN ('aborted','replay','forfeit')`,
`lower(game.type) = 'sm5'`, exactly two non-neutral sides each with a recorded result.

**Guests** (`sm5_scorecard.player_id IS NULL`) share one pooled parameter. They cannot be
tracked across games, but they occupy a team slot — dropping them would systematically
understate whichever side they played on.

### Not inputs

- **MVP.** Tested extensively and rejected; see [Why MVP is not used](#why-mvp-is-not-used).
- **Position.** The model only asks who won, so Commanders and Medics share one scale.
- **Laserball.** `lb_scorecard` has no MVP and no positions; rating it is a separate design.

---

## Parameters

Stored as jsonb on `sm5_rating_model`, seeded by migration `0048` and amended by `0049`.
`DEFAULT_RATING_PARAMETERS` in `lib/rating.ts` supplies fallbacks for keys an older model row
predates.

| Key                | Value   | Meaning                                                                                                                        |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `l2`               | 1.0     | Ridge strength. Keeps a 50-game player from landing at ±∞ — the failure mode of unregularised Bradley-Terry on a sparse graph. |
| `iterations`       | 400     | Adam steps. The objective is convex, so there is one optimum.                                                                  |
| `learningRate`     | 0.05    | Adam step size.                                                                                                                |
| `marginSource`     | `score` | Margin-of-victory signal.                                                                                                      |
| `marginGamma`      | 0.25    | Margin strength. 0 disables it.                                                                                                |
| `socialWeight`     | 0.25    | Weight for social/nightly games relative to competition.                                                                       |
| `windowMonths`     | 24      | Rolling window length.                                                                                                         |
| `minGames`         | 50      | Games required in-window to be rated.                                                                                          |
| `boardSize`        | 100     | Rows the board publishes.                                                                                                      |
| `groupedHead`      | 25      | Leading rows the board draws band rules across.                                                                                |
| `bandWidth`        | 0.25    | Width of a display band, in rating points.                                                                                     |
| `bootstrapSamples` | 200     | Bootstrap replicates for standard errors.                                                                                      |

Changing any of these is a jsonb edit plus a recompute — no code change.

---

## How the model was chosen

`packages/db/src/scripts/rating/` is a standalone bake-off harness that compares candidate
models against the real database. It writes a timestamped report to `packages/db/logs/`.

```bash
pnpm --filter @lfstats/db rating-bakeoff --synthetic   # self-test, no DB
pnpm --filter @lfstats/db rating-bakeoff --bootstrap=200
```

It evaluates **prequentially**: games are walked in chronological order, each test game is
predicted using ratings as of just before it, scored, and only then used to update. Leak-free,
and it scores every test game rather than one held-out slice.

### Results on 8,554 SM5 games (2019-11 → 2026-08)

Primary metric is log-loss; a coin flip is 0.6931.

| Model                             | Log-loss   | Teammate-luck bias |
| --------------------------------- | ---------- | ------------------ |
| Career win rate                   | 0.6779     | 0.421              |
| Elo (K=24)                        | 0.6416     | 0.349              |
| Weng-Lin (TrueSkill-family)       | 0.6467     | 0.211              |
| Weng-Lin + MVP credit-sharing     | 0.6788     | 0.018              |
| **Batch Bradley-Terry**           | **0.6329** | **0.089**          |
| Batch BT + margin weight (γ=0.25) | 0.6315     | 0.087              |

**Teammate-luck bias** is the correlation between how strong a player's teammates were and how
far their rating departs from known true skill, measured on synthetic data where team
assignment is random and any correlation is therefore the model mistaking luck for skill. Lower
is fairer. It is only measurable on synthetic data — on real data, strong players genuinely
cluster together, which would confound luck with ability.

### Why MVP is not used

Two ways of folding MVP in were tested, both using the within-team contrast
`(z_i − z̄_T)` so that team-level effects cancel:

1. **Additive redistribution** — add a zero-sum correction to each player's share of the team's
   rating movement. Degraded prediction at every strength tested, and destabilised badly at
   higher weights: rating spread exploded (sd 5.7 → 77.5) while mean uncertainty _rose_. The
   correction has no restoring force, so it accumulates as a random walk; divergent ratings then
   produce confident predictions, which drives `p·(1−p)` → 0, which stops uncertainty shrinking,
   which enlarges the next update.
2. **Bounded per-player outcome** — blend the team result toward the player's MVP contrast and
   clamp to [0,1]. Better behaved at every setting, but still never beat λ=0.

The best λ found was ≈0.02, worth 0.002 log-loss — inside noise. Notably, MVP weighting _raises_
accuracy (63.1% vs 61.2%) while worsening calibration, which says the MVP contrast carries real
signal but the update magnitude built on it is wrong.

The fairness motivation behind MVP-sharing is genuine, and the batch fit addresses it directly:
Bradley-Terry reaches 0.089 teammate-luck bias without MVP at all, against Weng-Lin's 0.211.

### Margin of victory

Two encodings were tested:

- **Sample weight** (`marginGamma`) — improved both overall log-loss (0.6329 → 0.6315) and
  cross-center (0.5389 → 0.5362). **This is what ships.**
- **Soft label** — better overall (0.6252) but _worse_ cross-center (0.5531). Tournament games
  are tight; pulling a genuine win toward 0.5 on a narrow margin discards information exactly
  where it matters most for a global ranking.

Cross-center is the metric to optimise for a global board, so the weight form wins even though
the label form has the better headline number. **If the auto-selected "best" model in a future
bake-off report disagrees with this, prefer cross-center.**

---

## Precision, and why ranks are banded

The board prints exact ranks, but only the leading few are separable.

| Top 25                              | Value             |
| ----------------------------------- | ----------------- |
| Median gap between adjacent players | 0.022             |
| Median bootstrap standard error     | 0.127             |
| Only gap clearing 1 SE              | rank 1 → 2 (2.6×) |

Gaps are roughly six times smaller than the noise. This is a property of the player population,
not a modelling limitation — raising the games minimum from 100 to 200 barely moved rank ranges,
because the constraint is player density, not sample size.

Significance-based grouping (a rule only where two players are separated by more than the noise)
was therefore abandoned: it collapses to a single boundary under the leader. Bootstrapping the
_difference_ between adjacent players rather than combining their individual errors — correct,
since the two estimates are positively correlated through the joint fit — does not change it.

The board uses **fixed rating bands** instead. These are presentational, labelled as ranges
(`1.00 – 1.25`), and must never be described as tiers of demonstrated difference.

Bootstrap standard errors are stored per player in `player_rating.standard_error` and are
available for a rank-range display on player pages.

---

## Schema

Migration `0048_global_player_rating.sql`, amended by `0049_rating_display_bands.sql`.

- **`sm5_rating_model`** — versioned parameters, mirroring `sm5_mvp_model`. Every rating row
  records which version produced it, so a re-model cannot silently reinterpret published numbers.
- **`player_rating`** — one row per qualifying player per model version. Unique on
  `(player_id, rating_model_id)`; indexed on `rank`.
  - `rating_group` is the band index (`floor(rating / bandWidth)`), computed for **every**
    player. The band is a fact about the rating; the board decides where it draws rules.

---

## Recompute

```bash
pnpm --filter @lfstats/db recalc-rating
pnpm --filter @lfstats/db recalc-rating --dry-run     # compute and print, write nothing
pnpm --filter @lfstats/db recalc-rating --window=36   # override window months
```

`packages/db/src/scripts/recalc-rating.ts`. Roughly 22 seconds for ~3,700 games including the
bootstrap — cheap enough to schedule nightly.

**Always a full replay, never incremental.** Beyond the fact that a batch fit has no correct
incremental update, replaying is what keeps the board honest for free: penalty edits
(`recalculateGameResult`), reingests, and `exclude` flips all change past results, and a replay
picks up every one without a bespoke invalidation path.

`replacePlayerRatings` deletes and reinserts inside one transaction rather than upserting —
players who drop out of the window or below the games minimum must disappear from the board, and
an upsert would leave them stranded at a stale rank.

The script refuses to publish an empty ranking (no games in window, or nobody meeting the
minimum) rather than blanking the board.

> **New environments:** `getGlobalRankings` returns null only when the tables are empty and the
> page shows an empty state — but the recompute must be run once after migrating, or `/rankings`
> has nothing to show.

### In production

Nightly, by cron on the deploy host, running the `ghcr.io/zmaniacz/lfstats-jobs` image as a
one-shot container. It cannot run inside the web container — that image is a Next.js standalone
build with neither the scripts nor `tsx`. See
[build-and-deploy.md § Scheduled Jobs](build-and-deploy.md#scheduled-jobs) for the compose
service and the crontab entry.

The scheduled run does the full bootstrap. That is most of the ~22s, and `standard_error` is
currently stored but unused by the board — set `bootstrapSamples` to 0 in the model parameters
to make the job near-instant if that trade ever becomes worth making.

---

## Related

- [Core_Schema.md](Core_Schema.md) — `game`, `sm5_game_team`, `sm5_scorecard` definitions.
- [Scorecard_Table_Spec.md](Scorecard_Table_Spec.md) — MVP and per-player stats.
- [Competition_Structure.md](Competition_Structure.md) — rounds and multipliers.
