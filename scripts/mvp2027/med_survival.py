"""Medic in competition: survival patterns, outcome split and the proportional-survival tests.

Run after med_build.py and combined.py (needs full_med.csv, full.csv and new_mvp.csv).
"""
import csv
import io
import contextlib
import numpy as np

with contextlib.redirect_stdout(io.StringIO()):
    from med_grid import *  # noqa: F401,F403  (arrays: mvp, accp, score, rec, elim, sf, tr, comp, win, outcome, ...)

c = comp == "1"
s = comp == "0"
ws = (win == 1) & (outcome == "score")
ls = (win == 0) & (outcome == "score")
we = (win == 1) & (outcome == "elimination")
le = (win == 0) & (outcome == "elimination")

# 1. Survival by scope and outcome
for name, m in (("social", s), ("comp", c)):
    print(f"{name}: eliminated {100 * elim[m].mean():.1f}%, share survived {sf[m].mean():.3f}")
    for label, mm in (("won elim", we), ("lost elim", le), ("won score", ws), ("lost score", ls)):
        x = m & mm
        print(f"   {label:10s} medic eliminated {100 * elim[x].mean():5.1f}%  share survived {sf[x].mean():.3f}")

# 2. Survival rules (rest of M1-M4 with times reset -0.4)
nob = base + 0.1 * accp + rec + 2 * np.maximum(0, score - 1500) / 1000 - 0.4 * tr


def rep(label, v):
    wp, rr, q = evaluate(v)
    print(
        f"{label:40s} all {q[2]:5.2f} social {np.median(v[s]):5.2f} comp {np.median(v[c]):5.2f} "
        f"| wp {wp:.3f} r {rr:.3f}"
    )


rep("+3 if not eliminated", nob + 3 * (1 - elim))
for k in (3, 4, 5, 6):
    v = nob + k * sf
    rep(f"{k} x share survived, re-centred", v + 15 - np.median(v))
for k in (3, 4):
    rep(f"+3 if survived else {0.75 * k:.2f} x share", nob + np.where(elim == 1, 0.75 * k * sf, 3))
ll = g("lives_left")
for w in (0.25, 0.5):
    rep(f"+3 survival, +{w} per life left", nob + 3 * (1 - elim) + w * ll)
L = 12.7
rep("boost reach per 12.7 min", nob - rec + rec / mins * L + 3 * (1 - elim))

# 3. Competition medians by outcome for every position, under the full proposal
N = {r["id"]: float(r["new_mvp"]) for r in csv.DictReader(open("new_mvp_pos.csv"))}
rows = list(csv.DictReader(open("full.csv", encoding="utf-8")))
cats = [
    ("won elim", lambda r: r["win"] == "1" and r["outcome"] == "elimination"),
    ("won score", lambda r: r["win"] == "1" and r["outcome"] == "score"),
    ("lost score", lambda r: r["win"] == "0" and r["outcome"] == "score"),
    ("lost elim", lambda r: r["win"] == "0" and r["outcome"] == "elimination"),
]
for p, name in zip("12345", ("Commander", "Heavy", "Scout", "Ammo", "Medic")):
    parts = []
    for label, f in cats:
        cv = [N[r["id"]] for r in rows if r["position"] == p and r["is_comp"] == "1" and f(r)]
        sv = [N[r["id"]] for r in rows if r["position"] == p and r["is_comp"] == "0" and f(r)]
        parts.append(f"{label} {np.median(cv):5.2f} ({np.median(sv):5.2f})")
    print(f"{name:10s} " + " | ".join(parts))
