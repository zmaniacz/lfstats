// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// MCP eval (docs/Query_API_Eval.md): 30 real questions run through the LFstats MCP server
// with the MCP SDK client, each checked against an independent SQL query where one exists.
// The tool calls are scripted from the tool descriptions, so this tests the tools' contract
// and answers, not a model's tool choice.
//
//   LFSTATS_API_KEY=lfs_… DATABASE_URL=postgres://… pnpm --filter web mcp:eval
//
// Needs a running server (MCP_URL, default http://localhost:3000/mcp), a key with query:read
// and a rate limit above ~60/minute, and read access to the same database for the checks.
// Expected values assume the live LFstats dataset.

import postgres from "postgres";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const key = process.env.LFSTATS_API_KEY;
if (!key || !process.env.DATABASE_URL) {
  console.error("Set LFSTATS_API_KEY and DATABASE_URL.");
  process.exit(1);
}
const pg = postgres(process.env.DATABASE_URL, { max: 1 });
const client = new Client({ name: "lfstats-mcp-eval", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp"), {
    requestInit: { headers: { authorization: `Bearer ${key}` } },
  }),
);

type R = { isError: boolean; body: any };
const log: string[] = [];
async function call(name: string, args: Record<string, unknown>): Promise<R> {
  const r = await client.callTool({ name, arguments: args });
  const body = JSON.parse((r.content as any)[0].text);
  log.push(`${name}(${JSON.stringify(args)}) → ${r.isError ? `ERROR ${body.error.code}` : "ok"}`);
  return { isError: !!r.isError, body };
}
const results: { n: number; q: string; verdict: string; calls: string[]; answer: string }[] = [];
async function q(
  n: number,
  question: string,
  fn: () => Promise<{ verdict: string; answer: string }>,
) {
  log.length = 0;
  try {
    const { verdict, answer } = await fn();
    results.push({ n, q: question, verdict, calls: [...log], answer });
  } catch (e) {
    results.push({
      n,
      q: question,
      verdict: "FAIL",
      calls: [...log],
      answer: `threw: ${(e as Error).message}`,
    });
  }
}
const ok = (cond: boolean) => (cond ? "PASS" : "FAIL");
const one = async <T,>(rows: Promise<T[]>) => (await rows)[0]!;
const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : n.toFixed(d);

const syr = async () =>
  (await call("lfstats_resolve", { centers: ["Syracuse"] })).body.data.centers[0].matches[0].slug;

await q(1, "Compare Brew and Beanz over the last year at Syracuse", async () => {
  const c = await syr();
  const r = await call("lfstats_player_stats", {
    players: ["Brew", "Beanz"],
    scope: { centers: [c], date_range: { preset: "last_365_days" } },
    breakdown: ["position"],
    head_to_head: true,
  });
  const h = r.body.data.head_to_head;
  const { from, to } = r.body.meta.scope.date_range;
  const sqlRow =
    await one(pg`select count(*)::int n, count(*) filter (where a.team_id=b.team_id)::int same
    from sm5_scorecard a join sm5_scorecard b on b.game_id=a.game_id join game g on g.id=a.game_id join center ce on ce.id=g.center_id
    join player pa on pa.id=a.player_id join player pb on pb.id=b.player_id
    where pa.ipl_id='#kzWkJy' and pb.ipl_id='#GTgkg' and g.exclude=false and g.type='sm5' and ce.country_code=4 and ce.site_code=23
      and g.start_time >= ${from}::date and g.start_time < ${to}::date + 1`);
  const [a, b] = r.body.data.players;
  return {
    verdict: ok(h.games_together === sqlRow.n && h.as_teammates.games === sqlRow.same),
    answer: `${from}→${to}: Brew ${a.overall.games}g ${fmt(a.overall.avg_mvp)} MVP vs Beanz ${b.overall.games}g ${fmt(b.overall.avg_mvp)}; baseline ${fmt(r.body.data.baseline.overall.avg_mvp)} (${r.body.data.baseline.overall.players}p). H2H ${h.games_together} together (SQL ${sqlRow.n}), ${h.as_teammates.games} teammates (SQL ${sqlRow.same}), opponents record ${JSON.stringify(h.as_opponents.record)}`,
  };
});

await q(2, "Top 5 medics by average MVP at Syracuse", async () => {
  const c = await syr();
  const r = await call("lfstats_leaderboard", {
    scope: { centers: [c], positions: ["medic"] },
    sort_by: "avg_mvp",
    limit: 5,
  });
  const sqlTop =
    await pg`select p.ipl_id, avg(s.mvp_points)::float8 m from sm5_scorecard s join game g on g.id=s.game_id join center ce on ce.id=g.center_id join player p on p.id=s.player_id
    where s.position=5 and g.exclude=false and g.type='sm5' and ce.country_code=4 and ce.site_code=23 group by p.ipl_id having count(*)>=10 order by m desc limit 5`;
  const same = r.body.data.every(
    (row: any, i: number) =>
      row.ipl_id === sqlTop[i]!.ipl_id && Math.abs(row.avg_mvp - sqlTop[i]!.m) < 1e-9,
  );
  return {
    verdict: ok(same && r.body.meta.min_games === 10),
    answer:
      r.body.data
        .map((x: any) => `${x.rank}. ${x.callsign} ${fmt(x.avg_mvp)} (${x.games}g)`)
        .join("; ") + ` — min_games ${r.body.meta.min_games}, matches SQL: ${same}`,
  };
});

await q(3, "Top 5 Heavy players at Europe Championship 2026 with at least 5 games", async () => {
  const comp = (await call("lfstats_resolve", { competitions: ["Europe Championship 2026"] })).body
    .data.competitions[0];
  const r = await call("lfstats_leaderboard", {
    scope: { competitions: [comp.matches[0].slug], positions: ["heavy"] },
    sort_by: "avg_mvp",
    min_games: 5,
    limit: 5,
    metrics: ["avg_hit_diff", "avg_missiles_hit"],
  });
  return {
    verdict: ok(
      comp.status === "unique" && !r.isError && r.body.meta.scope.include_mercenary_games === false,
    ),
    answer:
      r.body.data
        .map((x: any) => `${x.rank}. ${x.callsign} ${fmt(x.avg_mvp)} (${x.games}g)`)
        .join("; ") + ` — mercs excluded: ${!r.body.meta.scope.include_mercenary_games}`,
  };
});

await q(4, "Close finals games at Europe Championship 2026", async () => {
  const r = await call("lfstats_search_games", {
    scope: { competitions: ["europe_championship_2026"], round_types: ["finals"] },
    sort: "margin_asc",
    limit: 5,
  });
  const g = r.body.data;
  return {
    verdict: ok(
      !r.isError &&
        g.every((x: any) => x.margin === x.teams[0].effective_score - x.teams[1].effective_score),
    ),
    answer:
      `${r.body.meta.total_matches} finals games; closest: ` +
      g
        .map(
          (x: any) =>
            `${x.game_slug} margin ${x.margin} (${x.teams[0].competition_team} v ${x.teams[1].competition_team})`,
        )
        .join("; "),
  };
});

await q(5, "How is Shadow doing this year?", async () => {
  const r = await call("lfstats_player_stats", {
    players: ["Shadow"],
    scope: { date_range: { preset: "this_year" } },
  });
  const cands = r.body.error?.candidates?.Shadow ?? [];
  return {
    verdict: ok(r.isError && r.body.error.code === "ambiguous_player" && cands.length >= 2),
    answer: `Must ask the user: ${cands.map((m: any) => `${m.callsign} ${m.ipl_id} (${m.home_center?.name}, ${m.games_played}g, last ${m.last_played})`).join(" or ")}`,
  };
});

await q(6, "How many games have Brew and Beanz played against each other?", async () => {
  const r = await call("lfstats_search_games", {
    players: { include: ["Brew", "Beanz"], relation: "opponents" },
    limit: 1,
  });
  const s =
    await one(pg`select count(*)::int n from sm5_scorecard a join sm5_scorecard b on b.game_id=a.game_id and b.team_id<>a.team_id join game g on g.id=a.game_id
    join player pa on pa.id=a.player_id join player pb on pb.id=b.player_id where pa.ipl_id='#kzWkJy' and pb.ipl_id='#GTgkg' and g.exclude=false and g.type='sm5' and g.outcome<>'aborted'`);
  return {
    verdict: ok(r.body.meta.total_matches === s.n),
    answer: `${r.body.meta.total_matches} games (SQL ${s.n}); latest ${r.body.data[0]?.game_slug}`,
  };
});

await q(
  7,
  "Best commanders at Loveland among players with at least 20 games there in the last year",
  async () => {
    const c = (await call("lfstats_resolve", { centers: ["Loveland"] })).body.data.centers[0]
      .matches[0].slug;
    const r = await call("lfstats_leaderboard", {
      scope: { centers: [c], positions: ["commander"] },
      sort_by: "avg_mvp",
      limit: 5,
      qualify: {
        min_games: 20,
        scope: { positions: null, date_range: { preset: "last_365_days" } },
      },
    });
    const qs = r.body.meta.qualify_scope;
    return {
      verdict: ok(!r.isError && qs.positions === null && qs.date_range.preset === "last_365_days"),
      answer:
        r.body.data
          .map((x: any) => `${x.rank}. ${x.callsign} ${fmt(x.avg_mvp)} (${x.games} cmd games)`)
          .join("; ") + ` — population ${r.body.meta.population}`,
    };
  },
);

await q(8, "Most accurate scouts at Syracuse", async () => {
  const r = await call("lfstats_leaderboard", {
    scope: { centers: ["4-23"], positions: ["scout"] },
    sort_by: "avg_accuracy",
    limit: 3,
  });
  return {
    verdict: ok(!r.isError && r.body.meta.sort.order === "desc"),
    answer: r.body.data
      .map((x: any) => `${x.callsign} ${fmt(x.avg_accuracy * 100, 1)}%`)
      .join("; "),
  };
});

await q(9, "Who has the best K/D at Syracuse?", async () => {
  const first = await call("lfstats_leaderboard", {
    scope: { centers: ["4-23"] },
    sort_by: "kd_ratio",
    limit: 3,
  });
  const suggested = /'(avg_[a-z_]+)'/.exec(first.body.error?.hint ?? "")?.[1];
  const r = await call("lfstats_leaderboard", {
    scope: { centers: ["4-23"] },
    sort_by: suggested ?? "avg_hit_diff",
    limit: 3,
  });
  return {
    verdict: ok(first.isError && suggested === "avg_hit_diff" && !r.isError),
    answer:
      `Recovered via hint → ${suggested}: ` +
      r.body.data.map((x: any) => `${x.callsign} ${fmt(x.avg_hit_diff)}`).join("; "),
  };
});

await q(10, "Brew's average MVP by year", async () => {
  const r = await call("lfstats_player_stats", {
    players: ["Brew"],
    breakdown: ["period"],
    period: "year",
    metrics: ["avg_mvp"],
    include_baseline: false,
  });
  return {
    verdict: ok(!r.isError),
    answer: r.body.data.players[0].breakdown
      .map((b: any) => `${b.period}: ${fmt(b.avg_mvp)} (${b.games}g)`)
      .join("; "),
  };
});

await q(11, "What is Brew's global ranking?", async () => {
  const r = await call("lfstats_player_stats", { players: ["Brew"], include_baseline: false });
  const rt = r.body.data.players[0].rating;
  const s = await one(
    pg`select pr.rank from player_rating pr join player p on p.id=pr.player_id join sm5_rating_model m on m.id=pr.rating_model_id where p.ipl_id='#kzWkJy' and m.retired_at is null`,
  );
  return {
    verdict: ok(rt?.rank === s.rank),
    answer: `#${rt?.rank} of ${rt?.of} (model ${rt?.model_version}, window ${rt?.window_start}→${rt?.window_end})`,
  };
});

await q(12, "Which centers has Brew played at?", async () => {
  const r = await call("lfstats_player_stats", {
    players: ["Brew"],
    breakdown: ["center"],
    metrics: ["games"],
    include_baseline: false,
    include_rating: false,
  });
  return {
    verdict: ok(r.body.data.players[0].breakdown.length > 0),
    answer: r.body.data.players[0].breakdown
      .map((b: any) => `${b.center.name} (${b.center.slug}) ${b.games}g`)
      .join("; "),
  };
});

await q(13, "Who detonates the most nukes at Syracuse?", async () => {
  const r = await call("lfstats_leaderboard", {
    scope: { centers: ["4-23"] },
    sort_by: "avg_nukes_detonated",
    limit: 3,
  });
  return {
    verdict: ok(
      !r.isError &&
        JSON.stringify(r.body.meta.scope.positions) === '["commander"]' &&
        r.body.meta.warnings.length > 0,
    ),
    answer:
      r.body.data
        .map((x: any) => `${x.callsign} ${fmt(x.avg_nukes_detonated)}/game (${x.games} cmd games)`)
        .join("; ") + ` — warning: ${r.body.meta.warnings[0]}`,
  };
});

await q(14, "Last 5 games Mr Jo Gangles played at Loveland", async () => {
  const r = await call("lfstats_search_games", {
    scope: { centers: ["4-19"] },
    players: { include: ["Mr Jo Gangles"] },
    limit: 5,
    fields: ["start_time", "margin", "teams"],
  });
  return {
    verdict: ok(!r.isError && r.body.data.length === 5),
    answer: `${r.body.meta.total_matches} total; matched ${JSON.stringify(r.body.meta.resolved_players)}; latest ${r.body.data.map((x: any) => x.start_time.slice(0, 10)).join(", ")}`,
  };
});

await q(15, "Tell me about game 4-23-20260717114731", async () => {
  const r = await call("lfstats_game_detail", { slug: "4-23-20260717114731" });
  const d = r.body.data;
  return {
    verdict: ok(!r.isError && d.excluded === true && r.body.meta.warnings.length === 1),
    answer: `${d.outcome}, ${d.actual_length}, ${d.teams.map((t: any) => `${t.name} ${t.effective_score}`).join(" v ")}, excluded=${d.excluded} (warned), ${d.penalties.length} penalties`,
  };
});

await q(16, "Who scored the most in the latest game at Syracuse?", async () => {
  const s = await call("lfstats_search_games", {
    scope: { centers: ["4-23"] },
    limit: 1,
    fields: ["start_time"],
  });
  const d = await call("lfstats_game_detail", {
    slug: s.body.data[0].game_slug,
    include_penalties: false,
  });
  const all = d.body.data.teams.flatMap((t: any) => t.players);
  const top = all.reduce((a: any, b: any) => (b.score > a.score ? b : a));
  return {
    verdict: ok(!d.isError && all.length > 0),
    answer: `${s.body.data[0].game_slug} (${s.body.data[0].start_time}): ${top.callsign} (${top.position}) ${top.score}`,
  };
});

await q(17, "Biggest blowouts at Syracuse this year", async () => {
  const r = await call("lfstats_search_games", {
    scope: { centers: ["4-23"], date_range: { preset: "this_year" } },
    sort: "margin_desc",
    limit: 3,
    fields: ["start_time", "margin", "outcome"],
  });
  return {
    verdict: ok(!r.isError && r.body.data[0].margin >= r.body.data[1].margin),
    answer: r.body.data.map((x: any) => `${x.game_slug} ${x.margin} (${x.outcome})`).join("; "),
  };
});

await q(18, "Which medic at Syracuse gets hit the least?", async () => {
  const r = await call("lfstats_leaderboard", {
    scope: { centers: ["4-23"], positions: ["medic"] },
    sort_by: "avg_times_hit",
    limit: 3,
  });
  return {
    verdict: ok(r.body.meta.sort.order === "asc"),
    answer:
      r.body.data.map((x: any) => `${x.callsign} ${fmt(x.avg_times_hit, 1)}`).join("; ") +
      " (ascending by default)",
  };
});

await q(19, "Beanz's win rate as commander vs as scout", async () => {
  const r = await call("lfstats_player_stats", {
    players: ["Beanz"],
    scope: { positions: ["commander", "scout"] },
    breakdown: ["position"],
    metrics: ["win_rate"],
    include_baseline: false,
    include_rating: false,
  });
  const b = r.body.data.players[0].breakdown;
  return {
    verdict: ok(b.length === 2),
    answer: b
      .map((x: any) => `${x.position} ${fmt(x.win_rate * 100, 1)}% (${x.games}g)`)
      .join(" vs "),
  };
});

await q(20, "Top 10 players by average MVP across all competitive games last year", async () => {
  const r = await call("lfstats_leaderboard", {
    scope: { game_kind: "competitive", date_range: { preset: "last_year" } },
    sort_by: "avg_mvp",
    limit: 10,
  });
  return {
    verdict: ok(!r.isError && r.body.meta.scope.date_range.from.endsWith("-01-01")),
    answer: `${r.body.meta.scope.date_range.from}→${r.body.meta.scope.date_range.to}, population ${r.body.meta.population}; #1 ${r.body.data[0]?.callsign} ${fmt(r.body.data[0]?.avg_mvp)}`,
  };
});

await q(21, "Who played the most games at Syracuse in the last 90 days?", async () => {
  const r = await call("lfstats_leaderboard", {
    scope: { centers: ["4-23"], date_range: { preset: "last_90_days" } },
    sort_by: "games",
    min_games: 1,
    limit: 3,
  });
  return {
    verdict: ok(!r.isError),
    answer: r.body.data.length
      ? r.body.data.map((x: any) => `${x.callsign} ${x.games}`).join("; ")
      : `no games — data_as_of ${r.body.meta.data_as_of}`,
  };
});

await q(22, "What does hit diff mean?", async () => {
  const r = await call("lfstats_catalog", {});
  const m = r.body.data.metrics.find((x: any) => x.id === "avg_hit_diff");
  return { verdict: ok(!!m), answer: m.definition };
});

await q(23, "Who scores the most goals in Laserball at Loveland?", async () => {
  const r = await call("lfstats_leaderboard", {
    scope: { game_type: "lb", centers: ["4-19"] },
    sort_by: "avg_goals",
    limit: 3,
  });
  const top =
    await pg`select p.ipl_id, avg(s.goals)::float8 g from lb_scorecard s join game g on g.id=s.game_id join center c on c.id=g.center_id join player p on p.id=s.player_id
    where g.exclude=false and g.type='lb' and c.country_code=4 and c.site_code=19 group by p.ipl_id having count(*)>=10 order by g desc limit 3`;
  const same = r.body.data.every(
    (row: any, i: number) =>
      row.ipl_id === top[i]!.ipl_id && Math.abs(row.avg_goals - top[i]!.g) < 1e-9,
  );
  return {
    verdict: ok(!r.isError && same),
    answer:
      r.body.data
        .map((x: any) => `${x.callsign} ${fmt(x.avg_goals)} goals/game (${x.games}g)`)
        .join("; ") + ` — matches SQL: ${same}`,
  };
});

await q(24, "Games Brew lost as a medic at Syracuse", async () => {
  const r = await call("lfstats_search_games", {
    scope: { centers: ["4-23"], positions: ["medic"], team_result: "loss" },
    players: { include: ["Brew"] },
    limit: 3,
  });
  const s =
    await one(pg`select count(*)::int n from sm5_scorecard s join game g on g.id=s.game_id join sm5_game_team t on t.id=s.team_id join player p on p.id=s.player_id join center c on c.id=g.center_id
    where p.ipl_id='#kzWkJy' and s.position=5 and t.result='loss' and g.exclude=false and g.type='sm5' and g.outcome<>'aborted' and c.country_code=4 and c.site_code=23`);
  return {
    verdict: ok(r.body.meta.total_matches === s.n),
    answer: `${r.body.meta.total_matches} games (SQL ${s.n})`,
  };
});

await q(25, "How does Brew compare to other medics at Syracuse?", async () => {
  const r = await call("lfstats_player_stats", {
    players: ["Brew"],
    scope: { centers: ["4-23"], positions: ["medic"] },
    metrics: ["avg_mvp", "avg_accuracy", "win_rate"],
  });
  const p = r.body.data.players[0].overall;
  const b = r.body.data.baseline.overall;
  return {
    verdict: ok(b.players > 0),
    answer: `Brew ${p.games}g ${fmt(p.avg_mvp)} MVP, ${fmt(p.win_rate * 100, 1)}% wins vs ${b.players} other medics ${fmt(b.avg_mvp)} MVP, ${fmt(b.win_rate * 100, 1)}%`,
  };
});

await q(26, "Stats for member 3-1-6683", async () => {
  const r = await call("lfstats_player_stats", { players: ["3-1-6683"], include_baseline: false });
  return {
    verdict: ok(r.body.data.players[0].callsign === "Brew"),
    answer: `${r.body.data.players[0].callsign} — ${JSON.stringify(r.body.meta.resolved_players)}`,
  };
});

await q(27, "How's Brw doing? (typo)", async () => {
  const r = await call("lfstats_player_stats", { players: ["Brw"] });
  const c = r.body.error?.candidates?.Brw ?? [];
  return {
    verdict: ok(r.isError && c.some((m: any) => m.callsign === "Brew")),
    answer: `Ask: ${c.map((m: any) => `${m.callsign} (${m.games_played}g)`).join(", ")}`,
  };
});

await q(28, "Who gets penalized most at Syracuse?", async () => {
  const r = await call("lfstats_leaderboard", {
    scope: { centers: ["4-23"] },
    sort_by: "avg_penalties",
    order: "desc",
    limit: 3,
  });
  return {
    verdict: ok(
      r.body.meta.sort.order === "desc" &&
        r.body.data[0].avg_penalties >= r.body.data[1].avg_penalties,
    ),
    answer:
      r.body.data.map((x: any) => `${x.callsign} ${fmt(x.avg_penalties, 3)}/game`).join("; ") +
      " (needed explicit order: desc)",
  };
});

await q(29, "Did Brew and Beanz ever play as teammates at Internationals 2026?", async () => {
  const c = (await call("lfstats_resolve", { competitions: ["internationals 2026"] })).body.data
    .competitions[0];
  const r = await call("lfstats_search_games", {
    scope: { competitions: [c.matches[0].slug] },
    players: { include: ["Brew", "Beanz"], relation: "teammates" },
    limit: 1,
  });
  return {
    verdict: ok(!r.isError),
    answer: `${c.status} → ${c.matches[0].slug}; ${r.body.meta.total_matches} games as teammates`,
  };
});

await q(30, "Who won Europe Championship 2026?", async () => {
  const r = await call("lfstats_search_games", {
    scope: { competitions: ["europe_championship_2026"], round_types: ["finals"] },
    sort: "start_time_desc",
    limit: 1,
  });
  const g = r.body.data[0];
  return {
    verdict: "GAP",
    answer: `No standings tool; best effort is the last finals game: ${g?.game_slug} ${g?.competition.round} ${g?.teams.map((t: any) => `${t.competition_team} ${t.result}`).join(" v ")}. Bracket/standings need a team_stats tool.`,
  };
});

await client.close();
await pg.end();
for (const r of results) {
  console.log(
    `\n### ${r.n}. ${r.q} — ${r.verdict}\n${r.calls.map((c) => `  - ${c}`).join("\n")}\n  = ${r.answer}`,
  );
}
const tally = results.reduce<Record<string, number>>(
  (t, r) => ({ ...t, [r.verdict]: (t[r.verdict] ?? 0) + 1 }),
  {},
);
console.log("\nTALLY", JSON.stringify(tally));
if (tally.FAIL) process.exitCode = 1;
