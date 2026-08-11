# SM5 Penalty Definitions

## Policy: in-game penalties cost nothing

A penalty is scored in two stages.

**In-game.** A referee penalizes a player during the game (a `0600` event) and the arena
may deduct line 1 `penalty` from their score. That deduction is **not** part of the
official score. Chomper strips it back out of the score stream and records the penalty at
`score_value = 0` and `mvp_value = 0`, whatever the arena was configured to do. The
setting varies per game — center 4-19 runs `-1000` normally but was set to `0` for the
Internationals 2024 files — so nothing about the score may depend on it.

**After the game.** Referees meet and decide which penalties are escalated, normally to
`-1000` score and `-5` MVP. That decision is the only thing that moves a score, it is
entered by hand, and it exists nowhere in the TDF — so it must survive reingest
(`applyPenaltyMetadata` preserves `score_value`, `type`, `mvp_value` and `rescinded`).

Penalties are also used to correct scores after pack malfunctions or other external
factors. Those carry whatever value the correction needs, which is why a few are not
multiples of 1000.

## Escalation defaults

Standard penalty types and their default scoring impact **once escalated**.
`sm5_game_penalty.type` is free text (default `"Common Foul"`); this table is the
canonical reference for default values when a referee escalates a penalty. It is a
default, not a rule — referees escalate the incident, so any type may end up at any
value.

| Penalty                 | Default Score | MVP Deduction |
| ----------------------- | ------------- | ------------- |
| Common Foul             | 0             | 0             |
| Shielding               | 0             | 0             |
| Chasing                 | 0             | 0             |
| Blocking                | 0             | 0             |
| Dangerous Play          | -1000         | -5            |
| Illegal Language        | -1000         | -5            |
| Physical Abuse          | -1000         | -5            |
| Unsportsmanlike Conduct | -1000         | -5            |
| Leaving Starting Area   | 0             | 0             |
| Leaving Playing Arena   | 0             | 0             |
| Removing Equipment      | 0             | 0             |
| Sitting or Lying        | 0             | 0             |
| Climbing                | 0             | 0             |
| Swapping Guns           | 0             | 0             |
| Loitering               | 0             | 0             |
| Illegal Interaction     | 0             | 0             |
| Illegal Targeting       | 0             | 0             |
| Shoulder Tilting        | 0             | 0             |
| Game Misconduct         | -1000         | -5            |
