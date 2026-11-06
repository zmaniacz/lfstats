# MVP2027 — Proposal to the Tournament Committee

**Status:** Draft, phase 1 (design document). Nothing here changes the live formula yet.
**Current model:** `2021.12` (`sm5_mvp_model`), the only model in production.
**Data as of:** 2026-11-04.

MVP2027 is a data-driven review of how SM5 MVP points are calculated. TDF files now give us
far more detail than the end-of-game totals MVP was designed around, and seven years of games
on record let us check each part of the formula against how it actually behaves. This document
sets out what MVP is for, where each position stands today, and what makes up each position's
score. Recommendations are developed position by position in the sections that follow.

---

## 1. Design goals

### What MVP is for

Score was originally the only way to measure a player, and it measures badly. It swings with
position and with game flow: a fast elimination produces low scores even though it is the best
result a team can get. MVP was created to take a player's game stats and combine them into one
number that compares players fairly — across positions, and across games that played out
differently.

### The goals

1. **One comparable number.** MVP should rank players' contribution in a game, regardless of
   which position they played or how the game ended.
2. **Centred on 15.** The average player at every position should score about **15**, with the
   middle half of games (interquartile range) falling roughly between **10 and 20**. A player's
   MVP should mean the same thing whether they played Commander or Medic.
3. **A consequence of good play, never a target of its own.** MVP should only reward what a
   player does while trying to win. Nothing in it should pay a player to do something outside
   normal gameplay. The cautionary example: Scouts once earned MVP for activating rapid fire,
   and the result was Scouts standing in a corner at the end of a game activating rapid fire
   over and over. Any stat that can be farmed without helping the team does not belong in MVP.
4. **Reward the role, not just the trigger.** Each position has a job. Its MVP should reflect
   how well that job was done, not only how often a button was pressed.
5. **Explainable.** Players and referees should be able to read a scorecard's MVP breakdown and
   understand why it came out the way it did. Every component is stored individually
   (`sm5_scorecard_mvp`) and shown on the game page; MVP2027 should keep that property. MVP
   points are calculated only from the game data, with no referee or other subjective judgement
   (penalties stay a separate, existing deduction).
6. **Robust to game flow.** Short games, eliminations, and lopsided matchups should not push a
   good performance far below 15 or a poor one far above it.

### Target configuration: the standard 6v6 game

MVP is designed and tuned for the **standard SM5 configuration: two teams of six, each with one
Commander, one Heavy, two Scouts, one Ammo carrier and one Medic.** Every figure in this document,
and every simulation of a proposed change, uses only games that match that configuration exactly.

Games with other team sizes or lineups (7v7, 5v5, uneven teams, doubled positions) still receive
MVP, but the formula is not balanced for them: with more or fewer players, opportunities for
medic hits, missiles, boosts and eliminations change in ways a single formula cannot correct for.
Of the 9,326 non-excluded SM5 games on record, **5,202 (56%) are standard 6v6**. The rest are
mostly 7v7 (1,491), 5v5 (1,178), 8v8 (392) and uneven teams.

### New for MVP2027: in-game data

The 2021 formula uses only stats that can be read off an end-of-game scorecard. TDF files record
every event with a timestamp, and LFstats already stores them as replay data (`sm5_game_event`)
and as per-player state over time (`sm5_game_player_state`: score, lives, shots, missiles, SP,
rapid fire, nuking, eliminated). That means MVP2027 can consider _how and when_ things happened —
for example who a hit landed on, what it led to, or what state the game was in — not just how
many times. The same goal 3 test applies to anything drawn from that data.

---

## 2. Where each position stands today

Standard 6v6 games only, 2019-11-18 to 2026-11-04: **5,202 games, 62,424 scorecards**
(3,763 social, 1,439 competition). Two Scouts play per team, so Scout has twice the sample of the
other positions.

| Position  | Scorecards | Mean  | Std dev | P10  | Q1    | Median | Q3    | P90   | Min   | Max   |
| --------- | ---------- | ----- | ------- | ---- | ----- | ------ | ----- | ----- | ----- | ----- |
| Commander | 10,404     | 17.23 | 6.95    | 8.60 | 12.00 | 16.60  | 22.10 | 26.84 | -2.60 | 52.78 |
| Heavy     | 10,404     | 15.26 | 7.18    | 6.80 | 9.64  | 14.20  | 20.13 | 25.60 | -2.40 | 41.86 |
| Scout     | 20,808     | 14.24 | 5.88    | 7.10 | 9.80  | 13.65  | 18.32 | 22.24 | -3.00 | 45.30 |
| Ammo      | 10,404     | 14.66 | 5.37    | 8.10 | 10.70 | 14.42  | 18.24 | 21.63 | -1.00 | 40.78 |
| Medic     | 10,404     | 16.30 | 5.91    | 9.30 | 12.08 | 15.51  | 19.78 | 24.18 | 0.00  | 49.04 |

### Social vs competition

| Position  | Social median (IQR) | Competition median (IQR) |
| --------- | ------------------- | ------------------------ |
| Commander | 16.20 (11.90–21.56) | 17.65 (12.20–23.71)      |
| Heavy     | 13.98 (9.60–19.58)  | 15.00 (9.90–21.52)       |
| Scout     | 13.40 (9.70–17.92)  | 14.40 (10.10–19.16)      |
| Ammo      | 14.30 (10.80–17.86) | 14.70 (10.60–18.82)      |
| Medic     | 15.42 (12.10–19.48) | 15.81 (12.00–20.65)      |

Competition games run about a point higher for Commander, Heavy and Scout and are otherwise
consistent with social play, so one formula can serve both.

### Against the goals

- **Commander runs high.** Median 16.6 and mean 17.2 — the highest of any position — with a
  wide spread (IQR ≈ 10.1, upper quartile at 22.1). In competition the median reaches 17.7.
- **Scout runs low.** Median 13.7, the lowest of any position, and the lowest at the top end
  (P90 22.2).
- **Heavy is widest.** IQR ≈ 10.5 and the lowest P10 (6.8): a Heavy's MVP depends more on how
  the game went than any other position's.
- **Ammo is narrowest.** IQR ≈ 7.5, median 14.4. Close to target, but bunched — good and poor
  games are hard to tell apart.
- **Medic is closest to target** on median (15.5), with a high floor (P10 9.3).
- **Penalties are not a factor.** Penalty MVP deductions (`sm5_game_penalty.mvp_value`, stored
  separately from `mvp_points`) average under 0.02 points per game at every position.

---

## 3. What makes up MVP today (model 2021.12)

### Components that apply to every position

| Component                 | Rule                                                                        |
| ------------------------- | --------------------------------------------------------------------------- |
| Accuracy                  | +0.1 per accuracy percentage point (rounded), so 75% accuracy = 7.5         |
| Opponent medic hits       | +1 per shot that hit the opposing Medic                                     |
| Own medic hits            | −1 per shot that hit your own Medic                                         |
| Elimination bonus         | Team won by elimination: +4, plus +1 per minute beyond 3 minutes remaining  |
| Nukes canceled            | +3 per opponent nuke you canceled                                           |
| Own team's nukes canceled | −3 per own-team nuke you canceled                                           |
| Times missiled            | −1 per missile that hit you                                                 |
| Eliminated                | −1 if eliminated (all positions except Medic)                               |
| Score bonus               | Per-position: points per 1,000 score above a position threshold (see below) |

### Position-specific components

| Position  | Component                  | Rule                          | Score bonus             |
| --------- | -------------------------- | ----------------------------- | ----------------------- |
| Commander | Missile hits               | +1 per missile on an opponent | +1 / 1,000 above 10,000 |
|           | Nukes detonated            | +1 per nuke                   |                         |
|           | Nukes canceled by opponent | −1 per nuke of yours canceled |                         |
| Heavy     | Missile hits               | +2 per missile on an opponent | +1 / 1,000 above 7,000  |
| Scout     | 3-hit shots                | +0.2 per 3-hit on an opponent | +1 / 1,000 above 6,000  |
| Ammo      | Ammo boosts                | +3 per ammo boost             | +1 / 1,000 above 3,000  |
| Medic     | Life boosts                | +3 per life boost             | +2 / 1,000 above 2,000  |
|           | Survival bonus             | +2 if not eliminated          |                         |

### Average contribution by position

Average points per game from each component, its share of the position's mean MVP, how often it
is non-zero, its standard deviation, and its correlation with the player's total MVP. A component
with a large average but a small standard deviation adds roughly the same amount to every
player — it moves the position's level but does little to separate a good game from a poor one.
The correlation column shows which components actually drive the ranking within a position.

#### Commander (mean 17.23)

| Component                  | Avg pts | Share | Non-zero | Std dev | r vs total |
| -------------------------- | ------- | ----- | -------- | ------- | ---------- |
| Accuracy                   | 7.86    | 45.6% | 99.9%    | 1.01    | 0.46       |
| Opponent medic hits        | 3.70    | 21.5% | 91.6%    | 2.48    | 0.67       |
| Nukes detonated            | 2.96    | 17.2% | 97.6%    | 1.10    | 0.62       |
| Missile hits               | 2.35    | 13.6% | 80.8%    | 1.72    | 0.66       |
| Elimination bonus          | 1.32    | 7.7%  | 25.7%    | 2.41    | 0.64       |
| Score bonus                | 0.52    | 3.0%  | 33.0%    | 1.04    | 0.54       |
| Nukes canceled             | 0.15    | 0.9%  | 4.8%     | 0.66    | 0.19       |
| Own medic hits             | −0.06   | −0.4% | 6.1%     | 0.26    | 0.06       |
| Nukes canceled by opponent | −0.12   | −0.7% | 11.1%    | 0.34    | 0.17       |
| Eliminated                 | −0.31   | −1.8% | 30.9%    | 0.46    | 0.46       |
| Times missiled             | −1.14   | −6.6% | 62.2%    | 1.21    | 0.39       |

#### Heavy (mean 15.26)

| Component           | Avg pts | Share | Non-zero | Std dev | r vs total |
| ------------------- | ------- | ----- | -------- | ------- | ---------- |
| Accuracy            | 8.38    | 54.9% | 99.9%    | 0.97    | 0.40       |
| Missile hits        | 3.73    | 24.4% | 72.1%    | 3.32    | 0.80       |
| Opponent medic hits | 2.60    | 17.0% | 80.3%    | 2.27    | 0.63       |
| Elimination bonus   | 1.32    | 8.7%  | 25.7%    | 2.41    | 0.55       |
| Score bonus         | 0.52    | 3.4%  | 34.8%    | 1.02    | 0.59       |
| Nukes canceled      | 0.11    | 0.7%  | 3.7%     | 0.59    | 0.18       |
| Own medic hits      | −0.08   | −0.5% | 7.1%     | 0.29    | 0.06       |
| Eliminated          | −0.38   | −2.5% | 38.2%    | 0.49    | 0.48       |
| Times missiled      | −0.94   | −6.1% | 54.3%    | 1.12    | 0.37       |

#### Scout (mean 14.24)

| Component           | Avg pts | Share | Non-zero | Std dev | r vs total |
| ------------------- | ------- | ----- | -------- | ------- | ---------- |
| Accuracy            | 6.97    | 48.9% | 99.9%    | 1.37    | 0.45       |
| 3-hit shots         | 4.74    | 33.3% | 99.7%    | 2.50    | 0.69       |
| Opponent medic hits | 1.94    | 13.7% | 74.3%    | 1.85    | 0.63       |
| Elimination bonus   | 1.32    | 9.3%  | 25.7%    | 2.41    | 0.50       |
| Score bonus         | 0.45    | 3.1%  | 33.0%    | 0.92    | 0.63       |
| Nukes canceled      | 0.03    | 0.2%  | 1.1%     | 0.31    | 0.12       |
| Own medic hits      | −0.06   | −0.4% | 5.3%     | 0.24    | 0.07       |
| Eliminated          | −0.39   | −2.7% | 38.7%    | 0.49    | 0.47       |
| Times missiled      | −0.78   | −5.5% | 50.2%    | 0.97    | 0.31       |

#### Ammo (mean 14.66)

| Component                 | Avg pts | Share | Non-zero | Std dev | r vs total |
| ------------------------- | ------- | ----- | -------- | ------- | ---------- |
| Accuracy                  | 8.12    | 55.4% | 100.0%   | 1.18    | 0.14       |
| Ammo boosts               | 4.75    | 32.4% | 87.7%    | 3.02    | 0.77       |
| Elimination bonus         | 1.32    | 9.0%  | 25.7%    | 2.41    | 0.50       |
| Score bonus               | 0.86    | 5.9%  | 66.6%    | 1.07    | 0.76       |
| Opponent medic hits       | 0.46    | 3.1%  | 30.4%    | 0.85    | 0.43       |
| Nukes canceled            | 0.02    | 0.1%  | 0.5%     | 0.22    | 0.11       |
| Own team's nukes canceled | −0.02   | −0.1% | 0.7%     | 0.24    | 0.04       |
| Own medic hits            | −0.05   | −0.4% | 5.1%     | 0.24    | 0.06       |
| Eliminated                | −0.39   | −2.6% | 38.7%    | 0.49    | 0.48       |
| Times missiled            | −0.41   | −2.8% | 31.3%    | 0.69    | 0.31       |

#### Medic (mean 16.30)

| Component                 | Avg pts | Share | Non-zero | Std dev | r vs total |
| ------------------------- | ------- | ----- | -------- | ------- | ---------- |
| Accuracy                  | 9.00    | 55.2% | 100.0%   | 0.60    | 0.10       |
| Life boosts               | 3.97    | 24.4% | 81.5%    | 2.90    | 0.81       |
| Score bonus               | 1.37    | 8.4%  | 72.8%    | 1.53    | 0.83       |
| Elimination bonus         | 1.32    | 8.1%  | 25.7%    | 2.41    | 0.56       |
| Survival bonus            | 0.64    | 3.9%  | 32.1%    | 0.93    | 0.54       |
| Opponent medic hits       | 0.19    | 1.2%  | 14.3%    | 0.53    | 0.38       |
| Nukes canceled            | 0.01    | 0.1%  | 0.3%     | 0.18    | 0.11       |
| Own team's nukes canceled | −0.02   | −0.1% | 0.5%     | 0.22    | 0.05       |
| Times missiled            | −0.20   | −1.2% | 17.3%    | 0.46    | 0.30       |

### What the breakdown shows

These are observations to frame the position-by-position work, not yet recommendations.

1. **Accuracy is half of every position's MVP but rarely decides it.** It contributes 7.0–9.0
   points (46–55% of the mean) at every position, yet its spread is small (std dev 0.6–1.4).
   For Ammo and Medic it is effectively a flat 8–9 point floor: its correlation with total MVP
   is 0.14 and 0.10. Most of the "15" comes from accuracy; most of the ranking comes from
   elsewhere.
2. **Each position is ranked by one or two counting stats.** Heavy missile hits (r 0.80), Scout
   3-hits (0.69), Ammo boosts (0.77) and Medic life boosts (0.81) dominate their positions'
   spread. Commander is the most balanced: medic hits, missiles and nukes each matter.
3. **Score barely appears.** The score bonus pays out in only about a third of Commander, Heavy
   and Scout games and averages around half a point. It matters more for Ammo and Medic (0.86
   and 1.37 points; correlation ≈ 0.8), where the thresholds are low relative to typical scores.
4. **Winning is mostly absent.** The only team-outcome component is the elimination bonus, the
   same rule for every position. 51.5% of standard games end in an elimination, so the bonus
   goes to about a quarter of all players, averaging 5.1 points when paid (1.3 per player-game
   overall). A win on score earns nothing directly.
5. **Penalties for being on the receiving end are small.** Times missiled (−0.2 to −1.1) and
   eliminated (−0.3 to −0.4) are the only defensive measures. Nothing rewards staying alive,
   holding lives or shots, or avoiding being reset, outside the Medic survival bonus.
6. **Rare events carry large weights.** Nuke cancels are ±3 points but occur in under 5% of
   games, so they add noise to the extremes rather than shaping the distribution. (They are
   kept deliberately; see 4.1.)
7. **Much of the recorded data is unused.** The scorecard already holds resets (`reset_opponent`,
   `missile_reset_opponent`), assists, eliminations caused, deactivations, resupplies given and
   received, SP earned and spent, uptime and downtime, rapid-fire accuracy, and targets
   destroyed. The replay tables add the timing and context of every event. None of it is in
   MVP today.

---

## 4. Position-by-position recommendations

Each section covers the position's role, which current components to keep, re-weight or drop,
candidate new components, and the effect of the proposal when it is replayed over the standard
6v6 games.

### How candidate stats are tested

A stat earns a place in MVP only if it passes all four of these tests:

1. **Does it go with winning?** For each game, compare the two teams' totals for the stat at
   that position, and count how often the team with more of it won. 50% means the stat says
   nothing about the result.
2. **Does it reflect skill?** Correlate each player's career average for the stat at that
   position with their global player rating ([Player_Rating.md](Player_Rating.md)). The rating
   is built only from wins and losses, never from scorecard stats, so it is an independent
   measure of how good a player is. This test separates stats players control from stats that
   only reflect how their team's game went.
3. **Is it consistent?** Split each player's games into two halves and correlate the halves'
   averages. A stat that is mostly luck will not repeat from one half to the other.
4. **Is it safe to reward?** (Goal 3.) It can only be earned by doing something that helps the
   team win, and there is no way to farm it in a game that is already decided.

Tests 2 and 3 use players with at least 20 games at the position and a current rating.

**Accuracy and score are set per position.** They apply to every position today with the same
accuracy weight and a per-position score threshold, but they mean different things for
different roles. Each position section decides its own accuracy weight and score bonus; 4.6
covers only what is truly shared.

**The position sections use today's elimination bonus.** Each position was tuned with the
elimination bonus as it is today. The smaller bonus proposed in 4.6 (U3) lowers every position's
median by 0.2–0.5 points; section 5 shows the combined effect of everything, including U3.

### 4.1 Commander

**Role.** The Commander is the team's leader on the floor: three hit points, missiles, and the
nuke, which costs 20 SP and, if it is not canceled, takes 3 lives from every opponent in the
game.
Commanders earn the most score and SP of any position and are the opposing team's first
target.

**Where Commander stands.** Median 16.60 and mean 17.24, the highest of any position, with an
IQR of 12.0–22.1. In competition the median is 17.65. The spread is about right (IQR width ≈
10); the whole distribution sits roughly **1.6 points too high**.

**What the data says.** 10,390 Commander scorecards from 5,195 decided standard games; 111
players for the skill and consistency tests.

| Stat (Commander)           | Team with more won | r with rating | Consistency | In MVP today            |
| -------------------------- | ------------------ | ------------- | ----------- | ----------------------- |
| Score                      | 77.1%              | **0.78**      | 0.93        | +1 / 1,000 above 10,000 |
| Times reset (fewer)        | 75.5%              | −0.07         | 0.85        | No                      |
| Opponents reset            | 75.1%              | 0.63          | 0.92        | No                      |
| Nukes detonated            | 72.7%              | **0.75**      | 0.90        | +1 each                 |
| Opponents deactivated      | 70.8%              | 0.73          | 0.90        | No                      |
| Missile hits               | 68.3%              | 0.60          | 0.92        | +1 each                 |
| Times missiled (fewer)     | 65.2%              | −0.44         | 0.76        | −1 each                 |
| Opponent medic hits        | 63.1%              | **0.44**      | 0.92        | +1 each                 |
| Accuracy                   | 56.3%              | 0.35          | 0.96        | +0.1 per %              |
| Own nukes canceled (fewer) | 55.0%              | −0.14         | **0.29**    | −1 each                 |
| Opponent nukes canceled    | 51.9%              | 0.28          | **0.18**    | +3 each                 |

(Opponents eliminated scores 81.2%, but mostly because eliminating the other team is how an
elimination win happens; the elimination bonus already pays for that outcome.)

Four things stand out.

- **Medic hits are overweighted for Commanders.** At +1 each they are the second-largest
  Commander component (3.7 points a game, 21.5% of the total), and Commanders land far more of
  them than anyone else: 3.5 a game against 2.4 for Heavy and 1.9 for Scout. Yet for Commanders
  they are the weakest attacking stat on both tests: 63.1% on winning and 0.44 with player
  rating, against 0.60–0.78 for missiles, nukes and score. Hitting the Medic is good play and
  should stay in MVP, but at +1 it inflates Commander MVP for a stat that separates good
  Commanders from average ones less than anything else they do.
- **Nukes are the Commander's best signal.** Nukes detonated tracks skill at 0.75, second only to
  score, and is consistent. It is the Commander's role ability doing its job.
- **Nuke cancels are rare and inconsistent, and are kept on purpose.** Having your own nuke
  canceled (−1, 11% of games) and canceling an opponent's (+3, 5% of games) barely repeat from
  one half of a player's games to the other (0.29 and 0.18), so they fail test 3. They are kept
  anyway, as a deliberate rule rather than a statistical one: a Commander is responsible for
  activating their nukes safely, and losing a nuke usually hurts the team, so a canceled nuke
  should cost MVP. Canceling an opponent's nuke is rare enough, and decisive enough when it
  happens, that it should be worth a large bonus. Both are small on average (−0.12 and +0.15
  points a game), so keeping them does not affect the calibration below.
- **Being reset, again, is not skill.** As for Scouts, times reset goes strongly with losing but
  has no relationship to player rating (−0.07). It is left out.

**Accuracy and score for Commanders.** Accuracy matters more to a Commander than to most
positions: shots are limited, every hit earns SP, and SP buys nukes. The data confirms the
mechanism. Compared at the same rate of fire, a Commander's accuracy has a clear effect on SP
earned per minute (standardised effect 0.57) and nukes detonated per minute (0.44), and win
rate rises steadily with accuracy:

| Commander accuracy  | Nukes detonated | SP earned | Score | Shots fired | Team won |
| ------------------- | --------------- | --------- | ----- | ----------- | -------- |
| Bottom fifth (≤71%) | 2.54            | 63.9      | 7,230 | 92          | 42.2%    |
| 72–78%              | 3.01            | 72.8      | 8,768 | 87          | 47.2%    |
| 78–82%              | 3.09            | 74.4      | 9,114 | 83          | 49.7%    |
| 82–87%              | 3.11            | 74.7      | 9,260 | 79          | 53.1%    |
| Top fifth (≥87%)    | 3.04            | 73.7      | 9,297 | 73          | 57.5%    |

Two things limit how far MVP should lean on it, though.

- **Its payoff is already counted.** The SP that accuracy earns shows up in MVP as nukes detonated
  (+1 each) and as score. Opponent hits, not accuracy, are what drive SP (correlation 0.98), and
  nukes stop rising once accuracy passes about 72%.
- **More accurate Commanders shoot less.** Accuracy and shots fired are negatively correlated
  (−0.27): the top fifth fire 73 shots a game against 92 for the bottom fifth. A steeper accuracy
  reward partly pays a Commander for firing less, which works against the hits and SP it is
  meant to reward.

Every accuracy shape tested (steeper slopes measured from a baseline of 50–70%, an extra
penalty below 72–75%, an extra reward above 80%) ranked Commanders slightly _worse_ than the
current +0.1 per percent once the position was held on target. At +0.1 per percent, accuracy is
already the largest Commander component (7.9 points, 46% of the total), so the recommendation
is to keep it there.

Score is the opposite case. It is the best Commander stat on the skill test (0.78) and is
consistent (0.93), but the bonus only starts at 10,000, which a third of Commanders reach (the
median Commander score is 8,862). Lowering the threshold to 9,000 brings it into play for nearly
half of Commanders (47.7%) and improves ranking. A steeper score bonus (1.5–2 per 1,000) ranked
slightly better still but stretched the spread well past the 10–20 band and leans MVP back
toward raw score, which is what MVP exists to move beyond.

**Recommendations.**

| #   | Change                                           | Detail                                                                                                                     |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Opponent medic hits: +1 → +0.5 for Commander** | Commander only. Removes about 1.75 points on average.                                                                      |
| C2  | **Score bonus threshold: 10,000 → 9,000**        | Still +1 per 1,000 above it. Adds about 0.4 points on average and rewards the Commander's strongest skill stat.            |
| C3  | Keep accuracy at +0.1 per percent                | Already the largest Commander component. Steeper shapes ranked worse; the SP it earns is credited through nukes and score. |
| C4  | Keep nukes canceled by opponent at −1            | Decided: activating nukes safely is the Commander's responsibility.                                                        |
| C5  | Keep opponent nukes canceled at +3               | Decided: rare, and worth rewarding when it happens. Applies to every position.                                             |
| C6  | Keep nukes detonated at +1                       | Strong on every test. A higher weight is the main alternative, below.                                                      |
| C7  | Keep missile hits at +1 and times missiled at −1 | Both pass the tests. Times missiled is the only defensive stat that tracks Commander skill (−0.44).                        |
| C8  | Do not penalise times reset                      | Tracks game flow, not the Commander's own play.                                                                            |

**Effect of C1 + C2, replayed over the standard 6v6 games.**

| Commander MVP | Mean  | P10  | Q1    | Median    | Q3    | P90   |
| ------------- | ----- | ---- | ----- | --------- | ----- | ----- |
| Current       | 17.24 | 8.60 | 12.00 | 16.60     | 22.12 | 26.84 |
| With C1 + C2  | 15.89 | 7.90 | 10.80 | **15.10** | 20.68 | 25.07 |

| Game situation      | Current median (IQR) | With C1 + C2 median (IQR) |
| ------------------- | -------------------- | ------------------------- |
| Social              | 16.20 (11.90–21.57)  | 14.82 (10.73–20.18)       |
| Competition         | 17.65 (12.20–23.71)  | 16.23 (10.90–22.06)       |
| Won by elimination  | 24.79 (21.59–28.15)  | 23.17 (20.06–26.28)       |
| Won on score        | 16.80 (13.20–20.62)  | 15.70 (12.10–19.54)       |
| Lost on score       | 14.25 (10.80–17.80)  | 12.95 (9.72–16.36)        |
| Lost by elimination | 12.10 (9.10–15.40)   | 10.80 (8.20–13.60)        |

C1 + C2 put Commander on target: median 15.10, IQR 10.8–20.7. Ranking quality improves:
compared Commander against Commander across the two teams, the higher MVP belongs to the winning
team 81.8% of the time (81.1% today), and the correlation between career Commander MVP and
player rating rises from 0.72 to 0.75.

**Alternative: move more weight from medic hits to nukes.** Opponent medic hits at +0.25 with
nukes detonated at +1.5 (tested without C2) gives median 15.35, IQR 11.3–20.8, the same 81.8%
on winning, and a skill correlation of 0.76. It rewards the Commander's role ability more
directly (goal 4). The case against it is that cutting medic hits to a quarter point may read
to players as "stop shooting the Medic", which is not the intent, and that a bigger nuke reward
slightly raises the value of nuking in games that are already decided.

**One thing to watch: Commanders in elimination wins.** A Commander whose team wins by
elimination has a median MVP of 24.8 today (Scouts in the same games: 19.2). C1 + C2 bring it to
23.2. The gap comes from the elimination bonus stacking on medic hits and nukes, which are how
eliminations happen. It is revisited with the elimination bonus in 4.6.

**Resets: not added for Commanders.** On their own, Commander resets look strong (team with more
won 75.1%, 0.63 with rating, consistency 0.92). But a Commander's resets mostly re-measure what
MVP already credits: they correlate 0.73–0.74 with score, opponent hits and SP, and 0.68 with
nukes detonated. Tested against C1 + C2:

- **Skill:** once career MVP under C1 + C2 is accounted for, a Commander's resets have almost no
  further relationship to player rating (partial correlation 0.18).
- **Winning:** resets do add some game-level signal (winner picked 82.4% with them alongside MVP,
  against 81.8% without). Part of that is team dominance rather than the Commander's own play,
  since resets need opponents already down.
- **Cost:** +0.1 per reset adds about 1.4 points a game, which would push the median back to 16.6
  and need offsetting elsewhere. With a straight offset, the gain is 82.2% on winning and 0.753
  skill correlation, against 81.8% and 0.747 without.

That is a small improvement for an extra component and a recalibration, so Commanders already
have enough. Resets stay a Scout component, where they are the Scout's best stat and are not
already counted another way. (The one combination that gained more, resets at +0.1 with medic
hits cut to +0.25, reached 82.4% and 0.763 but sat at median 15.7. It is effectively the
"medic hits to nukes" alternative in another form.)

**Questions for the committee.**

1. C1 + C2 as proposed, or the stronger shift from medic hits to nukes?
2. Is the committee comfortable with medic hits being worth less for a Commander than for other
   positions?

### 4.2 Heavy

**Role.** The Heavy is the most powerful individual combat position: shot power 3 means a
single hit deactivates anyone, including another Heavy or Commander. In exchange the Heavy gets
the fewest shots and lives per resupply, earns no SP, and depends on the Ammo carrier. The
typical pattern is defence early while the team's resupply establishes itself, then rotating to
offence while the Commander resupplies.

**Where Heavy stands.** Median 14.20 and mean 15.26, with the widest spread of any position (IQR
9.6–20.1, standard deviation 7.18) and the lowest 10th percentile (6.8). The level is close to
target; the problem is that a Heavy's MVP swings more with how the game went than anyone
else's.

**What the data says.** 10,390 Heavy scorecards from 5,195 decided standard games; 113 players
for the skill and consistency tests.

| Stat (Heavy)           | Team with more won | r with rating | Consistency | In MVP today           |
| ---------------------- | ------------------ | ------------- | ----------- | ---------------------- |
| Hit differential       | 75.7%              | 0.55          | 0.89        | No                     |
| Score                  | 73.7%              | **0.75**      | 0.92        | +1 / 1,000 above 7,000 |
| Times reset (fewer)    | 72.6%              | 0.01          | 0.85        | No                     |
| Opponents reset        | 70.5%              | 0.70          | 0.91        | No                     |
| Opponents deactivated  | 67.1%              | 0.69          | 0.91        | No                     |
| Missile hits           | 66.8%              | 0.67          | 0.91        | **+2 each**            |
| Opponent hits          | 66.3%              | 0.67          | 0.91        | No                     |
| Times missiled (fewer) | 62.8%              | −0.46         | 0.82        | −1 each                |
| Opponent medic hits    | 60.5%              | 0.70          | 0.85        | +1 each                |
| Accuracy               | 54.9%              | 0.40          | 0.94        | +0.1 per %             |

Four things stand out.

- **Missiles at +2 are the main source of the Heavy's swing.** A Heavy carries at most 5
  missiles, so missile hits run from 0 to 5 a game: 28% of Heavies land none, the 90th
  percentile lands 5. At +2 each that is a 0–10 point swing (standard deviation 3.3 points, the
  most variable component of any position). Missile hits are a good stat, but no better than the
  Heavy's other attacking stats on either test, and a Commander's missile is worth +1. Halving
  the Heavy's missile weight on its own improves ranking more than any other single change
  tested (winner picked 79.6%, from 78.3%).
- **Score barely counts.** Score is the Heavy's best stat on the skill test (0.75) and second on
  winning, but the bonus starts at 7,000, which only a third of Heavies reach (median Heavy score
  6,142), and pays 0.52 points on average.
- **Accuracy matters for Heavies, as it does for Commanders.** Win rate rises steadily with Heavy
  accuracy, from 42.9% in the bottom fifth to 55.5% in the top fifth. Unlike Scouts, more
  accurate Heavies do not shoot less (correlation with shots fired −0.03); with few shots per
  resupply, a Heavy who misses simply does less. Every weight combination that kept Heavy on
  target kept accuracy at +0.1.
- **Hit differential and times reset go with winning, not with skill.** Hit differential
  (opponent hits per time hit) predicts the result well, and adding it raised winner picks
  slightly. But once the rest of MVP is accounted for, it has no remaining relationship to player
  rating (partial correlation −0.10): it measures which team was on top. It would also reward a
  Heavy for avoiding contact, against goal 3. Times reset is the same story as for every other
  position (0.01 with rating).

| Heavy accuracy      | Shots fired | Opponent hits | Missile hits | Score | Team won |
| ------------------- | ----------- | ------------- | ------------ | ----- | -------- |
| Bottom fifth (≤78%) | 62          | 38.1          | 1.07         | 4,521 | 42.9%    |
| 79–84%              | 65          | 48.1          | 1.89         | 6,101 | 48.7%    |
| 85–87%              | 67          | 51.7          | 2.03         | 6,606 | 51.8%    |
| 88–91%              | 64          | 51.0          | 2.15         | 6,684 | 52.4%    |
| Top fifth (≥92%)    | 57          | 47.9          | 2.23         | 6,504 | 55.5%    |

**Recommendations.**

| #   | Change                                     | Detail                                                                                                                      |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| H1  | **Missile hits: +2 → +1 for Heavy**        | Same as the Commander. Removes about 1.9 points on average and most of the Heavy's game-to-game swing.                      |
| H2  | **Score bonus threshold: 7,000 → 3,500**   | Still +1 per 1,000 above it. Pays in 86% of Heavy games, 2.7 points on average (from 0.5), rewarding the Heavy's best stat. |
| H3  | Keep accuracy at +0.1 per percent          | Goes with winning for Heavies and does not cost shot volume.                                                                |
| H4  | Keep opponent medic hits at +1             | Strong on the skill test (0.70). Reviewed for all positions in 4.6.                                                         |
| H5  | Keep times missiled at −1                  | The Heavy's only defensive stat that tracks skill (−0.46).                                                                  |
| H6  | Do not add resets                          | As for Commanders, they mostly re-measure score (correlation 0.75); adding them changed ranking by under half a point.      |
| H7  | Do not add hit differential or times reset | Both track which team was on top rather than the Heavy's own play.                                                          |

**Effect of H1 + H2, replayed over the standard 6v6 games.**

| Heavy MVP    | Mean  | Std dev | P10  | Q1    | Median    | Q3    | P90   |
| ------------ | ----- | ------- | ---- | ----- | --------- | ----- | ----- |
| Current      | 15.27 | 7.18    | 6.80 | 9.70  | 14.20     | 20.14 | 25.60 |
| With H1 + H2 | 15.63 | 6.83    | 7.12 | 10.32 | **15.08** | 20.42 | 25.02 |

| Game situation      | Current median (IQR) | With H1 + H2 median (IQR) |
| ------------------- | -------------------- | ------------------------- |
| Social              | 14.00 (9.60–19.58)   | 14.84 (10.24–19.92)       |
| Competition         | 15.00 (9.90–21.52)   | 15.80 (10.48–21.71)       |
| Won by elimination  | 21.34 (17.29–26.18)  | 21.78 (18.21–25.69)       |
| Won on score        | 15.14 (10.90–20.34)  | 16.06 (12.32–20.18)       |
| Lost on score       | 11.92 (8.70–16.26)   | 12.81 (9.29–16.92)        |
| Lost by elimination | 9.90 (7.30–13.20)    | 10.22 (7.44–13.80)        |

H1 + H2 put Heavy on target (median 15.08, IQR 10.3–20.4) and pull in both tails: the 10th
percentile rises from 6.8 to 7.1 and the 90th falls from 25.6 to 25.0. Ranking improves more than
for any other position so far: compared Heavy against Heavy across the two teams, the higher MVP
belongs to the winning team 79.2% of the time (78.3% today), and the correlation between career
Heavy MVP and player rating rises from 0.81 to 0.83.

**Alternatives considered.**

| Option                                          | Median (IQR)        | Winner picked | r with rating |
| ----------------------------------------------- | ------------------- | ------------- | ------------- |
| Current                                         | 14.20 (9.70–20.14)  | 78.3%         | 0.812         |
| Missiles +1 only                                | 12.50 (8.90–17.34)  | **79.6%**     | 0.819         |
| **H1 + H2 (recommended)**                       | 15.08 (10.32–20.42) | 79.2%         | 0.833         |
| H1 + H2 + resets +0.1                           | 16.34 (11.16–21.94) | 79.0%         | **0.840**     |
| H1, score above 6,000, resets +0.1, hit diff +1 | 15.06 (10.60–20.62) | 79.6%         | 0.831         |

Missiles at +1 alone ranks best on winning but leaves Heavy 2.5 points under target; the score
bonus is the natural way to restore it, since score is the Heavy's best skill stat. Resets raise
the skill correlation slightly but overshoot the target and add a component for little gain.
The hit differential version picks winners slightly better, but as explained above, that extra
signal is team dominance rather than the Heavy's own play.

**Questions for the committee.**

1. Is the committee comfortable with Heavy missiles dropping to +1, the same as Commander?
2. A 3,500 threshold means most Heavies earn a score bonus. Is a bonus that most players receive
   acceptable, or should it be framed as "+1 per 1,000 points scored above 3,500" in player
   communication?

### 4.3 Scout

**Role.** The Scout is the flexible position: the most lives and shots per resupply, one hit
point, and rapid fire for sustained damage. Scouts attack, defend and harass as the game needs,
and are the main threat to the opposing Commander and Heavy and to the opposing team's ability to
get back into the game.

**Where Scout stands.** Median 13.65 and mean 14.24, the lowest of any position, with an IQR of
9.8–18.3. Scout needs about **+1.3** points to reach the target of 15.

**What the data says.** 20,780 Scout scorecards from 5,195 decided standard games (draws and
aborted games left out); 148 players for the skill and consistency tests.

| Stat (Scout)           | Team with more won | r with rating | Consistency | In MVP today |
| ---------------------- | ------------------ | ------------- | ----------- | ------------ |
| Opponents reset        | **79.6%**          | 0.78          | 0.96        | No           |
| Times reset (fewer)    | 75.2%              | −0.01         | 0.85        | No           |
| Shots fired            | 74.5%              | 0.62          | 0.94        | No           |
| Opponents eliminated   | 73.8%              | 0.62          | 0.60        | No           |
| 3-hit shots            | 71.5%              | 0.80          | 0.94        | +0.2 each    |
| Opponent medic hits    | 66.9%              | 0.65          | 0.91        | +1 each      |
| Times missiled (fewer) | 60.8%              | −0.51         | 0.74        | −1 each      |
| Accuracy               | **51.7%**          | 0.42          | 0.97        | +0.1 per %   |

Four things stand out.

- **Resets are the best Scout stat we have and MVP ignores them.** A reset is a hit on an
  opponent during their vulnerable respawn window, which restarts their full 8-second downtime.
  It is the Scout's suppression job in a single number. It predicts the winner better than
  any other Scout stat, tracks player skill nearly as well as 3-hits, and is the most consistent
  stat on the list. Scouts average 13.4 resets a game (median 13, 90th percentile 24).
- **Accuracy says almost nothing about a Scout's contribution.** The team whose Scouts were more
  accurate won 51.7% of the time, which is a coin flip. Accuracy is still about half of Scout
  MVP (7.0 of 14.2 points on average). It is very consistent, so it measures something real
  about a player, but not something that wins games. Rapid fire also costs accuracy: in games
  where a Scout used it (83% of Scout games), their accuracy during rapid fire was 64.9%
  against 73.1% the rest of the game. That is worth about 0.4 MVP, so the current formula mildly
  penalises a Scout for using their position's ability.
- **Times reset goes with losing but not with skill.** Being reset predicts the result well, but
  its correlation with player rating is −0.01: good and poor Scouts get reset equally often. It
  measures how much the opposing team is dominating, not how well this Scout played.
- **Eliminations caused are too inconsistent to reward on their own.** Whoever lands the final
  hit is partly luck (consistency 0.60; for opposing Medic eliminations, 0.14), and the
  elimination bonus already rewards the outcome.

**Accuracy and score for Scouts.** Unlike the Commander, a Scout's accuracy has no real
payoff. Win rate barely moves across the range, and the most accurate Scouts fire far fewer
shots and land fewer hits than the next group down:

| Scout accuracy      | Shots fired | Opponent hits | 3-hits | Resets | Score | Team won |
| ------------------- | ----------- | ------------- | ------ | ------ | ----- | -------- |
| Bottom fifth (≤59%) | 83          | 33.1          | 18.3   | 9.7    | 4,051 | 48.4%    |
| 60–68%              | 80          | 43.8          | 24.5   | 13.7   | 5,262 | 48.9%    |
| 69–75%              | 74          | 45.8          | 25.6   | 14.3   | 5,508 | 48.9%    |
| 76–81%              | 70          | 47.4          | 26.2   | 15.2   | 5,699 | 53.2%    |
| Top fifth (≥82%)    | 60          | 44.3          | 24.2   | 14.1   | 5,443 | 51.1%    |

A Scout's job is volume and pressure: more shots, more hits on the Commander and Heavy, more
resets. Accuracy rewards the opposite (its correlation with shots fired is −0.25), and rapid
fire, the Scout's ability, lowers it.

Score, by contrast, is a strong Scout stat (team with more won 77.8%, 0.84 with rating,
consistency 0.96), but it is almost entirely the sum of the Scout's hits: it correlates 0.97 with
opponent hits, 0.89 with 3-hits and 0.80 with resets. The score bonus (+1 per 1,000 above 6,000,
paid in a third of Scout games, 0.45 points on average) counts those hits a second time.

The weights were searched together: accuracy (0 to 0.15 per percent, from several baselines),
score bonus (none, or 1–2 per 1,000 above 3,000–6,000), 3-hit shots (0.1–0.3) and resets
(0–0.2), keeping only combinations with a median of 14.5–15.5 and an IQR inside roughly 10–20.
The best combination moves points out of accuracy and the score bonus and into 3-hits and
resets. The ranking gains are small, but every one of the top combinations cuts accuracy, and
the result pays the Scout for the Scout's job.

**Recommendations.**

| #   | Change                                           | Detail                                                                                                                          |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **Add opponents reset: +0.2 each**               | New Scout component from `reset_opponent`. The Scout's best stat on winning (79.6%). Averages +2.7 points.                      |
| S2  | **3-hit shots: +0.2 → +0.3**                     | The Scout's core job and strong on every test. Averages +7.1 points (from 4.7).                                                 |
| S3  | **Accuracy: +0.1 → +0.05 per percent for Scout** | Halves a component that does not go with winning. Averages +3.5 points (from 7.0), and halves the MVP cost of using rapid fire. |
| S4  | **Drop the Scout score bonus**                   | Score is the Scout's hits counted again; S1 and S2 reward them directly. Removes 0.45 points on average.                        |
| S5  | Keep opponent medic hits at +1                   | Passes every test. Reviewed for all positions in 4.6.                                                                           |
| S6  | Do not penalise times reset                      | Tracks game flow, not the Scout's own play.                                                                                     |
| S7  | Do not add eliminations caused                   | Too inconsistent, and the elimination bonus already covers the outcome.                                                         |
| S8  | No rapid fire component, in any form             | Unchanged from the lesson behind goal 3. Rapid fire's value already shows up in hits and resets.                                |

**Is S1 safe to reward?** A reset can only be earned by hitting an opponent while they are
trying to get back into the game, which keeps them out of play and is standard SM5 pressure. It
cannot be farmed by doing anything outside normal play. The data shows no sign of Scouts
camping one opponent either: on average the most-reset opponent accounts for 37% of a Scout's
resets (90th percentile 50%), and resets spread across positions: Scout 36%, Commander 26%,
Heavy 21%, Ammo 12%, Medic 6%. The committee should still confirm that spending time on the
opposing team's respawns is play it wants to reward.

**Effect of S1–S4, replayed over the standard 6v6 games.**

| Scout MVP  | Mean  | P10  | Q1   | Median    | Q3    | P90   |
| ---------- | ----- | ---- | ---- | --------- | ----- | ----- |
| Current    | 14.24 | 7.10 | 9.80 | 13.68     | 18.32 | 22.24 |
| With S1–S4 | 15.36 | 6.05 | 9.90 | **15.20** | 20.36 | 24.75 |

| Game situation      | Current median (IQR) | With S1–S4 median (IQR) |
| ------------------- | -------------------- | ----------------------- |
| Social              | 13.40 (9.70–17.92)   | 15.00 (9.85–20.15)      |
| Competition         | 14.40 (10.10–19.16)  | 15.90 (10.05–20.90)     |
| Won by elimination  | 19.15 (16.20–22.10)  | 20.65 (17.15–24.26)     |
| Won on score        | 14.30 (11.00–18.30)  | 16.60 (12.30–21.20)     |
| Lost on score       | 12.20 (9.10–15.68)   | 13.40 (9.35–17.95)      |
| Lost by elimination | 9.90 (7.60–12.50)    | 9.60 (6.30–13.50)       |

S1–S4 land Scout on target: median 15.20, IQR 9.9–20.4. Compared Scout against Scout across
the two teams, the higher MVP belongs to the winning team 78.9% of the time (78.5% today), and
the correlation between career Scout MVP and player rating rises from 0.846 to 0.851.

What changes most is what Scout MVP is made of. Accuracy falls from about half of it to under a
quarter, and the Scout's own work (3-hits, resets and medic hits) becomes roughly three-quarters.
The spread widens at the bottom: a Scout who does little gets less of a floor from accuracy, so
Scouts on teams eliminated quickly drop to a median of 9.6 (from 9.9).

**Alternatives considered.**

| Option                                                | Median (IQR)        | Winner picked | r with rating |
| ----------------------------------------------------- | ------------------- | ------------- | ------------- |
| Current                                               | 13.68 (9.80–18.32)  | 78.5%         | 0.846         |
| Resets +0.1 only, everything else unchanged           | 15.00 (10.70–20.02) | 78.7%         | 0.847         |
| **S1–S4 (recommended)**                               | 15.20 (9.90–20.36)  | **78.9%**     | 0.851         |
| S1–S4 but keep the score bonus, resets +0.15          | 14.60 (9.50–20.12)  | 78.6%         | **0.854**     |
| Accuracy removed entirely (3-hit +0.35, resets +0.25) | 13.65 (7.85–19.70)  | 78.7%         | 0.846         |

Adding resets alone is the minimal change and already hits the target, but leaves accuracy as
half of Scout MVP. Keeping the score bonus gives slightly better skill correlation but slightly
worse winner picks and a lower median. Removing accuracy entirely spreads the distribution well
past the 10–20 band without ranking any better, so a small accuracy credit is kept. Adding
assists (+0.1 each) changed almost nothing and was dropped to keep the formula simple.

**Questions for the committee.**

1. Is rewarding resets consistent with how the committee wants Scouts to play?
2. Should a stat that applies to every position, such as resets, be Scout-only or considered
   for all positions? (Tested for Commander in 4.1 and not recommended: it adds little beyond
   score and nukes. Each remaining position gets the same check.)

### 4.4 Ammo

**Role.** The Ammo carrier keeps the team's shots topped up. Their own shots are effectively
infinite: the count never goes down on a resupply, and it is only spent on misses and
opponent tags. A resupply tag gives one active teammate shots (+5 for Commander, Heavy and
Medic, +10 for Scout, up to the position maximum) but deactivates them for the full 8-second
respawn cycle. The team ammo boost (15 SP) resupplies every active teammate at once with no
downtime. When the Ammo carrier and Medic tag the same teammate together (a double resupply),
that teammate gets shots and lives for one 8-second downtime.

**Where Ammo stands.** Median 14.42 and mean 14.66, with the narrowest spread of any position
(IQR 10.7–18.2). The level is close to target. The problem is that Ammo MVP barely separates good
Ammo games from poor ones: more than half of it (55%) is accuracy, which for this position
means almost nothing.

**What the data says.** 10,390 Ammo scorecards from 5,195 decided standard games; 107 players for
the skill and consistency tests. Alongside the scorecard stats, this section uses the event data
to measure how many teammates each boost reached and how many shots it delivered (every boost
records a state row for each teammate it reached), and each resupply tag's target and how many
shots that teammate had beforehand.

| Stat (Ammo)                         | Team with more won | r with rating | Consistency | In MVP today           |
| ----------------------------------- | ------------------ | ------------- | ----------- | ---------------------- |
| Resupply tags given                 | **81.0%**          | 0.31          | 0.89        | No                     |
| Hit differential                    | 74.3%              | 0.80          | 0.84        | No                     |
| Single resupplies (Ammo only)       | 73.1%              | 0.38          | 0.79        | No                     |
| Double resupplies (with the Medic)  | 70.7%              | 0.18          | 0.93        | No                     |
| Teammates reached by boosts         | **69.3%**          | 0.81          | 0.92        | No                     |
| Score                               | 67.9%              | **0.83**      | 0.94        | +1 / 1,000 above 3,000 |
| Shots delivered by boosts           | 67.9%              | 0.81          | 0.90        | No                     |
| Opponents reset                     | 67.1%              | 0.78          | 0.93        | No                     |
| Ammo boosts                         | 60.8%              | 0.81          | 0.94        | +3 each                |
| Opponent hits                       | 60.8%              | 0.81          | 0.95        | No                     |
| Assists                             | 58.0%              | 0.79          | 0.84        | No                     |
| Times missiled (fewer)              | 58.7%              | −0.64         | 0.70        | −1 each                |
| Teammates' time low on shots (less) | 56.2%              | −0.59         | 0.78        | No                     |
| Accuracy                            | **52.6%**          | **−0.13**     | 0.95        | +0.1 per %             |
| Opponent medic hits                 | 52.3%              | 0.61          | 0.76        | +1 each                |

Five things stand out.

- **Accuracy is meaningless for an Ammo carrier, and slightly backwards.** With unlimited shots,
  there is no cost to missing. Accuracy is the only stat in this review with a _negative_
  correlation to player rating (−0.13): better Ammo carriers are slightly less accurate, because
  they shoot more (accuracy correlates −0.60 with shots fired). It picks the winner 52.6% of the
  time, a coin flip, yet it is 55% of Ammo MVP. At its current weight, accuracy is why Ammo MVP
  is so bunched.
- **A boost is worth what it reaches.** Each boost reaches 3.0 of the 5 teammates on average, but
  the spread is wide: 2% reach nobody, 9% reach one teammate, 11% reach all five. Counting
  teammates reached instead of boosts used tracks skill just as well (0.81) and picks the winner
  far better (69.3% against 60.8%). It rewards boosting when the team is in the fight and active,
  and it makes a boost fired into an empty or downed team worth nothing, which closes off any way
  to farm boosts at the end of a decided game (goal 3).
- **Resupply tags carry real signal but cannot be rewarded safely.** Tags are the strongest
  winning signal of any stat in this review (81.0%). Part of that is game flow (correlation 0.72
  with game length), but they still add skill information once everything else is counted
  (partial correlation with rating 0.35). Adding +0.1 per tag would have been the biggest single
  improvement in the review (winner picked 83.3%). The problem is goal 3: an Ammo carrier can tag
  any teammate in sight at any time, so a per-tag reward pays for tagging teammates whether or not
  it helps, and each unnecessary tag costs that teammate 8 seconds of downtime.
- **No filter separates useful tags from farmed ones.** Half of all tags go to a teammate above
  half their maximum shots, because good Ammo carriers top teammates up before they run low.
  Counting only tags to teammates who needed shots rewards the _wrong_ players: at or below half
  of maximum the correlation with rating is −0.21, at or below a quarter it is −0.41. A per-game
  cap (30 tags) keeps little of the winning signal (62.5%). Teams with better Ammo carriers do
  spend less time low on shots (−0.59 with rating), but that depends as much on the teammates and
  is not consistent enough to reward (0.78).
- **Double resupplies have the same problem and belong to two players.** They go with winning
  (70.7%) but barely with Ammo skill (0.18), and an Ammo carrier and Medic could tag teammates
  together just as easily. Considered again for the Medic in 4.5.

Resupply tags are therefore left out of MVP. The good Ammo carrier's resupplying still shows up
indirectly, through boosts (only teammates who are active and in the game can be reached) and
through the team's results.

**Recommendations.**

| #   | Change                                                               | Detail                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Accuracy: +0.1 → +0.05 per percent for Ammo**                      | Halves a component that does not go with winning and slightly penalises the Ammo carriers who shoot most. Averages 4.1 points (from 8.1).                                                                                                                     |
| A2  | **Ammo boost: +3 per boost → +1 per teammate reached**               | Same average value (4.8 against 4.7 points), but a full-team boost is worth 5 and a boost into an empty team is worth 0. Needs the boost's recipient count stored at ingest.                                                                                  |
| A3  | **Score bonus: +1 per 1,000 above 3,000 → +2 per 1,000 above 1,500** | Score is the Ammo carrier's best skill stat (0.83). Pays in 94% of games, 4.2 points on average (from 0.9), and is what gives a great Ammo game a top end.                                                                                                    |
| A4  | **Add assists: +0.25 each**                                          | The same rule and weight as the Medic's M4, so both support positions are credited the same way for contributing to a kill. Tracks Ammo skill strongly (0.79, consistency 0.84). Averages 1.6 points.                                                         |
| A5  | Keep opponent medic hits at +1 and times missiled at −1              | Both pass the skill test. Reviewed for all positions in 4.6.                                                                                                                                                                                                  |
| A6  | Do not reward resupply tags or double resupplies                     | Real signal, but an Ammo carrier can tag any visible teammate at any time, and no filter separates useful tags from farmed ones (goal 3).                                                                                                                     |
| A7  | Do not add teammates' shot levels or hit differential                | Shared with teammates, or already counted once A1–A4 are in (hit differential's partial correlation with rating is 0.26). Opponents reset (0.78 with rating) was in an earlier version and was replaced by assists, which overlap with it (correlation 0.59). |

**Why the top end matters.** A first version (accuracy +0.075, teammates reached, score +1 per
1,000 from zero) put Ammo on target and picked winners well, but left Ammo MVP with the narrowest
top end of any position (90th percentile 23.6). Replayed with every other position's proposal, an
Ammo carrier had the highest MVP in only 10.4% of games, against a fair share of 16.7% (one player
in six). A1–A4 widen the top end by leaning on score, the Ammo carrier's best skill stat, instead
of accuracy, and bring Ammo to 17.8%. A great Ammo game can now be the best in the game.

**Effect of A1–A4, replayed over the standard 6v6 games.**

| Ammo MVP   | Mean  | Std dev | P10  | Q1    | Median    | Q3    | P90   |
| ---------- | ----- | ------- | ---- | ----- | --------- | ----- | ----- |
| Current    | 14.67 | 5.37    | 8.10 | 10.71 | 14.42     | 18.24 | 21.64 |
| With A1–A4 | 15.60 | 7.73    | 5.80 | 9.90  | **15.22** | 20.53 | 25.52 |

| Game situation      | Current median (IQR) | With A1–A4 median (IQR) |
| ------------------- | -------------------- | ----------------------- |
| Social              | 14.30 (10.80–17.86)  | 15.02 (9.90–20.34)      |
| Competition         | 14.70 (10.60–18.82)  | 15.81 (9.89–20.90)      |
| Won by elimination  | 19.04 (16.30–21.46)  | 20.68 (16.74–24.51)     |
| Won on score        | 14.75 (11.70–17.50)  | 16.87 (11.82–21.33)     |
| Lost on score       | 12.87 (10.40–15.90)  | 13.60 (9.65–18.13)      |
| Lost by elimination | 10.46 (8.10–13.30)   | 9.18 (5.78–13.39)       |

A1–A4 put Ammo on target (median 15.22, IQR 9.9–20.5) with a spread that matches the other
positions. Compared Ammo carrier against Ammo carrier across the two teams, the higher MVP belongs
to the winning team 78.8% of the time (78.2% today), and the correlation between career Ammo MVP
and player rating rises from 0.80 to **0.83**.
Accuracy falls from 55% of Ammo MVP to about a quarter.

**Alternatives considered.**

| Option                                                                                 | Median (IQR)        | Winner picked | r with rating | Ammo tops the game |
| -------------------------------------------------------------------------------------- | ------------------- | ------------- | ------------- | ------------------ |
| Current                                                                                | 14.42 (10.71–18.24) | 78.2%         | 0.805         | 7.3%               |
| Boosts → teammates reached only                                                        | 14.06 (10.22–18.50) | 80.6%         | 0.801         | —                  |
| Accuracy +0.075, teammates reached, score +1 per 1,000 from zero                       | 14.99 (10.91–19.39) | **80.7%**     | 0.817         | 10.4%              |
| A1–A4 with resets +0.1 instead of assists, score from 1,000 (earlier version)          | 15.27 (10.14–20.44) | 79.6%         | 0.829         | 17.8%              |
| **A1–A4 (recommended)**                                                                | 15.22 (9.90–20.53)  | 78.8%         | **0.832**     | 17.8%              |
| Accuracy +0.075, +1.5 per teammate reached, score +1 per 1,000 above 2,000 (no resets) | 15.27 (10.32–20.64) | 79.0%         | 0.823         | 18.4%              |
| With resupply tags +0.1 (rejected, goal 3)                                             | 15.02 (10.49–19.37) | 83.3%         | 0.837         | —                  |

The first version picks winners about two points better, but at the cost of Ammo rarely being
the best player in a game. A1–A4 trade that for a fair share at the top, the best skill
correlation without tags, and a lower accuracy weight. Assists in place of resets keep Ammo's
balance and top share exactly, track skill slightly better, and cost 0.8 points of winner picks;
they are preferred so that both support positions are scored the same way. The no-resets option reaches a similar top
end by weighting boosts more heavily, but tracks skill and winning slightly worse. The cost of
A1–A4 is at the bottom: an Ammo carrier whose team is eliminated falls from a median of 10.5 to
9.2, because a game with few teammates left to boost is a game with little score for the Ammo
carrier either. The tag option is shown for reference: it is what the committee gives up by
keeping MVP safe from tag farming.

**Is A4 safe to reward?** An assist can only be earned by a damaging hit on the opposing
Commander or Heavy that a teammate follows with a deactivating hit within 8 seconds, so it cannot
be farmed outside a real fight. At +0.25 each it is worth 1.6 points to an average Ammo carrier,
small next to boosts and score, so it rewards contributing while in the fight rather than giving
the Ammo carrier a reason to leave the team.

**Questions for the committee.**

1. A2 changes what a boost is worth from a flat 3 to 0–5 depending on timing. Is that the
   incentive the committee wants?

### 4.5 Medic

**Role.** The Medic keeps the team alive by resupplying lives, and is the most irreplaceable
player on the team: the Medic's own 20 lives cannot be resupplied by anyone, and once the Medic
is eliminated the team can gain no more lives for the rest of the game. That makes the Medic the
opposing team's highest-priority target. The team lives boost (10 SP) gives lives to every
active teammate at once with no downtime.

**Where Medic stands.** Median 15.52 and mean 16.31, with a narrow spread (IQR 12.1–19.8) and the
highest floor of any position (10th percentile 9.3). Medic is the closest position to target
today, and its MVP already picks winners well (80.1%, second only to Commander). The issue is the same as for
Ammo: 55% of Medic MVP is accuracy, which gives every Medic about 9 points whatever they do.

**What the data says.** 10,390 Medic scorecards from 5,195 decided standard games; 108 players for
the skill and consistency tests. Boost recipients come from the event data, as for Ammo; survival
time is when the Medic was eliminated as a share of the game (1.0 if they survived).

| Stat (Medic)                | Team with more won | r with rating | Consistency | In MVP today           |
| --------------------------- | ------------------ | ------------- | ----------- | ---------------------- |
| Share of the game survived  | **82.2%**          | 0.49          | 0.54        | No                     |
| Survived (not eliminated)   | 74.9%              | 0.34          | 0.41        | +2                     |
| Hit differential            | 72.0%              | 0.78          | 0.88        | No                     |
| Times reset (fewer)         | 71.7%              | **−0.67**     | 0.70        | No                     |
| Double resupplies           | 70.8%              | 0.18          | 0.91        | No                     |
| Score                       | 69.9%              | **0.80**      | 0.91        | +2 / 1,000 above 2,000 |
| Resupply tags given         | 68.5%              | 0.29          | 0.85        | No                     |
| Teammates reached by boosts | **67.3%**          | 0.80          | 0.91        | No                     |
| Opponents reset             | 66.7%              | 0.77          | 0.90        | No                     |
| Life boosts                 | 63.3%              | 0.81          | 0.93        | +3 each                |
| Opponent hits               | 60.3%              | 0.78          | 0.95        | No                     |
| Assists                     | 55.4%              | 0.75          | 0.84        | No                     |
| Times missiled (fewer)      | 55.3%              | −0.56         | 0.50        | −1 each                |
| Accuracy                    | **50.8%**          | 0.19          | 0.87        | +0.1 per %             |

Six things stand out.

- **Accuracy is a flat 9 points.** Medic accuracy averages 90% with almost no spread (standard
  deviation 0.6 points of MVP). It picks the winner 50.8% of the time and barely tracks skill
  (0.19). It is the main reason the Medic floor is so high.
- **Boosts are worth what they reach, as for Ammo.** A life boost reaches 2.9 of the 5 teammates
  on average (3% reach nobody, 11% reach everyone). Counting teammates reached picks the winner
  better than counting boosts (67.3% against 63.3%) with the same skill signal.
- **Survival is the Medic's job, and the current bonus measures it crudely.** 68% of Medics are
  eliminated. How long the Medic lasts is the strongest winning signal in the Medic data (82.2%),
  but much of that is the team result, and it is not very consistent from game to game (0.54). The
  current +2 survival bonus captures part of it.
- **Being reset is a Medic skill stat.** For every other position, times reset tracked only which
  team was on top. For Medics it tracks skill strongly (−0.67 with rating), and still does once the
  rest of MVP is counted (partial correlation −0.28). A Medic who keeps getting reset is a Medic
  who is not staying protected, and every reset is 8 seconds the team cannot get lives.
- **Assists reflect skill and hold up in competition.** An assist is a damaging hit on the
  opposing Commander or Heavy followed by a teammate's deactivating hit within 8 seconds. Medic
  assists barely track winning (55.4%) but track skill well (0.75), add to it once the rest of MVP
  is counted (partial correlation 0.23), and are the one Medic stat that does not fall in
  competition (0.96 of the social count, 1.03 per minute, against about 0.87 for the Medic's other
  counting stats).
- **Medic resupply tags have the same problem as Ammo tags.** A Medic can tag any visible
  teammate, so tags and double resupplies are left out for the same goal 3 reason as in 4.4.

**Recommendations.**

| #   | Change                                                    | Detail                                                                                                                                                              |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **Life boost: +3 per boost → +0.75 per teammate reached** | Counts what the boost reaches, as for Ammo A2, at a weight that keeps Medic on target. Averages 2.9 points (from 4.0); a boost into an empty team is worth nothing. |
| M2  | **Add times reset: −0.4 each, Medic only**                | The one position where being reset reflects the player. Averages −1.4 points.                                                                                       |
| M3  | **Score bonus threshold: 2,000 → 1,000**                  | Still +2 per 1,000. Score is the Medic's best skill stat (0.80). Pays in 88% of games, 3.0 points on average (from 1.4).                                            |
| M4  | **Add assists: +0.25 each**                               | Skill stat that holds up in competition. Averages 0.8 points.                                                                                                       |
| M5  | Keep the survival bonus at +2                             | The yes/no bonus outperformed proportional survival (below).                                                                                                        |
| M6  | Keep accuracy at +0.1 per percent                         | Weak, but cutting it means leaning on stats that pick winners worse: the best package at each lower accuracy weight ranked worse.                                   |
| M7  | Do not reward resupply tags or double resupplies          | Farmable, as for Ammo.                                                                                                                                              |

**Is M2 safe to penalise?** A Medic can lower their times reset by staying out of the fight, but
for a Medic, staying protected is the job, and a Medic who hides completely gives up boosts, score,
assists and resupplies. The penalty is also small (−0.4 each, 3.5 resets a game on average, 7 at
the 90th percentile). The committee should confirm it is comfortable with the one
position-specific penalty for being reset.

**Effect of M1–M4, replayed over the standard 6v6 games** (with today's elimination bonus, as in
the other position sections).

| Medic MVP  | Mean  | Std dev | P10  | Q1    | Median    | Q3    | P90   |
| ---------- | ----- | ------- | ---- | ----- | --------- | ----- | ----- |
| Current    | 16.31 | 5.91    | 9.30 | 12.08 | 15.52     | 19.79 | 24.18 |
| With M1–M4 | 16.24 | 6.64    | 8.00 | 11.27 | **15.43** | 20.58 | 25.38 |

| Game situation      | Current median (IQR) | With M1–M4 median (IQR) |
| ------------------- | -------------------- | ----------------------- |
| Social              | 15.43 (12.10–19.48)  | 15.41 (11.39–20.23)     |
| Competition         | 15.81 (12.00–20.65)  | 15.48 (10.92–21.73)     |
| Won by elimination  | 21.24 (18.30–24.52)  | 22.42 (18.99–25.92)     |
| Won on score        | 15.84 (12.74–19.48)  | 16.50 (13.06–20.24)     |
| Lost on score       | 13.58 (11.90–17.34)  | 13.98 (11.14–17.41)     |
| Lost by elimination | 11.82 (9.20–13.36)   | 10.57 (7.85–13.17)      |

M1–M4 keep the Medic median where it is but widen the spread to the 10–20 band (IQR 11.3–20.6),
replacing much of the free accuracy floor with stats the Medic controls. Compared Medic against
Medic across the two teams, the higher MVP belongs to the winning team 81.0% of the time (80.1%
today), and the correlation between career Medic MVP and player rating rises from 0.796 to 0.804.
A Medic whose team is eliminated falls from a median of 11.8 to 10.6. For a Medic, that is usually
a game where they were eliminated early and the team's lives ran out.

**Medic in competition.** Medic was the hardest position to balance in competition, and M1–M4
are the result of several rounds of tuning aimed at it. In an earlier version (boosts +1 per
teammate, score bonus from 1,500, survival +3, no assists), Medic was the only position whose
median did not rise in competition: 14.90 there against 14.94 in social games, while every other
position rose to 15.8–16.2. M1–M4 move Medic to 15.48 in competition against 15.41 in social, so
it now rises slightly, and Medics have the game's top MVP in exactly their fair share of
competition games (16.7%). Medic still sits 0.3–0.8 below the other positions in competition, for
the reason below.

Every position's competition lift comes from the elimination bonus, which is paid far more often
in competition; each player's own stats are flat or slightly lower there because the opponents are
stronger. Split by game outcome, competition Medics do as well as anyone in elimination wins and
fall behind only in games decided on score:

| Competition median (social) | Won by elimination | Won on score  | Lost on score | Lost by elimination |
| --------------------------- | ------------------ | ------------- | ------------- | ------------------- |
| Commander                   | 23.38 (23.01)      | 17.54 (15.37) | 13.89 (12.74) | 10.30 (11.10)       |
| Heavy                       | 23.04 (21.18)      | 17.02 (15.86) | 13.66 (12.62) | 9.70 (10.62)        |
| Scout                       | 21.00 (20.35)      | 17.60 (16.40) | 14.25 (13.20) | 8.90 (10.10)        |
| Ammo                        | 21.14 (20.54)      | 16.94 (16.77) | 14.49 (13.08) | 9.10 (9.65)         |
| Medic                       | 23.33 (21.74)      | 15.35 (16.69) | 13.75 (14.04) | 10.42 (10.62)       |

In close competition games, opponents eliminate the Medic far more often: 70% of Medics on a team
that wins on score are eliminated in competition, against 55% in social games, and 90% against
83% on a team that loses on score. Those Medics lose the survival bonus and are reset more. That
is the stronger opposition targeting the Medic, which is real information about the game rather
than a fault in the formula. No change to a Medic stat can lift competition without also lifting
social play, because every Medic stat tested moves the two together, so the remaining gap is
noted rather than corrected with a competition-specific rule.

What was tried along the way:

- **A smaller times reset penalty.** −0.5 left Medic at 14.54 in competition; −0.4 is kept.
- **Proportional survival.** Replacing the yes/no survival bonus with a bonus for the share of
  the game survived looked like the natural fix, since it gives a Medic eliminated in the last
  minute most of the credit. It does not close the gap: competition Medics survive a slightly
  smaller share of the game (0.80 against 0.83), including in score games (0.77 against 0.80 when
  eliminated), so every variant moved social and competition together. Tested on the earlier
  version, it also picked winners worse (80.2–80.8% against 81.7%).
- **Lives left and per-minute scaling.** Rewarding lives left at the end (competition Medics
  finish with a third more) and scaling boosts and score per minute of game time produced no
  competition lift, and lives left fails the skill test (0.20 with rating).
- **A lower score threshold on its own.** Starting the score bonus at 1,000 with nothing else
  changed lifts Medic in competition but overshoots everywhere: the median rises to 15.9 and
  Medics top far more than their share of games. The extra points come from the same Medics who
  already top games.
- **Assists.** Adding assists, which hold up in competition, alongside a smaller boost weight and
  survival bonus, lifts the middle of the Medic distribution without lifting the top. That
  combination is M1–M4.

**Alternatives considered** (all with today's elimination bonus).

| Option                                                                             | Median (IQR)        | Winner picked | r with rating |
| ---------------------------------------------------------------------------------- | ------------------- | ------------- | ------------- |
| Current                                                                            | 15.52 (12.08–19.79) | 80.1%         | 0.796         |
| Boosts → teammates reached only                                                    | 15.10 (11.54–20.00) | 80.3%         | 0.791         |
| Earlier version: boosts +1 per teammate, score from 1,500, survival +3, no assists | 14.92 (10.44–20.62) | **81.7%**     | 0.801         |
| Earlier version with score from 1,000                                              | 15.90 (11.28–21.62) | 81.3%         | 0.804         |
| Assists +0.5, boosts +0.75, +1.5 per 1,000 above 1,250, survival +3                | 15.32 (11.10–20.67) | 81.4%         | 0.802         |
| Assists +0.75, boosts +0.5, score from 1,500, survival +3                          | 15.29 (11.07–20.64) | 81.4%         | 0.803         |
| Assists +0.5, boosts +0.75, score from 1,500, survival +2                          | 15.23 (10.97–20.44) | 80.6%         | **0.806**     |
| **M1–M4 (recommended)**                                                            | 15.43 (11.27–20.58) | 81.0%         | 0.804         |

The options with assists are close on ranking. M1–M4 is preferred because it keeps the survival
bonus and score rate as they are today, uses a round 1,000 threshold, and keeps boosts worth more
than assists, so a Medic's own ability stays the larger reward (goal 4). With every other proposal
applied, including the smaller elimination bonus, it gives Medic the game's top MVP in 15.6% of
games and 16.6% of competition games, close to a fair share in both (section 5). The times reset
penalty is what makes any of these packages work: without it, Medic runs a point high and the
ranking gain mostly disappears.

**Questions for the committee.**

1. Is the committee comfortable with a times reset penalty that applies to the Medic only?
2. M1–M4 keep the Medic median where it is but remove most of the high floor that accuracy gave
   every Medic. Is the committee comfortable with that?

### 4.6 Universal components

Accuracy and the score bonus started as universal components but are now set per position (see
the start of section 4). This section covers what is still shared.

**Shared components, tested at every position.**

| Component (rule)               | Commander     | Heavy         | Scout         | Ammo          | Medic          |
| ------------------------------ | ------------- | ------------- | ------------- | ------------- | -------------- |
| Opponent medic hits (+1)       | 63.1% / 0.44  | 60.5% / 0.70  | 66.9% / 0.65  | 52.3% / 0.61  | 53.6% / 0.62   |
| Times missiled (−1, fewer)     | 65.2% / −0.44 | 62.8% / −0.46 | 61.2% / −0.51 | 58.7% / −0.64 | 55.3% / −0.56  |
| Eliminated (−1, fewer)         | 79.0% / −0.41 | 80.9% / −0.59 | 83.0% / −0.55 | 81.3% / −0.52 | n/a (survival) |
| Own medic hits (−1, fewer)     | 50.4% / −0.14 | 51.0% / −0.12 | 51.3% / −0.12 | 51.3% / 0.06  | —              |
| Opponent nukes canceled (+3)   | 51.9% / 0.28  | 52.4% / 0.28  | 52.4% / 0.26  | 50.9% / 0.30  | 50.8% / 0.17   |
| Own team's nukes canceled (−3) | —             | 51.0% / −0.05 | 51.6% / 0.00  | 50.8% / −0.06 | 50.8% / 0.05   |

Each cell is "team with more won / correlation with player rating". Medic hits are worth +0.5
for Commanders (C1); the Medic's survival bonus replaces the eliminated penalty.

- **Keep opponent medic hits, times missiled and eliminated as they are.** All three pass the
  winning and skill tests at every position where they apply.
- **Keep the three team-harm and nuke-cancel components as deliberate rules.** Own medic hits,
  canceling your own team's nuke, and canceling an opponent's nuke are all rare (under 8% of games)
  and fail the consistency test. As with the Commander's nuke-cancel penalty in 4.1, they stay
  because the behaviour they reward or punish matters when it happens, and on average they move
  MVP by less than 0.2 points at any position.

**The elimination bonus.** Today a team that wins by elimination gets +4 each, plus +1 per minute
of game time left beyond 3 minutes. 51.5% of standard games end in an elimination, so a quarter of
all players receive it, 5.1 points on average when paid (median 4.0, 90th percentile 7.9).

The bonus has two purposes: to make up the MVP a player could not earn because the game ended
early, and to reward a team for the stronger kind of win. The first can be measured; the second is
a judgement, which the target band (middle half of games between about 10 and 20) can limit.

_Purpose 1: MVP lost to a shorter game (measured)._ Among winners of full-length score games, the
parts of MVP that build up over time (hits, missiles, nukes, boosts, resets, score) accrue at
about **0.75 points per player per minute**: Commander 0.59, Heavy 0.58, Scout 0.99, Ammo 0.99,
Medic 0.54. Elimination wins end with a median of 2.8 minutes of scheduled time left (90th
percentile 6.9), so the shorter game costs a typical elimination winner about 2.0–2.5 points.
This is the generous estimate, since it assumes the winners would have kept scoring at the full
rate; in the data, elimination winners' own play falls only 0.25 points per minute remaining,
because the fastest eliminations come from the most dominant teams.

Against that, today's bonus pays 5.1 on average, about double the measured loss, and its shape
does not match it: 53% of elimination wins end with under 3 minutes left and get no time-based
amount at all, while very fast wins get +1 a minute, more than the 0.75 a minute they lost.

_Purpose 2: the premium for an elimination (bounded by the target band)._ With the position
changes in place, elimination winners already match or beat score winners _before_ any bonus:

| Position  | Elimination winners, before any bonus | Score winners | Score losers |
| --------- | ------------------------------------- | ------------- | ------------ |
| Commander | 17.80                                 | 15.70         | 12.95        |
| Heavy     | 16.72                                 | 16.06         | 12.81        |
| Scout     | 15.35                                 | 16.60         | 13.40        |
| Ammo      | 15.13                                 | 16.87         | 13.60        |
| Medic     | 17.13                                 | 16.50         | 13.98        |

(Proposed MVP medians.) Today's bonus puts the typical elimination winner at 21.6, at the 79th
percentile and above the top of the target band, with 62% of elimination winners above 20. At that
point the bonus, not the play, is lifting average players into the top fifth. A reasonable limit is
that the typical elimination winner should land at the top of the target band, about 20 (the 75th
percentile).

| Elimination bonus                                      | Typical elimination winner | Above 20 | Position medians | Competition vs social median |
| ------------------------------------------------------ | -------------------------- | -------- | ---------------- | ---------------------------- |
| Today: +4, +1 per minute beyond 3 minutes left         | 21.62 (79th percentile)    | 62%      | 15.10–15.43      | +0.83                        |
| No premium: +0.75 per minute left                      | 18.95 (73rd)               | 42%      | 14.44–14.94      | +0.50                        |
| **+1, +0.75 per minute left (recommended)**            | **19.95 (76th)**           | **50%**  | **14.73–15.11**  | **+0.65**                    |
| +2, +0.75 per minute left                              | 20.95 (78th)               | 57%      | 14.94–15.26      | +0.80                        |
| +2, +0.75 per minute left, and +1 for any win on score | 20.95 (77th)               | 57%      | 15.23–15.61      | +0.67                        |

A premium of +1 is the largest that keeps the typical elimination winner inside the target band.
The recommended bonus is therefore **+1 for winning by elimination, plus 0.75 per minute of
scheduled game time left**. Both parts can be explained to players: the per-minute part is the
measured rate MVP builds up at, and the +1 is the extra reward for the stronger win. It averages
3.4 points when paid (median 3.1, 90th percentile 6.2, against 5.1, 4.0 and 7.9 today).

It also improves the skill signal. With a smaller team-result bonus, career MVP tracks player
rating better at every position (see section 5), and the competition gap, which is mostly the
bonus being paid more often in competition, narrows from +0.83 to +0.65. The cost is that every
position's median falls by 0.2–0.5, to 14.73–15.11, still within a quarter point of 15. The position
sections above were tuned with today's bonus; section 5 shows the combined effect with U3.

- **Commanders still gain the most from eliminations.** Their elimination-win median falls from
  24.8 today to 21.5, still the highest, because the Medic hits and nukes that produce
  eliminations already pay Commanders well. No position-specific bonus is proposed.
- **A win on score still earns nothing directly.** Winning is the team's outcome, and a win bonus
  would raise every winner by the same amount regardless of how they played. The position changes
  already put score winners about 2.5–3.5 points above score losers at every position.

| #   | Change                                                                                                  | Detail                                                                               |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| U1  | Keep opponent medic hits, times missiled and eliminated                                                 | Pass every test at every position. Commander medic hits at +0.5 (C1).                |
| U2  | Keep own medic hits and both nuke-cancel components                                                     | Deliberate rules for rare, high-impact events.                                       |
| U3  | **Elimination bonus: +4, +1 per minute beyond 3 minutes → +1, +0.75 per minute of scheduled time left** | Measured compensation for the shorter game, plus a premium sized to the target band. |
| U4  | Do not add a bonus for winning on score                                                                 | Team outcome, not individual contribution.                                           |

**Questions for the committee.**

1. Does the committee accept the target band as the limit on the elimination premium, putting the
   typical elimination winner at about 20?
2. Is the committee comfortable that a win on score continues to earn no direct MVP?

---

## 5. Combined effect

All five position proposals together (C1–C2, H1–H2, S1–S4, A1–A4, M1–M4, with U1–U4), replayed
over the 5,202 standard 6v6 games.

| Position  | Current median (IQR) | Proposed median (IQR) | Proposed P10–P90 |
| --------- | -------------------- | --------------------- | ---------------- |
| Commander | 16.60 (12.00–22.12)  | 14.90 (10.80–19.98)   | 7.80–23.94       |
| Heavy     | 14.20 (9.70–20.14)   | 14.76 (10.20–19.68)   | 7.10–23.99       |
| Scout     | 13.68 (9.80–18.32)   | 14.85 (9.78–19.65)    | 6.00–23.85       |
| Ammo      | 14.42 (10.71–18.24)  | 14.73 (9.82–19.70)    | 5.77–24.74       |
| Medic     | 15.52 (12.08–19.79)  | 15.11 (11.17–19.81)   | 8.00–24.22       |

Every position now has a median within a quarter point of 15 (14.73–15.11) and an IQR of almost
exactly 10–20, against medians spread from 13.7 to 16.6 today.

**Who tops the game.** If MVP is fair across positions, the highest MVP in a game should go to
each position about as often as that position appears: one in six for Commander, Heavy, Ammo and
Medic, and one in three for Scout (two per team).

| Position  | Fair share | Game's top MVP today | Proposed |
| --------- | ---------- | -------------------- | -------- |
| Commander | 16.7%      | **35.2%**            | 18.8%    |
| Heavy     | 16.7%      | 23.2%                | 17.7%    |
| Scout     | 33.3%      | **18.1%**            | 30.0%    |
| Ammo      | 16.7%      | **7.3%**             | 17.9%    |
| Medic     | 16.7%      | 16.1%                | 15.6%    |

Today a Commander tops the game more than twice as often as a fair share, a Scout about half as
often, and an Ammo carrier less than half as often. Under the proposal every position is within
about 3.5 points of a fair share. Ammo needed its own top-end tuning to get there (see "Why the top
end matters" in 4.4).

**Ranking quality by position.** "r with rating" is the correlation between a player's career MVP
at the position and their global rating. "Winner picked" compares players at the same position
across the two teams, and is shown two ways: with the elimination bonus included, and on own play
alone (every component except the elimination bonus).

| Position  | r with rating: today → proposed | Winner picked, own play: today → proposed | Winner picked, with bonus: today → proposed |
| --------- | ------------------------------- | ----------------------------------------- | ------------------------------------------- |
| Commander | 0.716 → 0.756                   | 76.9% → 77.5%                             | 81.1% → 80.6%                               |
| Heavy     | 0.812 → 0.836                   | 71.8% → 73.1%                             | 78.3% → 77.3%                               |
| Scout     | 0.846 → 0.853                   | 70.4% → 72.4%                             | 78.5% → 76.9%                               |
| Ammo      | 0.805 → 0.837                   | 68.7% → 72.9%                             | 78.2% → 76.7%                               |
| Medic     | 0.796 → 0.816                   | 72.6% → 76.2%                             | 80.1% → 79.5%                               |

On the two measures of individual play, the proposal is better at every position: career MVP
tracks player rating more closely, and own-play MVP picks the winning side more often (by 0.6–5.0
points). With the bonus included, winner picks fall slightly at every position. That is the
smaller elimination bonus (U3), not the position changes: a bonus paid only to winners
automatically raises winner picks, and with today's bonus the position changes alone gave 78.8–
81.8%. A smaller team-result bonus trades a little of that built-in head start for a skill signal
that is stronger at every position.

**Competition games.** Competition MVP has run about a point higher than social MVP for most
positions. Almost all of that is the elimination bonus: 70% of competition games end in an
elimination (44% of social games), so more players receive it, while each player's own stats are
flat or slightly lower against stronger opponents. The smaller bonus (U3) narrows the gap from
+0.83 to +0.65 overall. What matters most is that the positions stay level with each other inside
competition. Replayed over the 1,439 competition games only:

| Position  | Social median: today → proposed | Competition median: today → proposed | Competition winner picked (with bonus) |
| --------- | ------------------------------- | ------------------------------------ | -------------------------------------- |
| Commander | 16.20 → 14.70                   | 17.65 → 15.76                        | 87.8% → 87.1%                          |
| Heavy     | 14.00 → 14.52                   | 15.00 → 15.44                        | 86.4% → 85.4%                          |
| Scout     | 13.40 → 14.65                   | 14.40 → 15.30                        | 86.9% → 84.6%                          |
| Ammo      | 14.30 → 14.56                   | 14.70 → 15.16                        | 84.1% → 80.9%                          |
| Medic     | 15.43 → 15.11                   | 15.81 → 15.11                        | 86.4% → 84.9%                          |

| Position  | Fair share | Competition top MVP today | Proposed |
| --------- | ---------- | ------------------------- | -------- |
| Commander | 16.7%      | **39.9%**                 | 20.3%    |
| Heavy     | 16.7%      | 26.8%                     | 21.3%    |
| Scout     | 33.3%      | **15.4%**                 | 26.3%    |
| Ammo      | 16.7%      | **4.9%**                  | 15.4%    |
| Medic     | 16.7%      | 13.0%                     | 16.7%    |

- **The positions are closer together in competition than today.** Competition medians span
  15.1–15.8, against 14.4–17.7 today.
- **The imbalance at the top is worse in competition today, and the proposal fixes most of it.**
  A Commander currently tops 40% of competition games and an Ammo carrier 5%. Under the proposal
  every position except Scout is within 4 points of a fair share. Scout improves the most but
  remains about 7 points under in competition, where Scouts face stronger opponents.
- **Medic is the one position that does not run higher in competition.** Its competition median
  equals its social one (15.11), within 0.1–0.7 of the other positions in competition. The gap is
  in games decided on score, where competition opponents eliminate the Medic far more often (70%
  of Medics on a winning team, against 55% in social games). Medics top competition games in
  their fair share (16.7%). Several rounds of Medic tuning narrowed the gap (see 4.5); the rest is
  noted rather than corrected with a competition-specific rule.
- **Winner picks in competition fall with the bonus included,** for the same reason as above:
  competition has more elimination games, so it loses more of the bonus's built-in head start.
  The drop is largest for Ammo (3.2 points), whose score bonus now starts at 1,500 and whose
  assists track skill rather than the result.

**What changes for players**, in one line each:

- **Commander:** Medic hits worth half; score bonus starts at 9,000.
- **Heavy:** missiles worth +1 instead of +2; score bonus starts at 3,500.
- **Scout:** new +0.2 per reset; 3-hits worth +0.3; accuracy worth half; no score bonus.
- **Ammo:** boosts score +1 per teammate reached; accuracy worth half; +2 per 1,000 points above
  1,500; new +0.25 per assist.
- **Medic:** boosts score +0.75 per teammate reached; −0.4 each time reset; new +0.25 per assist;
  score bonus starts at 1,000.
- **Everyone:** winning by elimination is worth +1 plus 0.75 per minute left on the clock, instead
  of +4 plus 1 per minute beyond the last 3.

**Implementation note.** Every new input except boost recipients is already a stored scorecard
column (`reset_opponent`, `times_reset`, `assists`, `score`), and the elimination bonus uses the game's
stored `scheduled_duration` and `actual_duration`. Boost recipients are recorded in the replay
state rows today and would need storing per scorecard at ingest. The new model would be a new
`sm5_mvp_model` version, so historical scorecards can be recalculated and compared side by side
with 2021.12.

---

## Appendix: method

- **Standard game filter.** A game is included only if it is not excluded (`game.exclude =
false`) and has exactly two teams with scorecards, each with exactly six players: one
  Commander, one Heavy, two Scouts, one Ammo carrier and one Medic (by `sm5_scorecard.position`,
  grouped by `team_id`). 31 games are 6v6 but fail the lineup check and are left out. The
  resulting set also includes 17 aborted and 6 drawn games, too few to affect the figures.
- Source: `sm5_scorecard.mvp_points` and `sm5_scorecard_mvp` for model `2021.12`. PDF-era games
  (`sm5_pdf_*`) are not included; they have no modern MVP.
- Social = `game.competition_id IS NULL`; competition otherwise.
- Quartiles are `percentile_cont`. "Share" is a component's average points divided by the
  position's mean MVP. "r vs total" is the Pearson correlation between the component's points
  and the player's total MVP for that game.
- Formula reference: `apps/chomper/src/mvp.ts`; parameters seeded in
  `packages/db/drizzle/0001_seed_mvp_model.sql`.
- The site's MVP distribution charts use all non-excluded games, not this filter, so they will
  not match these figures exactly.
