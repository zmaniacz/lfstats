// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { QueryApiError } from "./errors";
import {
  checkMetricPositions,
  getMetric,
  getMetricCatalog,
  metricSql,
  LB_METRICS,
  SM5_METRICS,
} from "./metrics";
import { LB_SOURCE, SM5_SOURCE } from "./scope";

const dialect = new PgDialect();
const render = (id: string) => dialect.sqlToQuery(metricSql(getMetric("sm5", id, "f"), SM5_SOURCE));

describe("metric registry", () => {
  it("has unique ids", () => {
    const ids = SM5_METRICS.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("covers the v1 SM5 catalog in the spec", () => {
    const ids = new Set(SM5_METRICS.map((m) => m.id));
    for (const id of [
      "games",
      "wins",
      "win_rate",
      "avg_mvp",
      "total_mvp",
      "avg_score",
      "avg_accuracy",
      "avg_hit_diff",
      "avg_uptime_pct",
      "avg_shots_hit",
      "avg_times_hit",
      "avg_medic_hits",
      "avg_missiles_hit",
      "avg_eliminations",
      "avg_assists",
      "avg_nukes_detonated",
      "avg_nukes_canceled",
      "avg_lives_left",
      "elimination_rate",
      "avg_resupplies_given",
      "avg_rapid_fire",
      "avg_penalties",
    ]) {
      assert.ok(ids.has(id), `missing ${id}`);
    }
  });

  it("builds SQL for every metric", () => {
    for (const m of SM5_METRICS) {
      const { sql } = dialect.sqlToQuery(metricSql(m, SM5_SOURCE));
      assert.ok(sql.length > 0, m.id);
    }
  });

  it("exposes a JSON-safe catalog without SQL builders", () => {
    const entry = getMetricCatalog().find((m) => m.id === "avg_mvp")!;
    assert.deepEqual(Object.keys(entry).sort(), [
      "definition",
      "game_type",
      "higher_is_better",
      "id",
      "label",
      "positions",
      "unit",
    ]);
    assert.doesNotThrow(() => JSON.stringify(getMetricCatalog()));
  });
});

describe("metricSql", () => {
  it("averages per-game values rather than pooling ratios", () => {
    assert.equal(render("avg_accuracy").sql, '(avg(("sm5_scorecard"."accuracy")::float8))');
  });

  it("counts wins with a filter on the team result", () => {
    const { sql, params } = render("wins");
    assert.equal(sql, '(count(*) filter (where "sm5_game_team"."result" = $1))::int');
    assert.deepEqual(params, ["win"]);
  });

  it("restricts position-specific metrics to their positions", () => {
    const { sql, params } = render("avg_nukes_detonated");
    assert.match(sql, /filter \(where "sm5_scorecard"\."position" in \(\$1\)\)/);
    assert.deepEqual(params, [1]);
  });

  it("refuses to pair a metric with the wrong game type's tables", () => {
    assert.throws(() => metricSql(getMetric("sm5", "games", "f"), LB_SOURCE));
  });
});

describe("getMetric", () => {
  it("suggests the closest id for a typo or a near-miss", () => {
    assert.throws(
      () => getMetric("sm5", "avg_mpv", "sort_by"),
      (err: unknown) => {
        assert.ok(err instanceof QueryApiError);
        assert.equal(err.code, "invalid_metric");
        assert.equal(err.field, "sort_by");
        assert.match(err.hint!, /'avg_mvp'/);
        assert.ok(err.validValues!.includes("avg_hit_diff"));
        return true;
      },
    );
  });

  it("maps common names to the real metric, with its definition", () => {
    assert.throws(
      () => getMetric("sm5", "kd_ratio", "sort_by"),
      (err: QueryApiError) =>
        /Did you mean 'avg_hit_diff'\? Mean of per-game hit_diff/.test(err.hint!),
    );
  });

  it("only aliases to ids that exist", async () => {
    const { SM5_METRICS: metrics } = await import("./metrics");
    const ids = new Set(metrics.map((m) => m.id));
    for (const alias of ["kd", "mvp", "accuracy", "winrate", "kills", "uptime", "nukes"]) {
      assert.throws(
        () => getMetric("sm5", alias, "f"),
        (err: QueryApiError) => ids.has(/'([a-z_]+)'/.exec(err.hint!)![1]!),
      );
    }
  });

  it("suggests ids containing the input", () => {
    assert.throws(
      () => getMetric("sm5", "mvp", "sort_by"),
      (err: QueryApiError) => /'avg_mvp'/.test(err.hint!),
    );
  });
});

describe("checkMetricPositions", () => {
  const nukes = getMetric("sm5", "avg_nukes_detonated", "sort_by");

  it("passes position-independent metrics through", () => {
    assert.equal(checkMetricPositions(getMetric("sm5", "avg_mvp", "f"), ["medic"], "f"), null);
  });

  it("rejects a metric none of the requested positions record", () => {
    assert.throws(
      () => checkMetricPositions(nukes, ["medic"], "sort_by"),
      (err: QueryApiError) => err.code === "metric_not_applicable",
    );
  });

  it("warns when the metric narrows the scope's positions", () => {
    assert.match(checkMetricPositions(nukes, null, "sort_by")!, /commander games only/);
    assert.match(checkMetricPositions(nukes, ["commander", "medic"], "sort_by")!, /commander/);
  });

  it("stays quiet when the scope already matches", () => {
    assert.equal(checkMetricPositions(nukes, ["commander"], "sort_by"), null);
  });
});

describe("Laserball metrics", () => {
  it("covers the Laserball catalog in the spec, all position-free", () => {
    const ids = new Set(LB_METRICS.map((m) => m.id));
    for (const id of [
      "games",
      "wins",
      "win_rate",
      "avg_goals",
      "total_goals",
      "avg_assists",
      "avg_steals",
      "avg_blocks",
      "avg_clears",
      "avg_passes",
      "avg_possession_ms",
    ]) {
      assert.ok(ids.has(id), `missing ${id}`);
    }
    assert.ok(LB_METRICS.every((m) => m.positions === "all"));
  });

  it("builds SQL against the Laserball tables", () => {
    for (const m of LB_METRICS) {
      const { sql } = dialect.sqlToQuery(metricSql(m, LB_SOURCE));
      assert.doesNotMatch(sql, /sm5_/, m.id);
    }
    const { sql } = dialect.sqlToQuery(metricSql(getMetric("lb", "avg_assists", "f"), LB_SOURCE));
    assert.equal(sql, '(avg(("lb_scorecard"."assists1" + "lb_scorecard"."assists2")::float8))');
  });

  it("points an SM5 id used on Laserball, and vice versa, at the game type", () => {
    assert.throws(
      () => getMetric("lb", "avg_mvp", "sort_by"),
      (err: QueryApiError) => /SM5 metric; check scope.game_type/.test(err.hint!),
    );
    assert.throws(
      () => getMetric("sm5", "avg_goals", "sort_by"),
      (err: QueryApiError) => /Laserball metric; check scope.game_type/.test(err.hint!),
    );
  });

  it("maps common Laserball names to metrics", () => {
    assert.throws(
      () => getMetric("lb", "steals", "sort_by"),
      (err: QueryApiError) => /Did you mean 'avg_steals'/.test(err.hint!),
    );
  });
});
