# MVP2027 analysis scripts

The working scripts behind [docs/MVP2027_Proposal.md](../../docs/MVP2027_Proposal.md). They are
kept as a record of how every figure in the proposal was produced, not as maintained tooling:
they were written iteratively during the review, so later scripts import earlier ones and some
repeat work.

## Requirements

- `psql` and a `DATABASE_URL` for the LFstats database (read access is enough).
- Python 3 with `numpy`. A throwaway venv works:

  ```bash
  python -m venv venv && ./venv/Scripts/python -m pip install numpy
  ```

Run everything from this folder. The SQL scripts write CSV files here, and the Python scripts
read them from the current directory. Those outputs contain per-player game data and are
git-ignored; never commit them.

## Shared pieces

| File        | What it does                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.sql`   | Defines the standard 6v6 game filter (`std`) and the decided-game scorecard table (`sc`). Every other SQL script starts with `\i std.sql`.                                                |
| `tests.py`  | The four-test analysis for one position: `python tests.py <position> <stat> ...`. Prints average, "team with more won", correlation with rating and split-half consistency for each stat. |
| `simpos.py` | Replays weight changes for one position and reports the distribution, winner picks and rating correlation.                                                                                |

## Run order

### 1. Baseline and data export

```bash
psql "$DATABASE_URL" -X -q -f export2.sql   # full.csv: every 6v6 scorecard + rating + MVP inputs
psql "$DATABASE_URL" -X -q -f export.sql    # sc.csv: the narrower export the first Scout scripts use
```

`cov.sql` checks replay-data coverage. The baseline tables in sections 2 and 3 of the proposal
came from inline queries over the same `std` filter.

### 2. Positions

| Position  | Scripts, in order                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scout     | `scout1.sql`, `scout.py`, `scout2.py`, `rapid.py`, `sim.py`, `sim2.py`, `conc.sql` (reset concentration), then the re-tune: `sct_grid.py`, `sct_opts.py`                                                                                                                                                                                                                              |
| Commander | `cmd_sim.py`, `cmd_sim2.py`, `cmdq.sql`, `cmd_sim3.py`, `cmd_acc.py` (accuracy → SP → nukes), `cmd_grid.py`, `cmd_grid2.py`, `cmd_final.py`, `cmd_reset.py`                                                                                                                                                                                                                           |
| Heavy     | `hvy_grid.py`, `hvy_opts.py`                                                                                                                                                                                                                                                                                                                                                          |
| Ammo      | `ammo_ev.sql` (boosts, tags, teammate shot time), `ammo_build.py`, `tags2.sql`, `ammo_build2.py`, `ammo_grid.py`, `ammo_steps.py`, `ammo_acc0.py`, `tags3.sql`, `tagneed.py`, `ammo_build3.py`, `ammo_notag.py`, `ammo_fin.py`, then the top-end tuning: `ammo_top.py`, `ammo_t1.py`, then (after `combined.py`) `ammo_assist.py` (assists) and `ammo_final.py` (final A1–A4 figures) |
| Medic     | `med_ev.sql`, `medend.sql`, `med_build.py`, `med_grid.py`, `med_opts.py`, then the competition tuning (after `combined.py`): `med_survival.py`, `med_sb.py` (score threshold), `med_assist.py` (assists), `med_round.py` (round thresholds), `med_final.py` (final M1–M4 figures and alternatives)                                                                                    |

`tests_ammo.py` and `tests_med.py` are `tests.py` pointed at the position-specific CSVs built by
`ammo_build*.py` and `med_build.py`.

### 3. Combined effect

```bash
psql "$DATABASE_URL" -X -q -f gdur.sql   # gdur.csv: scheduled and actual length of every game
python combined.py      # writes new_mvp_pos.csv (positions, today's elimination bonus)
                        # and new_mvp.csv (positions + the new elimination bonus, U3)
python final_metrics.py # every figure in section 5 and the 4.6 tables, from new_mvp.csv
```

Supporting analyses, run on `new_mvp_pos.csv` (the position changes before U3):

```bash
python universal.py     # distributions, game-top MVP share, elimination bonus profile
python comp.py          # social vs competition medians, top-MVP share and winner picks
python med_survival.py  # Medic in competition: outcome split and survival-rule tests
python elimbonus.py     # how the elimination bonus is paid, own-play MVP by game length
python elimvar.py       # elimination bonus size variants
python elimvar2.py      # rating correlation and top-MVP share for those variants
python elimjust.py      # MVP lost per minute of shortened game, by position
python elimjust2.py     # compensation-plus-premium designs against the target percentiles
```

Note that importing `cmd_grid.py` re-runs its grid search, so `combined.py` takes a few minutes.

## Final recommendations encoded in `combined.py`

| Position  | Formula change                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Commander | Opponent medic hits +0.5; score bonus +1 per 1,000 above 9,000                                                                  |
| Heavy     | Missile hits +1; score bonus +1 per 1,000 above 3,500                                                                           |
| Scout     | Accuracy +0.05 per %; no score bonus; 3-hits +0.3; resets +0.2                                                                  |
| Ammo      | Accuracy +0.05 per %; +1 per teammate reached by a boost; +2 per 1,000 above 1,500; +0.25 per assist                            |
| Medic     | +0.75 per teammate reached by a boost; survival +2; score bonus +2 per 1,000 above 1,000; −0.4 per time reset; +0.25 per assist |
| All       | Elimination bonus +1 plus 0.75 per minute of scheduled time left                                                                |
