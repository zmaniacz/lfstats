// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Renders the bake-off results as a plain-text report, plus a CSV of final
 * ratings and a JSON dump for later charting.
 *
 * Follows `legacy-variance-report.ts`: a timestamped file under
 * `packages/db/logs/`, and the same text echoed to stdout.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BootstrapStat } from "./batch-bt";
import type { ConnectivityReport, Metrics, ModelEvaluation, TeammateLuck } from "./evaluate";
import type { LoadStats } from "./load";
import type { PlayerRating } from "./types";

const LOG_DIR = join(process.cwd(), "logs");

function pad(s: string, width: number, align: "l" | "r" = "l"): string {
  return align === "l" ? s.padEnd(width) : s.padStart(width);
}

function table(headers: string[], rows: string[][], aligns?: ("l" | "r")[]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => pad(c, widths[i], aligns?.[i] ?? "l"))
      .join("  ")
      .trimEnd();
  return [line(headers), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n");
}

const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "—");
const f4 = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : "—");
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");

function metricsRow(name: string, m: Metrics): string[] {
  return [name, String(m.n), f4(m.logLoss), f4(m.brier), pct(m.accuracy), f3(m.calibrationError)];
}

const METRIC_HEADERS = ["model", "games", "log-loss", "brier", "accuracy", "cal-err"];
const METRIC_ALIGNS: ("l" | "r")[] = ["l", "r", "r", "r", "r", "r"];

export type ReportInput = {
  mode: "real" | "synthetic";
  loadStats: LoadStats | null;
  connectivity: ConnectivityReport;
  evaluations: ModelEvaluation[];
  /** Ratings of the best-scoring model, for the CSV and the top-N table. */
  bestModel: { name: string; ratings: Map<string, PlayerRating> };
  syntheticCheck: { model: string; spearman: number; pass: boolean }[] | null;
  /** Synthetic mode only: the same position table computed over KNOWN true skill. */
  truthByPosition: Map<number, { n: number; meanRating: number }> | null;
  /** Synthetic mode only: does teammate quality leak into a player's rating? */
  teammateLuck: TeammateLuck[] | null;
  /** Bootstrap percentile intervals for the winning batch model, when requested. */
  bootstrap: {
    model: string;
    samples: number;
    intervals: Map<string, BootstrapStat>;
  } | null;
  socialWeight: number;
  trainFraction: number;
  topN: number;
  minGamesForTop: number;
};

export function renderReport(input: ReportInput): string {
  const out: string[] = [];
  const h = (title: string) => out.push("", "=".repeat(78), title, "=".repeat(78), "");

  out.push(`Rating bake-off — ${input.mode} data`, `Generated ${new Date().toISOString()}`);
  out.push(`Context weights: social/nightly ×${input.socialWeight}, competition ×round multiplier`);
  out.push(`Training warm-up: first ${pct(input.trainFraction)} of games (not scored)`);

  // -- 1. dataset ----------------------------------------------------------
  if (input.loadStats) {
    const s = input.loadStats;
    h("1. Dataset");
    out.push(
      table(
        ["metric", "value"],
        [
          ["SM5 games queried", String(s.gamesQueried)],
          ["games kept", String(s.gamesKept)],
          ["skipped — not exactly 2 sides w/ result", String(s.skippedNotTwoSides)],
          ["skipped — empty roster", String(s.skippedEmptyRoster)],
          ["scorecards", String(s.totalScorecards)],
          [
            "guest scorecards",
            `${s.guestScorecards} (${pct(s.guestScorecards / Math.max(1, s.totalScorecards))})`,
          ],
          [
            "games containing >=1 guest",
            `${s.gamesWithAnyGuest} (${pct(s.gamesWithAnyGuest / Math.max(1, s.gamesKept))})`,
          ],
          ["distinct identified players", String(s.distinctPlayers)],
          ["distinct centers", String(s.distinctCenters)],
          [
            "date range",
            `${s.earliest?.toISOString().slice(0, 10) ?? "—"} → ${s.latest?.toISOString().slice(0, 10) ?? "—"}`,
          ],
        ],
        ["l", "r"],
      ),
    );
  }

  // -- 2. connectivity -----------------------------------------------------
  const c = input.connectivity;
  h("2. Connectivity — is a single global rating identifiable?");
  out.push(
    table(
      ["metric", "value"],
      [
        ["players in graph", String(c.players)],
        ["connected components", String(c.components)],
        ["largest component", `${c.largestComponent} (${pct(c.largestComponentShare)} of players)`],
        ["distinct opponent pairs", String(c.opponentPairs)],
        ["cross-center opponent pairs", `${c.crossCenterPairs} (${pct(c.crossCenterShare)})`],
      ],
      ["l", "r"],
    ),
  );
  out.push(
    "",
    "Ratings are only comparable between players joined by a chain of games. A low",
    "cross-center pair share means the per-center levels are weakly identified: each",
    "center's ratings will look internally sensible while being mutually incomparable.",
  );
  if (c.perCenter.length > 1) {
    out.push(
      "",
      table(
        ["center", "games", "players"],
        c.perCenter.map((p) => [p.centerName, String(p.games), String(p.players)]),
        ["l", "r", "r"],
      ),
    );
  }

  // -- 3. overall accuracy -------------------------------------------------
  const ranked = [...input.evaluations].sort((a, b) => a.overall.logLoss - b.overall.logLoss);
  h("3. Out-of-sample prediction (prequential, all test games)");
  out.push(
    table(
      METRIC_HEADERS,
      ranked.map((e) => metricsRow(e.name, e.overall)),
      METRIC_ALIGNS,
    ),
  );
  out.push(
    "",
    "Lower log-loss is better; 0.6931 is a coin flip. Log-loss is the primary metric —",
    "accuracy ignores confidence, and a rating that is read as a probability must be",
    "calibrated (cal-err near 0), not merely often-right.",
  );

  // -- 4. cross-center -----------------------------------------------------
  h("4. Cross-center games only — the sharpest test of a GLOBAL rating");
  const crossRanked = [...input.evaluations].sort(
    (a, b) => a.crossCenter.logLoss - b.crossCenter.logLoss,
  );
  if ((crossRanked[0]?.crossCenter.n ?? 0) === 0) {
    out.push("No cross-center games in the test window — this diagnostic could not run.");
  } else {
    out.push(
      table(
        METRIC_HEADERS,
        crossRanked.map((e) => metricsRow(e.name, e.crossCenter)),
        METRIC_ALIGNS,
      ),
    );
    out.push(
      "",
      "These are games where visitors are present, scored using ratings largely learned",
      "inside separate center pools. If log-loss here sits at ~0.6931 the global number",
      "is fiction, and ratings should be scoped per center or per circuit instead.",
    );
  }

  // -- 5. calibration ------------------------------------------------------
  const best = ranked[0];
  if (best) {
    h(`5. Calibration — ${best.name}`);
    out.push(
      table(
        ["bucket", "n", "mean predicted", "observed win rate"],
        best.overall.buckets.map((b) => [
          `${b.lo.toFixed(1)}–${b.hi.toFixed(1)}`,
          String(b.n),
          f3(b.meanPredicted),
          f3(b.observedRate),
        ]),
        ["l", "r", "r", "r"],
      ),
    );
    out.push("", "Predicted and observed should track each other down the whole range.");
  }

  // -- 6. lambda sweep -----------------------------------------------------
  const sweep = input.evaluations.filter((e) => e.name.includes("λ="));
  if (sweep.length > 0) {
    h("6. MVP weighting (λ) sweep");
    out.push(
      table(
        ["model", "log-loss", "Δ vs λ=0", "accuracy"],
        sweep.map((e) => {
          const baseline = sweep.find((s) => s.name.includes("λ=0)"));
          const delta = baseline ? e.overall.logLoss - baseline.overall.logLoss : NaN;
          return [
            e.name,
            f4(e.overall.logLoss),
            Number.isFinite(delta) ? (delta <= 0 ? f4(delta) : `+${f4(delta)}`) : "—",
            pct(e.overall.accuracy),
          ];
        }),
        ["l", "r", "r", "r"],
      ),
    );
    out.push(
      "",
      "λ=0 is plain Weng-Lin, and is the baseline for both MVP families. A negative Δ",
      "means MVP weighting genuinely improves prediction; treat a Δ smaller than about",
      "0.005 as noise rather than a result.",
      "",
      "Watch accuracy and cal-err separately here. MVP weighting tends to RAISE accuracy",
      "while WORSENING calibration — that pattern means the MVP contrast carries real",
      "signal about who is better, but the update magnitude built on it is too large.",
      "A rating that is more often right yet systematically overconfident is worse for",
      "publication, not better, because readers treat the number as a probability.",
      "",
      "`delta` is the unbounded additive correction; `score` blends MVP into each",
      "player's effective outcome and is clamped to [0,1]. If `delta` degrades sharply",
      "as λ grows while `score` degrades gently, that is the additive form's missing",
      "restoring force showing up as an unbounded random walk in the ratings.",
    );
  }

  // -- 6b. margin of victory ------------------------------------------------
  const margin = input.evaluations.filter((e) => e.name.includes("γ="));
  if (margin.length > 0) {
    const base = input.evaluations.find((e) => e.name.includes("λ=0)"));
    h("6b. Margin of victory (γ) sweep");
    out.push(
      table(
        ["model", "log-loss", "Δ vs γ=0", "accuracy", "cal-err"],
        margin.map((e) => {
          const delta = base ? e.overall.logLoss - base.overall.logLoss : NaN;
          return [
            e.name,
            f4(e.overall.logLoss),
            Number.isFinite(delta) ? (delta <= 0 ? f4(delta) : `+${f4(delta)}`) : "—",
            pct(e.overall.accuracy),
            f3(e.overall.calibrationError),
          ];
        }),
        ["l", "r", "r", "r", "r"],
      ),
    );
    out.push(
      "",
      "A different use of MVP from the λ sweep: instead of splitting credit BETWEEN",
      "teammates, the team's total MVP says how dominant the win was, and scales how far",
      "ratings move. γ=0 is plain Weng-Lin (the M2 row above). `score margin` is the same",
      "idea driven by raw team score instead, as a control — if score works and MVP does",
      "not, the signal is scoreline dominance rather than anything MVP adds.",
    );
  }

  // -- 7. convergence & position bias --------------------------------------
  if (best) {
    // Not necessarily the winning model: only the Bayesian models track sigma at
    // all, so take the best-ranked one that does rather than skipping the
    // diagnostic entirely when a point-estimate model wins.
    const converging = ranked.find((e) => e.sigmaByGames.length > 0);
    if (converging) {
      h(`7. Rating convergence — ${converging.name}`);
      out.push(
        table(
          ["games played >=", "players", "mean sigma"],
          converging.sigmaByGames.map((r) => [String(r.games), String(r.n), f3(r.meanSigma)]),
          ["r", "r", "r"],
        ),
      );
      out.push(
        "",
        "Where this curve flattens is where a rating has converged — that, not a round",
        "number, is what should set the min-games display threshold.",
      );
    }

    h(`8. Position bias — ${best.name}`);
    const positionNames: Record<number, string> = {
      1: "Commander",
      2: "Heavy",
      3: "Scout",
      4: "Ammo",
      5: "Medic",
    };
    const truth = input.truthByPosition;
    out.push(
      table(
        truth
          ? ["modal position", "players", "mean rating", "mean TRUE skill"]
          : ["modal position", "players", "mean rating"],
        [...best.ratingByPosition.entries()].map(([position, v]) => {
          const row = [
            positionNames[position] ?? `position ${position}`,
            String(v.n),
            f3(v.meanRating),
          ];
          if (truth) row.push(f3(truth.get(position)?.meanRating ?? NaN));
          return row;
        }),
        truth ? ["l", "r", "r", "r"] : ["l", "r", "r"],
      ),
    );
    out.push(
      "",
      "Grouping is by MODAL position, which is a noisy label when players rotate — the",
      "groups can genuinely differ in skill, so a tilt is NOT by itself evidence of a",
      "leak. Read it against a baseline: it is only a normalisation failure if the",
      "rating tilts in a way the underlying skill does not.",
    );
    if (truth) {
      out.push(
        "",
        "Here the true-skill column IS the baseline: if the two columns rank the",
        "positions the same way, the model is tracking a real (if accidental) skill",
        "difference between these groups rather than leaking position effects.",
      );
    } else {
      out.push(
        "",
        "On real data there is no ground truth. Compare instead against the raw MVP",
        "spread: a rating tilt much larger than the win-rate tilt across the same groups",
        "is the signature of position effects surviving the z-score.",
      );
    }
  }

  // -- 9. synthetic check --------------------------------------------------
  if (input.syntheticCheck) {
    h("9. Synthetic recovery check (Spearman vs known true skill)");
    out.push(
      table(
        ["model", "spearman", "verdict"],
        input.syntheticCheck.map((s) => [s.model, f3(s.spearman), s.pass ? "PASS" : "FAIL"]),
        ["l", "r", "l"],
      ),
    );
  }

  // -- 9b. teammate luck ----------------------------------------------------
  if (input.teammateLuck) {
    h("9b. Teammate luck — does a bad team drag your rating down?");
    out.push(
      table(
        ["model", "players", "teammate-luck corr"],
        [...input.teammateLuck]
          .sort((a, b) => Math.abs(a.correlation) - Math.abs(b.correlation))
          .map((t) => [t.model, String(t.n), f3(t.correlation)]),
        ["l", "r", "r"],
      ),
    );
    out.push(
      "",
      "Correlation between how strong a player's teammates were and how far their",
      "rating departs from their KNOWN true skill. Teams are assigned at random here,",
      "so teammate quality is pure luck and any correlation is the model mistaking that",
      "luck for skill.",
      "",
      "0 means carrying a weak team costs you nothing once enough games accumulate.",
      "Positive means players with strong teammates are flattered and players stuck with",
      "weak ones are punished. This is a FAIRNESS measure, and it is separate from",
      "whether the model predicts winners well — a model can be good at one and bad at",
      "the other, so read it alongside section 3 rather than instead of it.",
    );
  }

  // -- 9c. bootstrap ---------------------------------------------------------
  const boot = input.bootstrap;
  if (boot) {
    h(`9c. Bootstrap confidence — ${boot.model} (${boot.samples} resamples)`);
    const widthBuckets = [
      { min: 25, label: "25–49" },
      { min: 50, label: "50–99" },
      { min: 100, label: "100–199" },
      { min: 200, label: "200+" },
    ];
    const rows: string[][] = [];
    for (const [i, bucket] of widthBuckets.entries()) {
      const max = widthBuckets[i + 1]?.min ?? Infinity;
      const widths: number[] = [];
      for (const r of input.bestModel.ratings.values()) {
        if (r.games < bucket.min || r.games >= max) continue;
        const ci = boot.intervals.get(r.playerId);
        if (ci) widths.push(ci.hi - ci.lo);
      }
      if (widths.length === 0) continue;
      widths.sort((x, y) => x - y);
      rows.push([bucket.label, String(widths.length), f3(widths[Math.floor(widths.length / 2)])]);
    }
    out.push(table(["games played", "players", "median 95% CI width"], rows, ["l", "r", "r"]));
    out.push(
      "",
      "Games are resampled with replacement and the model refitted, so this is the",
      "spread attributable to which games happened to be played — the batch model's",
      "answer to the uncertainty that Weng-Lin's sigma provides directly.",
      "",
      "Compare the CI width against the rating gaps in the leaderboard below. Where the",
      "interval is wider than the gap between adjacent players, those two ranks are not",
      "distinguishable and the ordering between them is noise.",
    );

    // Rank stability is the question a leaderboard actually poses, and it is a
    // strictly easier one than pinning the rating: system-wide scale and
    // location shifts move every rating together and cancel out of the ordering.
    const ranked = [...input.bestModel.ratings.values()]
      .filter((r) => r.games >= input.minGamesForTop)
      .map((r) => ({ r, ci: boot.intervals.get(r.playerId) }))
      .filter((x) => x.ci && Number.isFinite(x.ci.rankLo))
      .sort((a, b) => a.ci!.rankMedian - b.ci!.rankMedian);

    const bands = [
      { lo: 1, hi: 10, label: "top 10" },
      { lo: 11, hi: 25, label: "11–25" },
      { lo: 26, hi: 50, label: "26–50" },
      { lo: 51, hi: 100, label: "51–100" },
    ];
    const bandRows: string[][] = [];
    for (const band of bands) {
      const members = ranked.filter(
        (x) => x.ci!.rankMedian >= band.lo && x.ci!.rankMedian <= band.hi,
      );
      if (members.length === 0) continue;
      const widths = members.map((x) => x.ci!.rankHi - x.ci!.rankLo).sort((a, b) => a - b);
      bandRows.push([
        band.label,
        String(members.length),
        String(widths[Math.floor(widths.length / 2)]),
        pct(members.reduce((s, x) => s + x.ci!.pTop10, 0) / members.length),
      ]);
    }
    out.push(
      "",
      table(["median rank band", "players", "median rank range", "mean P(top 10)"], bandRows, [
        "l",
        "r",
        "r",
        "r",
      ]),
    );
    out.push(
      "",
      `Out of ${ranked.length} qualified players. A rank range of ±5 near the top of a`,
      "board this size is a far stronger claim than the rating intervals above imply,",
      "because the shared uncertainty cancels. Read this table, not the CI widths, when",
      "deciding whether a numbered leaderboard is defensible.",
    );
  }

  // -- 10. leaderboard -----------------------------------------------------
  h(`10. Top ${input.topN} — ${input.bestModel.name} (min ${input.minGamesForTop} games)`);
  const top = [...input.bestModel.ratings.values()]
    .filter((r) => r.games >= input.minGamesForTop)
    .map((r) => ({ r, display: r.sigma === null ? r.mu : r.mu - 3 * r.sigma }))
    .sort((a, b) => b.display - a.display)
    .slice(0, input.topN);

  const ci = input.bootstrap?.intervals ?? null;
  out.push(
    table(
      ci
        ? ["#", "callsign", "rating", "rank range", "95% CI", "games", "W-L-D"]
        : ["#", "callsign", "rating", "mu", "sigma", "games", "W-L-D"],
      top.map((t, i) => {
        const head = [String(i + 1), t.r.callsign, f3(t.display)];
        const tail = [String(t.r.games), `${t.r.wins}-${t.r.losses}-${t.r.draws}`];
        if (ci) {
          const b = ci.get(t.r.playerId);
          return [
            ...head,
            b && Number.isFinite(b.rankLo) ? `${b.rankLo}–${b.rankHi}` : "—",
            b ? `${f3(b.lo)} … ${f3(b.hi)}` : "—",
            ...tail,
          ];
        }
        return [...head, f3(t.r.mu), t.r.sigma === null ? "—" : f3(t.r.sigma), ...tail];
      }),
      ci ? ["r", "l", "r", "r", "r", "r", "l"] : ["r", "l", "r", "r", "r", "r", "l"],
    ),
  );
  out.push(
    "",
    "`rating` is the conservative estimate (mu − 3·sigma) where uncertainty is tracked.",
    "Eyeball this against reality: if known-strong players are missing, something is",
    "wrong with the model or the filters no matter what the log-loss says.",
  );

  out.push("");
  return out.join("\n");
}

export function writeReport(
  input: ReportInput,
  text: string,
): { textPath: string; csvPath: string; jsonPath: string } {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = join(LOG_DIR, `rating-bakeoff-${input.mode}-${stamp}`);
  mkdirSync(dirname(base), { recursive: true });

  const textPath = `${base}.txt`;
  writeFileSync(textPath, text, "utf8");

  const csvPath = `${base}.csv`;
  const csvRows = [
    "player_id,callsign,games,wins,losses,draws,mu,sigma,conservative,modal_position",
  ];
  for (const r of input.bestModel.ratings.values()) {
    let modal = 0;
    let bestCount = -1;
    for (const [position, count] of r.positionCounts) {
      if (count > bestCount) {
        bestCount = count;
        modal = position;
      }
    }
    const conservative = r.sigma === null ? r.mu : r.mu - 3 * r.sigma;
    csvRows.push(
      [
        r.playerId,
        `"${r.callsign.replace(/"/g, '""')}"`,
        r.games,
        r.wins,
        r.losses,
        r.draws,
        r.mu.toFixed(6),
        r.sigma === null ? "" : r.sigma.toFixed(6),
        conservative.toFixed(6),
        modal,
      ].join(","),
    );
  }
  writeFileSync(csvPath, csvRows.join("\n"), "utf8");

  const jsonPath = `${base}.json`;
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        mode: input.mode,
        generatedAt: new Date().toISOString(),
        socialWeight: input.socialWeight,
        trainFraction: input.trainFraction,
        loadStats: input.loadStats,
        connectivity: input.connectivity,
        evaluations: input.evaluations.map((e) => ({
          name: e.name,
          overall: e.overall,
          crossCenter: e.crossCenter,
          ratingByPosition: Object.fromEntries(e.ratingByPosition),
          sigmaByGames: e.sigmaByGames,
        })),
        syntheticCheck: input.syntheticCheck,
      },
      null,
      2,
    ),
    "utf8",
  );

  return { textPath, csvPath, jsonPath };
}
