// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Global player rating — offline model bake-off.
 *
 * Read-only. Loads every rateable SM5 game, runs several candidate rating models
 * through one leak-free prequential pass, and reports which one actually
 * predicts game outcomes out of sample. Nothing is written to the database; the
 * output is a report under `packages/db/logs/`.
 *
 * This exists to answer "is a global rating worth building, and which model?"
 * BEFORE any schema, ingest hook or UI is committed to.
 *
 * Usage:
 *   pnpm --filter @lfstats/db rating-bakeoff --synthetic   # self-test, no DB
 *   pnpm --filter @lfstats/db rating-bakeoff              # full run
 *
 *   --social-weight=0.5     how much a social/nightly game counts vs competition
 *   --train-fraction=0.6    warm-up share of games, not scored
 *   --lambda=0,0.3,0.6      MVP-weighting values to sweep
 *   --top=50                leaderboard rows to print
 *   --min-games=25          minimum games to appear in the leaderboard
 */

import { initDb } from "../../client";
import { BatchBtModel, DEFAULT_BATCH_BT } from "./batch-bt";
import {
  analyseConnectivity,
  evaluatePrequential,
  spearman,
  teammateLuckBias,
  valueByModalPosition,
  type ModelEvaluation,
  type TeammateLuck,
} from "./evaluate";
import { loadSm5Games, type LoadStats } from "./load";
import {
  CoinFlipModel,
  DEFAULT_ELO,
  DEFAULT_WENG_LIN,
  EloModel,
  MvpMeanModel,
  WengLinModel,
  WinRateModel,
} from "./models";
import {
  computePositionMvpStats,
  contextWeight,
  fitMarginScale,
  marginMultiplier,
  rawMargin,
} from "./normalize";
import { renderReport, writeReport, type ReportInput } from "./report";
import { DEFAULT_SYNTHETIC, generateSynthetic } from "./synthetic";
import type { GameRecord, RatingModel } from "./types";

/** Models held to the synthetic recovery bar. The M0 baselines are informational. */
const GATED_PREFIXES = ["M1", "M2", "M3", "M4"];
const SPEARMAN_PASS = 0.9;

function flag(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 3));
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number, got: ${raw}`);
  return value;
}

function listFlag(name: string, fallback: number[]): number[] {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const values = raw
    .slice(name.length + 3)
    .split(",")
    .map((s) => Number(s.trim()));
  if (values.some((v) => !Number.isFinite(v))) {
    throw new Error(`--${name} must be a comma-separated list of numbers, got: ${raw}`);
  }
  return values;
}

const synthetic = process.argv.includes("--synthetic");
const socialWeight = flag("social-weight", 0.5);
const trainFraction = flag("train-fraction", 0.6);
// Spans the shallow optimum near 0.02–0.05 as well as the large values where the
// additive form destabilises — a coarser grid misses both.
const lambdas = listFlag("lambda", [0, 0.02, 0.05, 0.15, 0.5, 1.0]);
// Margin-of-victory strength. 0 is plain Weng-Lin, so it is omitted (that is M2).
const gammas = listFlag("gamma", [0.25, 0.5, 0.75, 1.0]);
const topN = flag("top", 50);
// 0 disables. 200 gives stable 95% percentile bounds without a long runtime.
const bootstrapSamples = flag("bootstrap", 0);
// L2 trades spread for stability: more shrinkage pulls sparse players toward
// average, tightening ranks at the cost of flattening real differences.
const l2 = flag("l2", DEFAULT_BATCH_BT.l2);
const minGamesForTop = flag("min-games", synthetic ? 5 : 25);

if (trainFraction <= 0 || trainFraction >= 1) {
  throw new Error(`--train-fraction must be strictly between 0 and 1, got ${trainFraction}`);
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

let games: GameRecord[];
let loadStats: LoadStats | null = null;
let trueSkill: Map<string, number> | null = null;

if (synthetic) {
  console.log("Generating synthetic games from known skills…");
  const result = generateSynthetic(DEFAULT_SYNTHETIC);
  games = result.games;
  trueSkill = result.trueSkill;
  console.log(
    `  ${games.length} games, ${DEFAULT_SYNTHETIC.players} players, ${DEFAULT_SYNTHETIC.teamSize}v${DEFAULT_SYNTHETIC.teamSize}`,
  );
} else {
  await initDb();
  console.log("Loading SM5 games…");
  const result = await loadSm5Games();
  games = result.games;
  loadStats = result.stats;
  console.log(
    `  ${loadStats.gamesKept} games, ${loadStats.distinctPlayers} players, ${loadStats.distinctCenters} centers`,
  );
}

if (games.length < 50) {
  console.error(`Only ${games.length} rateable games — not enough to evaluate. Aborting.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build models
// ---------------------------------------------------------------------------

// Fitted on the warm-up games ONLY. Fitting on the full set would leak
// test-period MVP distributions into every prediction.
const cutoff = Math.floor(games.length * trainFraction);
const positionStats = computePositionMvpStats(games.slice(0, cutoff));

const weightOf = (g: GameRecord) => contextWeight(g, { socialWeight });

// Also fitted on warm-up games only, and normalised to average 1 so enabling
// margin does not silently rescale every update.
const mvpMarginScale = fitMarginScale(games.slice(0, cutoff), "mvp");
const scoreMarginScale = fitMarginScale(games.slice(0, cutoff), "score");

const models: RatingModel[] = [
  new CoinFlipModel(),
  new WinRateModel(),
  new MvpMeanModel(positionStats),
  new EloModel(DEFAULT_ELO, weightOf),
  ...lambdas.map(
    (lambda) =>
      new WengLinModel(
        { ...DEFAULT_WENG_LIN, lambda, mvpMode: "delta" },
        weightOf,
        positionStats,
        lambda === 0 ? "M2 Weng-Lin (λ=0)" : `M3 Weng-Lin+MVP delta (λ=${lambda})`,
      ),
  ),
  // Same MVP signal, entered as a bounded per-player outcome instead of an
  // unbounded additive correction. λ=0 is omitted: it is identical to M2.
  ...lambdas
    .filter((lambda) => lambda !== 0)
    .map(
      (lambda) =>
        new WengLinModel(
          { ...DEFAULT_WENG_LIN, lambda, mvpMode: "score" },
          weightOf,
          positionStats,
          `M5 Weng-Lin+MVP score (λ=${lambda})`,
        ),
    ),
  // M6/M7 — margin of victory. MVP is used here as a read on how strongly each
  // SIDE played as a unit, scaling how much the game moves ratings, rather than
  // splitting credit between teammates as M3/M5 do.
  ...gammas.flatMap((gamma) => [
    new WengLinModel(
      DEFAULT_WENG_LIN,
      (g) => weightOf(g) * marginMultiplier(g, "mvp", mvpMarginScale, gamma),
      positionStats,
      `M6 Weng-Lin+MVP margin (γ=${gamma})`,
    ),
    new WengLinModel(
      DEFAULT_WENG_LIN,
      (g) => weightOf(g) * marginMultiplier(g, "score", scoreMarginScale, gamma),
      positionStats,
      `M7 Weng-Lin+score margin (γ=${gamma})`,
    ),
  ]),
  // M8 — both at once. Margin (how dominant the win was) sets how far the game
  // moves ratings; the MVP blend then decides how that movement is shared out
  // within each side. The two are independent knobs: one is about the game, the
  // other about the players in it.
  ...[0.05, 0.1, 0.15].map(
    (lambda) =>
      new WengLinModel(
        { ...DEFAULT_WENG_LIN, lambda, mvpMode: "score" },
        (g) => weightOf(g) * marginMultiplier(g, "score", scoreMarginScale, 0.5),
        positionStats,
        `M8 margin(γ=0.5)+MVP(λ=${lambda})`,
      ),
  ),
  new BatchBtModel({ ...DEFAULT_BATCH_BT, l2 }, weightOf),
  // M4 + margin as a sample WEIGHT: dominant wins count for more.
  ...[0.25, 0.5, 1.0].map(
    (gamma) =>
      new BatchBtModel(
        { ...DEFAULT_BATCH_BT, l2 },
        (g) => weightOf(g) * marginMultiplier(g, "score", scoreMarginScale, gamma),
        null,
        `M4w batch BT + margin weight (γ=${gamma})`,
      ),
  ),
  // M4 + margin as a soft LABEL: a narrow win is a weaker claim than a rout.
  // The hard result stays authoritative — alpha only pulls the target toward
  // what the scoreline implies, so a win is never relabelled as a loss.
  ...[0.15, 0.3, 0.5].map(
    (alpha) =>
      new BatchBtModel(
        { ...DEFAULT_BATCH_BT, l2 },
        weightOf,
        (g, hard) => {
          const m = rawMargin(g, "score");
          if (m === null) return null;
          return (1 - alpha) * hard + alpha * (1 / (1 + Math.exp(-m / scoreMarginScale.sd)));
        },
        `M4s batch BT + margin label (α=${alpha})`,
      ),
  ),
];

console.log(`Evaluating ${models.length} models over ${games.length} games…`);
const evaluations: ModelEvaluation[] = evaluatePrequential(games, models, { trainFraction });
const connectivity = analyseConnectivity(games);

// ---------------------------------------------------------------------------
// Synthetic recovery check
// ---------------------------------------------------------------------------

let syntheticCheck: { model: string; spearman: number; pass: boolean }[] | null = null;
let truthByPosition: Map<number, { n: number; meanRating: number }> | null = null;
let teammateLuck: TeammateLuck[] | null = null;

if (trueSkill) {
  // Same grouping as the position-bias diagnostic, but over KNOWN skill — the
  // baseline that tells a genuine group difference apart from a leak.
  const skills = trueSkill;
  truthByPosition = valueByModalPosition(
    models[models.length - 1]!.ratings(),
    (r) => skills.get(r.playerId) ?? 0,
  );
  teammateLuck = models
    .filter((m) => !m.name.startsWith("M0a"))
    .map((m) => teammateLuckBias(games, m, skills, 20));

  syntheticCheck = models.map((model) => {
    const estimated: number[] = [];
    const actual: number[] = [];
    for (const [playerId, truth] of trueSkill) {
      const r = model.ratings().get(playerId);
      if (!r || r.games < 5) continue;
      estimated.push(r.sigma === null ? r.mu : r.mu - 3 * r.sigma);
      actual.push(truth);
    }
    const rho = spearman(estimated, actual);
    const gated = GATED_PREFIXES.some((p) => model.name.startsWith(p));
    return { model: model.name, spearman: rho, pass: !gated || rho >= SPEARMAN_PASS };
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

// Best = lowest out-of-sample log-loss among models that actually produce a
// rating. The coin flip is excluded because its "ratings" are all zero.
const rateable = evaluations.filter((e) => !e.name.startsWith("M0a"));
const bestEval = [...rateable].sort((a, b) => a.overall.logLoss - b.overall.logLoss)[0]!;
const bestModel = models.find((m) => m.name === bestEval.name)!;

const input: ReportInput = {
  mode: synthetic ? "synthetic" : "real",
  loadStats,
  connectivity,
  evaluations,
  bestModel: { name: bestModel.name, ratings: bestModel.ratings() },
  syntheticCheck,
  truthByPosition,
  teammateLuck,
  socialWeight,
  trainFraction,
  topN,
  minGamesForTop,
  bootstrap: null,
};

// ---------------------------------------------------------------------------
// Bootstrap confidence intervals
// ---------------------------------------------------------------------------

// Refit the winning batch model on the FULL history (the prequential instance
// only ever saw a rolling window), then resample games to get intervals.
if (bootstrapSamples > 0) {
  const winner = models.find((m) => m.name === bestEval.name);
  if (winner instanceof BatchBtModel) {
    console.log(`Bootstrapping ${bestEval.name} with ${bootstrapSamples} resamples…`);
    const started = Date.now();
    input.bootstrap = {
      model: bestEval.name,
      samples: bootstrapSamples,
      intervals: winner.bootstrapIntervals(bootstrapSamples, 20260814, minGamesForTop),
    };
    console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } else {
    console.log(`Skipping bootstrap: the best model (${bestEval.name}) is not a batch model.`);
  }
}

const text = renderReport(input);
const paths = writeReport(input, text);

console.log(text);
console.log(`Report:  ${paths.textPath}`);
console.log(`Ratings: ${paths.csvPath}`);
console.log(`Metrics: ${paths.jsonPath}`);

const failures = syntheticCheck?.filter((s) => !s.pass) ?? [];
if (failures.length > 0) {
  console.error(
    `\nFAIL: ${failures.length} model(s) did not recover known skills (Spearman < ${SPEARMAN_PASS}):`,
  );
  for (const f of failures) console.error(`  ${f.model}: ${f.spearman.toFixed(3)}`);
  process.exit(1);
}

process.exit(0);
