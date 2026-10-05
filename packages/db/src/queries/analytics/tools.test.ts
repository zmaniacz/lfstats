// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mcpTools, metricsMarkdown, toolInputSchema } from "./tools";

describe("MCP tools", () => {
  const tools = mcpTools();

  it("has one uniquely named lfstats_ tool per endpoint", () => {
    const names = tools.map((t) => t.name);
    assert.deepEqual(new Set(names).size, names.length);
    assert.deepEqual(names.sort(), [
      "lfstats_catalog",
      "lfstats_game_detail",
      "lfstats_leaderboard",
      "lfstats_player_stats",
      "lfstats_resolve",
      "lfstats_search_games",
    ]);
  });

  it("publishes closed object schemas, so invented arguments are visible to the client", () => {
    for (const t of tools) {
      const schema = toolInputSchema(t);
      assert.equal(schema.type, "object", t.name);
      assert.equal(schema.additionalProperties, false, t.name);
      assert.ok(!("$schema" in schema), t.name);
    }
  });

  it("marks required arguments as required", () => {
    const leaderboard = toolInputSchema(tools.find((t) => t.name === "lfstats_leaderboard")!);
    assert.deepEqual(leaderboard.required, ["sort_by"]);
    const detail = toolInputSchema(tools.find((t) => t.name === "lfstats_game_detail")!);
    assert.deepEqual(detail.required, ["slug"]);
  });

  it("carries field descriptions into the JSON Schema", () => {
    const stats = toolInputSchema(tools.find((t) => t.name === "lfstats_player_stats")!);
    const players = (stats.properties as Record<string, { description?: string }>).players!;
    assert.match(players.description ?? "", /1–10 players/);
  });

  it("lists every metric in the ranking tools' descriptions", () => {
    const desc = tools.find((t) => t.name === "lfstats_leaderboard")!.description;
    assert.match(desc, /avg_mvp/);
    assert.match(desc, /avg_nukes_detonated \(commander only\)/);
  });

  it("validates game_detail booleans as booleans, unlike the HTTP query string", () => {
    const detail = tools.find((t) => t.name === "lfstats_game_detail")!;
    assert.equal(
      detail.schema.safeParse({ slug: "4-23-1", include_penalties: "true" }).success,
      false,
    );
    assert.equal(
      detail.schema.safeParse({ slug: "4-23-1", include_penalties: true }).success,
      true,
    );
  });

  it("renders the metrics resource as a Markdown table", () => {
    assert.match(metricsMarkdown(), /^\| `avg_mvp` \| Average MVP \|/m);
  });
});
