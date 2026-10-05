// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { ScopeSchema, ScopeOverrideSchema } from "../../schemas/query-api";
import { QueryApiError } from "./errors";
import {
  localToday,
  mergeScope,
  normalizeScope,
  resolveDatePreset,
  scopeGameConditions,
  scopeScorecardConditions,
  SM5_SOURCE,
  type NormalizedScope,
  type ResolvedScope,
} from "./scope";

const TODAY = "2026-10-04";
const dialect = new PgDialect();

function render(conditions: ReturnType<typeof scopeGameConditions>) {
  return dialect.sqlToQuery(and(...conditions)!);
}

function resolved(scope: NormalizedScope, extra: Partial<ResolvedScope> = {}): ResolvedScope {
  return { ...scope, centerRefs: null, competitionRefs: null, ...extra };
}

function normalize(input: unknown) {
  return normalizeScope(ScopeSchema.parse(input), TODAY);
}

function assertScopeError(fn: () => unknown, code: string, field?: string) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof QueryApiError, "expected a QueryApiError");
    assert.equal(err.code, code);
    if (field) assert.equal(err.field, field);
    return true;
  });
}

describe("resolveDatePreset", () => {
  it("runs last_N_days from N days ago through today, inclusive", () => {
    assert.deepEqual(resolveDatePreset("last_365_days", TODAY), {
      from: "2025-10-04",
      to: "2026-10-04",
    });
    assert.deepEqual(resolveDatePreset("last_30_days", TODAY), {
      from: "2026-09-04",
      to: "2026-10-04",
    });
    assert.deepEqual(resolveDatePreset("last_90_days", TODAY), {
      from: "2026-07-06",
      to: "2026-10-04",
    });
  });

  it("treats years as calendar years", () => {
    assert.deepEqual(resolveDatePreset("this_year", TODAY), { from: "2026-01-01", to: TODAY });
    assert.deepEqual(resolveDatePreset("last_year", TODAY), {
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("crosses leap days and year boundaries correctly", () => {
    assert.deepEqual(resolveDatePreset("last_30_days", "2024-03-15"), {
      from: "2024-02-14",
      to: "2024-03-15",
    });
    assert.deepEqual(resolveDatePreset("last_30_days", "2026-01-10"), {
      from: "2025-12-11",
      to: "2026-01-10",
    });
  });

  it("leaves all_time unbounded", () => {
    assert.deepEqual(resolveDatePreset("all_time", TODAY), { from: null, to: null });
  });
});

describe("localToday", () => {
  it("uses local calendar fields, not UTC", () => {
    assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  });
});

describe("normalizeScope", () => {
  it("fills defaults for an empty scope", () => {
    assert.deepEqual(normalize({}), {
      game_type: "sm5",
      centers: null,
      competitions: null,
      game_kind: "all",
      round_types: null,
      date_range: { preset: null, from: null, to: null },
      positions: null,
      team_result: null,
      include_mercenary_games: true,
      include_excluded: false,
    });
  });

  it("defaults mercenary games off only when competitions are named", () => {
    assert.equal(
      normalize({ competitions: ["internationals_2026"] }).include_mercenary_games,
      false,
    );
    assert.equal(normalize({ centers: ["4-23"] }).include_mercenary_games, true);
    assert.equal(
      normalize({ competitions: ["x"], include_mercenary_games: true }).include_mercenary_games,
      true,
    );
    assert.equal(
      normalize({ competitions: ["x"], include_mercenary_games: null }).include_mercenary_games,
      false,
    );
  });

  it("reports no mercenary setting for Laserball", () => {
    assert.equal(normalize({ game_type: "lb" }).include_mercenary_games, null);
  });

  it("expands a date preset and keeps the preset name for the echo", () => {
    assert.deepEqual(normalize({ date_range: { preset: "last_year" } }).date_range, {
      preset: "last_year",
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("accepts a one-sided explicit range", () => {
    assert.deepEqual(normalize({ date_range: { from: "2026-01-01" } }).date_range, {
      preset: null,
      from: "2026-01-01",
      to: null,
    });
  });

  it("dedupes list filters", () => {
    assert.deepEqual(normalize({ centers: ["4-23", "4-23", "4-19"] }).centers, ["4-23", "4-19"]);
  });

  it("rejects a preset combined with explicit dates", () => {
    assertScopeError(
      () => normalize({ date_range: { preset: "this_year", from: "2026-01-01" } }),
      "invalid_scope",
      "scope.date_range",
    );
  });

  it("rejects an inverted date range", () => {
    assertScopeError(
      () => normalize({ date_range: { from: "2026-05-01", to: "2026-04-01" } }),
      "invalid_scope",
    );
  });

  it("rejects round_types without competitions", () => {
    assertScopeError(
      () => normalize({ round_types: ["finals"] }),
      "invalid_scope",
      "scope.round_types",
    );
  });

  it("rejects positions and round types for Laserball", () => {
    assertScopeError(
      () => normalize({ game_type: "lb", positions: ["medic"] }),
      "invalid_scope",
      "scope.positions",
    );
    assertScopeError(
      () => normalize({ game_type: "lb", competitions: ["x"], round_types: ["finals"] }),
      "invalid_scope",
      "scope.round_types",
    );
  });
});

describe("ScopeSchema", () => {
  it("rejects unknown fields instead of ignoring them", () => {
    const result = ScopeSchema.safeParse({ centers: ["4-23"], event_id: 84 });
    assert.equal(result.success, false);
    assert.equal(result.error!.issues[0]!.code, "unrecognized_keys");
  });

  it("rejects a center name where a slug is expected", () => {
    assert.equal(ScopeSchema.safeParse({ centers: ["Loveland"] }).success, false);
  });

  it("rejects unknown positions", () => {
    assert.equal(ScopeSchema.safeParse({ positions: ["sniper"] }).success, false);
  });
});

describe("mergeScope", () => {
  const base = ScopeSchema.parse({
    centers: ["4-23"],
    positions: ["medic"],
    date_range: { preset: "all_time" },
  });

  it("replaces set fields, removes nulls, and inherits the rest", () => {
    const override = ScopeOverrideSchema.parse({
      positions: null,
      date_range: { preset: "last_365_days" },
    });
    assert.deepEqual(mergeScope(base, override), {
      centers: ["4-23"],
      date_range: { preset: "last_365_days" },
    });
  });

  it("does not let an override change the game type", () => {
    assert.equal(ScopeOverrideSchema.safeParse({ game_type: "lb" }).success, false);
  });
});

describe("scopeGameConditions", () => {
  it("always restricts game type and drops excluded games", () => {
    const { sql, params } = render(scopeGameConditions(resolved(normalize({}))));
    assert.match(sql, /"game"\."type" = \$1/);
    assert.match(sql, /"game"\."exclude" = \$2/);
    assert.deepEqual(params, ["sm5", false]);
  });

  it("keeps excluded games only when asked", () => {
    const { sql } = render(scopeGameConditions(resolved(normalize({ include_excluded: true }))));
    assert.doesNotMatch(sql, /exclude/);
  });

  it("uses inclusive day bounds: from midnight through the end of `to`", () => {
    const { sql, params } = render(
      scopeGameConditions(
        resolved(normalize({ date_range: { from: "2026-01-01", to: "2026-01-31" } })),
      ),
    );
    assert.match(sql, /"game"\."start_time" >= \$\d+::date/);
    assert.match(sql, /"game"\."start_time" < \(\$\d+::date \+ interval '1 day'\)/);
    assert.ok(params.includes("2026-01-01"));
    assert.ok(params.includes("2026-01-31"));
  });

  it("filters centers and competitions by resolved id", () => {
    const scope = resolved(normalize({ centers: ["4-23"], competitions: ["intl"] }), {
      centerRefs: [{ id: "center-uuid", slug: "4-23", name: "X" }],
      competitionRefs: [{ id: "comp-uuid", slug: "intl", name: "Intl" }],
    });
    const { sql, params } = render(scopeGameConditions(scope));
    assert.match(sql, /"game"\."center_id" in \(\$\d+\)/);
    assert.match(sql, /"game"\."competition_id" in \(\$\d+\)/);
    assert.ok(params.includes("center-uuid"));
    assert.ok(params.includes("comp-uuid"));
  });

  it("treats social as no competition at all", () => {
    const { sql } = render(scopeGameConditions(resolved(normalize({ game_kind: "social" }))));
    assert.match(sql, /"game"\."competition_id" is null/);
  });

  it("counts only competitive-type competitions as competitive", () => {
    // A game in a social-type competition is neither social nor competitive.
    const { sql } = render(scopeGameConditions(resolved(normalize({ game_kind: "competitive" }))));
    assert.match(
      sql,
      /"game"\."competition_id" in \(select "competition"\."id" from "competition" where "competition"\."type" = 'competitive'\)/,
    );
    assert.doesNotMatch(sql, /is null/);
  });

  it("filters round types through the match schedule", () => {
    const scope = resolved(normalize({ competitions: ["intl"], round_types: ["finals"] }), {
      competitionRefs: [{ id: "comp-uuid", slug: "intl", name: "Intl" }],
    });
    const { sql, params } = render(scopeGameConditions(scope));
    assert.match(sql, /exists \(select 1 from "competition_match_game"/);
    assert.match(sql, /"competition_round"\."type" in \(\$\d+\)/);
    assert.ok(params.includes("finals"));
  });
});

describe("scopeScorecardConditions", () => {
  it("maps positions to their stored codes", () => {
    const conds = scopeScorecardConditions(
      resolved(normalize({ positions: ["heavy", "medic"] })),
      SM5_SOURCE,
    );
    const { sql, params } = dialect.sqlToQuery(and(...conds)!);
    assert.match(sql, /"sm5_scorecard"\."position" in \(\$1, \$2\)/);
    assert.deepEqual(params, [2, 5]);
  });

  it("drops mercenary scorecards only when the scope says so", () => {
    const withComp = scopeScorecardConditions(
      resolved(normalize({ competitions: ["x"] })),
      SM5_SOURCE,
    );
    assert.match(
      dialect.sqlToQuery(and(...withComp)!).sql,
      /"sm5_scorecard"\."is_mercenary" = \$1/,
    );
    assert.equal(scopeScorecardConditions(resolved(normalize({})), SM5_SOURCE).length, 0);
  });

  it("filters on the scorecard's own team result", () => {
    const conds = scopeScorecardConditions(resolved(normalize({ team_result: "win" })), SM5_SOURCE);
    const { sql, params } = dialect.sqlToQuery(and(...conds)!);
    assert.match(sql, /"sm5_game_team"\."result" = \$1/);
    assert.deepEqual(params, ["win"]);
  });
});
