// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Spike for the proposed game Highlights feature: runs the six candidate detectors over a
 * random sample of SM5 games and reports how often each fires, so the definitions can be
 * judged against real data before anything is built.
 *
 * Read-only: the connection sets default_transaction_read_only and writes nothing. Games are
 * read one at a time with a pause between them, because the replay tables are most of the
 * database and a fast full scan would evict the working set on the shared VM.
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env src/scripts/highlights-spike.ts [sampleSize] [pauseMs]
 */

import postgres from "postgres";

const COMMANDER = 1;
const HEAVY = 2;

const COMEBACK_DEFICIT = 10_000;
const LAST_LIFE_MS = 60_000;
const MISSILE_CHAIN_COUNT = 3;
const MISSILE_CHAIN_MS = 15_000;
const NUKE_CHAIN_COUNT = 5;
const NUKE_CHAIN_MS = 35_000;
const CANCEL_EVENT_TYPES = new Set(["0206", "0306", "0308", "0500", "0502", "0209"]);

type GameEvent = {
  id: string;
  time: number;
  type: string;
  actor: string | null;
  target: string | null;
};
type PlayerState = {
  scorecardId: string;
  eventId: string;
  time: number;
  score: number;
  lives: number;
  isNuking: boolean;
};
type Player = {
  id: string;
  callsign: string;
  position: number;
  teamId: string;
  nukesCanceled: number;
};
type Team = { id: string; result: string | null };
type GameData = {
  duration: number;
  events: GameEvent[];
  states: PlayerState[];
  players: Player[];
  teams: Team[];
};
type Highlight = { category: string; time: number; who: string; detail: string; magnitude: number };

function groupStates(states: PlayerState[]): Map<string, PlayerState[]> {
  const byPlayer = new Map<string, PlayerState[]>();
  for (const s of states) {
    const rows = byPlayer.get(s.scorecardId) ?? [];
    rows.push(s);
    byPlayer.set(s.scorecardId, rows);
  }
  return byPlayer;
}

type NukeAttempt = {
  commander: Player;
  start: number;
  end: number;
  detonated: boolean;
  endEvent: GameEvent | null;
};

// Uses the simulator's is_nuking flag rather than re-deriving cancels, so every cause the
// simulator recognises (shots, missiles, enemy nukes, resupplies, penalties) is covered.
function nukeAttempts(data: GameData): NukeAttempt[] {
  const eventById = new Map(data.events.map((e) => [e.id, e]));
  const byPlayer = groupStates(data.states);
  const attempts: NukeAttempt[] = [];

  for (const commander of data.players) {
    if (commander.position !== COMMANDER) continue;
    let start: number | null = null;
    for (const row of byPlayer.get(commander.id) ?? []) {
      if (row.isNuking && start === null) start = row.time;
      if (!row.isNuking && start !== null) {
        const endEvent = eventById.get(row.eventId) ?? null;
        attempts.push({
          commander,
          start,
          end: row.time,
          detonated: endEvent?.type === "0405" && endEvent.actor === commander.id,
          endEvent,
        });
        start = null;
      }
    }
  }
  return attempts;
}

function detectNukeSaved(data: GameData, attempts: NukeAttempt[]): Highlight[] {
  const playerById = new Map(data.players.map((p) => [p.id, p]));
  const out: Highlight[] = [];
  for (const a of attempts) {
    if (!a.detonated) continue;
    const downs = data.events.filter(
      (e) =>
        (e.type === "0206" || e.type === "0306") &&
        e.actor === a.commander.id &&
        e.time >= a.start &&
        e.time < a.end &&
        e.target !== null &&
        playerById.get(e.target)?.teamId !== a.commander.teamId,
    );
    // Only an opponent who had already hit the commander during this nuke counts as an attacker.
    const attackers = downs.filter((d) =>
      data.events.some(
        (e) =>
          e.type === "0205" &&
          e.actor === d.target &&
          e.target === a.commander.id &&
          e.time >= a.start &&
          e.time <= d.time,
      ),
    );
    if (attackers.length === 0) continue;
    out.push({
      category: "nuke_saved",
      time: attackers[0]!.time,
      who: a.commander.callsign,
      detail: `${attackers.length} attacker(s) downed`,
      magnitude: attackers.length,
    });
  }
  return out;
}

function detectNukeCancels(data: GameData, attempts: NukeAttempt[]): Highlight[] {
  const playerById = new Map(data.players.map((p) => [p.id, p]));
  const out: Highlight[] = [];
  for (const a of attempts) {
    if (a.detonated) continue;
    // The commander's snapshot is taken before the simulator clears is_nuking, so the flag
    // only reads false on a later event. Find the event that actually ended the nuke.
    const cause = data.events.find(
      (e) =>
        e.time >= a.start &&
        e.time <= a.end &&
        ((e.target === a.commander.id && CANCEL_EVENT_TYPES.has(e.type)) ||
          (e.type === "0405" &&
            e.actor !== null &&
            playerById.get(e.actor)?.teamId !== a.commander.teamId)),
    );
    const actor = cause?.actor ? playerById.get(cause.actor) : undefined;
    if (!cause || !actor || actor.teamId === a.commander.teamId) continue;
    out.push({
      category: "nuke_cancel",
      time: cause.time,
      who: actor.callsign,
      detail: `cancelled ${a.commander.callsign} via ${cause.type}`,
      magnitude: 1,
    });
  }
  return out;
}

function detectComeback(data: GameData): Highlight[] {
  const teams = data.teams.filter((t) => data.players.some((p) => p.teamId === t.id));
  const winner = teams.find((t) => t.result === "win");
  if (!winner) return [];

  const teamOf = new Map(data.players.map((p) => [p.id, p.teamId]));
  const totals = new Map(teams.map((t) => [t.id, 0]));
  const latest = new Map<string, number>();
  let worst = 0;
  let worstTime = 0;

  for (const s of [...data.states].sort((a, b) => a.time - b.time)) {
    const teamId = teamOf.get(s.scorecardId);
    if (!teamId) continue;
    totals.set(teamId, totals.get(teamId)! + s.score - (latest.get(s.scorecardId) ?? 0));
    latest.set(s.scorecardId, s.score);

    const bestOther = Math.max(...[...totals].filter(([id]) => id !== winner.id).map(([, v]) => v));
    const deficit = bestOther - totals.get(winner.id)!;
    if (deficit > worst) {
      worst = deficit;
      worstTime = s.time;
    }
  }

  if (worst <= COMEBACK_DEFICIT) return [];
  return [
    {
      category: "comeback",
      time: worstTime,
      who: "team",
      detail: `down ${worst}`,
      magnitude: worst,
    },
  ];
}

function detectLastLife(data: GameData): Highlight[] {
  const byPlayer = groupStates(data.states);
  const out: Highlight[] = [];
  for (const player of data.players) {
    let start: number | null = null;
    const close = (end: number) => {
      if (start !== null && end - start > LAST_LIFE_MS) {
        out.push({
          category: "last_life",
          time: start,
          who: player.callsign,
          detail: `${Math.round((end - start) / 1000)}s, position ${player.position}`,
          magnitude: end - start,
        });
      }
      start = null;
    };
    for (const row of byPlayer.get(player.id) ?? []) {
      if (row.lives === 1) start ??= row.time;
      else close(row.time);
    }
    close(data.duration);
  }
  return out;
}

function detectMissileChains(data: GameData): Highlight[] {
  const out: Highlight[] = [];
  const teamOf = new Map(data.players.map((p) => [p.id, p.teamId]));
  for (const player of data.players) {
    if (player.position !== COMMANDER && player.position !== HEAVY) continue;
    const hits = data.events
      .filter(
        (e) =>
          e.type === "0306" &&
          e.actor === player.id &&
          e.target !== null &&
          teamOf.get(e.target) !== player.teamId,
      )
      .map((e) => e.time);

    // Overlapping qualifying windows are one chain, not several.
    let i = 0;
    while (i + MISSILE_CHAIN_COUNT - 1 < hits.length) {
      if (hits[i + MISSILE_CHAIN_COUNT - 1]! - hits[i]! > MISSILE_CHAIN_MS) {
        i++;
        continue;
      }
      let last = i + MISSILE_CHAIN_COUNT - 1;
      while (
        last + 1 < hits.length &&
        hits[last + 1]! - hits[last + 2 - MISSILE_CHAIN_COUNT]! <= MISSILE_CHAIN_MS
      ) {
        last++;
      }
      out.push({
        category: "missile_chain",
        time: hits[i]!,
        who: player.callsign,
        detail: `${last - i + 1} missiles in ${(hits[last]! - hits[i]!) / 1000}s, position ${player.position}`,
        magnitude: last - i + 1,
      });
      i = last + 1;
    }
  }
  return out;
}

// Fastest qualifying-length run per commander, whether or not it beat the time limit, so
// the limit can be judged against what actually happens.
const fastestRuns: { slug: string; who: string; spanMs: number }[] = [];

function detectNukeChains(data: GameData, attempts: NukeAttempt[], slug: string): Highlight[] {
  const out: Highlight[] = [];
  for (const commander of data.players) {
    if (commander.position !== COMMANDER) continue;
    const own = attempts
      .filter((a) => a.commander.id === commander.id)
      .sort((a, b) => a.start - b.start);

    let fastest: { spanMs: number; end: number } | null = null;
    for (let i = 0; i + NUKE_CHAIN_COUNT <= own.length; i++) {
      const run = own.slice(i, i + NUKE_CHAIN_COUNT);
      if (!run.every((a) => a.detonated)) continue;
      const spanMs = run.at(-1)!.end - run[0]!.start;
      if (!fastest || spanMs < fastest.spanMs) fastest = { spanMs, end: run.at(-1)!.end };
    }
    if (!fastest) continue;

    fastestRuns.push({ slug, who: commander.callsign, spanMs: fastest.spanMs });
    if (fastest.spanMs <= NUKE_CHAIN_MS) {
      out.push({
        category: "nuke_chain",
        time: fastest.end,
        who: commander.callsign,
        detail: `${NUKE_CHAIN_COUNT} nukes in ${fastest.spanMs / 1000}s`,
        magnitude: fastest.spanMs,
      });
    }
  }
  return out;
}

const sampleSize = Number(process.argv[2] ?? 300);
const pauseMs = Number(process.argv[3] ?? 150);

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, {
  max: 1,
  connection: {
    application_name: "highlights-spike",
    default_transaction_read_only: true,
  },
});

const [population] = await sql<{ total: number; competition: number }[]>`
  select count(*)::int as total, count(competition_id)::int as competition
  from game where type = 'sm5' and exclude = false`;

const games = await sql<
  { id: string; slug: string; duration: number; competitive: boolean; year: number }[]
>`
  select g.id,
         c.country_code || '-' || c.site_code || '-' || to_char(g.start_time, 'YYYYMMDDHH24MISS') as slug,
         g.actual_duration as duration,
         g.competition_id is not null as competitive,
         extract(year from g.start_time)::int as year
  from game g join center c on c.id = g.center_id
  where g.type = 'sm5' and g.exclude = false
  order by random()
  limit ${sampleSize}`;

const all: (Highlight & { slug: string; competitive: boolean })[] = [];
let cancelsFromStats = 0;
let cancelsDetected = 0;
let processed = 0;
let competitive = 0;
let openNukeRows = 0;

for (const g of games) {
  const events = await sql<GameEvent[]>`
    select id, time, event_type as type, actor_scorecard_id as actor, target_scorecard_id as target
    from sm5_game_event where game_id = ${g.id} order by time`;
  if (events.length === 0) continue;

  const states = await sql<PlayerState[]>`
    select scorecard_id as "scorecardId", event_id as "eventId", time, score, lives,
           is_nuking as "isNuking"
    from sm5_game_player_state where game_id = ${g.id} order by scorecard_id, time`;
  const players = await sql<Player[]>`
    select id, callsign, position, team_id as "teamId", nukes_canceled as "nukesCanceled"
    from sm5_scorecard where game_id = ${g.id}`;
  const teams = await sql<Team[]>`
    select id, result from sm5_game_team where game_id = ${g.id} and is_neutral = false`;

  const data: GameData = { duration: g.duration, events, states, players, teams };
  const attempts = nukeAttempts(data);
  const cancels = detectNukeCancels(data, attempts);

  processed++;
  if (g.competitive) competitive++;
  cancelsDetected += cancels.length;
  cancelsFromStats += players.reduce((sum, p) => sum + p.nukesCanceled, 0);
  openNukeRows += attempts.filter((a) => a.endEvent === null).length;

  const found = [
    ...detectNukeSaved(data, attempts),
    ...cancels,
    ...detectComeback(data),
    ...detectLastLife(data),
    ...detectMissileChains(data),
    ...detectNukeChains(data, attempts, g.slug),
  ];
  for (const h of found) all.push({ ...h, slug: g.slug, competitive: g.competitive });

  await new Promise((resolve) => setTimeout(resolve, pauseMs));
}

await sql.end();

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);
const social = processed - competitive;

console.log(`Population: ${population!.total} SM5 games, ${population!.competition} competitive`);
console.log(`Sampled with replay data: ${processed} (${competitive} competitive)`);
console.log(`Nuke cancels: detected ${cancelsDetected}, scorecards ${cancelsFromStats}`);
console.log(`Nuke endings with no matching event: ${openNukeRows}\n`);

for (const category of [
  "nuke_saved",
  "nuke_cancel",
  "comeback",
  "last_life",
  "missile_chain",
  "nuke_chain",
]) {
  const rows = all.filter((h) => h.category === category);
  const gamesWith = new Set(rows.map((h) => h.slug)).size;
  const compGames = new Set(rows.filter((h) => h.competitive).map((h) => h.slug)).size;
  const socialGames = gamesWith - compGames;
  const magnitudes = rows.map((h) => h.magnitude).sort((a, b) => a - b);
  console.log(
    `${category}: ${rows.length} total, ${(rows.length / Math.max(processed, 1)).toFixed(2)} per game, ` +
      `in ${pct(gamesWith, processed)} of games ` +
      `(competitive ${pct(compGames, competitive)}, social ${pct(socialGames, social)}), ` +
      `median ${magnitudes[Math.floor(magnitudes.length / 2)] ?? "n/a"}, max ${magnitudes.at(-1) ?? "n/a"}`,
  );
  for (const h of [...rows].sort((a, b) => b.magnitude - a.magnitude).slice(0, 3)) {
    console.log(`    ${h.slug} @${Math.round(h.time / 1000)}s ${h.who}: ${h.detail}`);
  }
}

const perGame = new Map<string, number>();
for (const h of all) perGame.set(h.slug, (perGame.get(h.slug) ?? 0) + 1);
const counts = [...perGame.values()].sort((a, b) => a - b);
console.log(
  `\nHighlights per game: ${processed - perGame.size} games with none, ` +
    `median among others ${counts[Math.floor(counts.length / 2)] ?? 0}, max ${counts.at(-1) ?? 0}`,
);

const runs = [...fastestRuns].sort((a, b) => a.spanMs - b.spanMs);
console.log(`5+ uncancelled nukes in a row: ${runs.length} commanders; fastest five spans:`);
for (const r of runs.slice(0, 5)) {
  console.log(`    ${r.slug} ${r.who}: ${r.spanMs / 1000}s`);
}
console.log(`    median ${(runs[Math.floor(runs.length / 2)]?.spanMs ?? 0) / 1000}s`);
const byPosition = (category: string, position: number) =>
  all.filter((h) => h.category === category && h.detail.endsWith(`position ${position}`)).length;
console.log(
  `missile_chain by position: commander ${byPosition("missile_chain", COMMANDER)}, ` +
    `heavy ${byPosition("missile_chain", HEAVY)}`,
);
