// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, count, desc, eq, inArray, max, or, sql, type SQL } from "drizzle-orm";
import {
  center,
  competition,
  game,
  lbScorecard,
  player,
  playerCallsignHistory,
  sm5Scorecard,
} from "../../schema";
import type { ResolveRequest } from "../../schemas/query-api";
import { QUERY_LIMITS } from "../../schemas/query-api";
import { QueryApiError } from "./errors";
import { getAnalyticsDb } from "./pool";

// POST /resolve (docs/Query_API_Spec.md): names → ids. Matching runs in order and stops at
// the first step with any result:
//   1. exact id or slug          (players: '#' IPL id, or a '4-3-1137' member id)
//   2. exact name, ignoring case and surrounding whitespace
//   3. exact previous callsign   (players only)
//   4. trigram similarity        (pg_trgm `%`, threshold 0.3, or 0.2 for short queries)
// Exactly one match from steps 1–3 is `unique`. Several matches, or any fuzzy match, are
// `ambiguous`: the model must ask the user rather than guess.

export type ResolveStatus = "unique" | "ambiguous" | "not_found";

export type ResolveResult<M> = {
  query: string;
  status: ResolveStatus;
  matches: M[];
  hint?: string;
};

const MEMBER_ID = /^\d+-\d+-\d+$/;
const CENTER_SLUG = /^\d+-\d+$/;
/** Shape of an IPL id typed without its '#'. Only tried after callsigns find nothing. */
const BARE_IPL_ID = /^[A-Za-z0-9]{4,10}$/;

const MAX = QUERY_LIMITS.resolve_max_matches;

function statusFor(matchCount: number, exact: boolean): ResolveStatus {
  if (matchCount === 0) return "not_found";
  return exact && matchCount === 1 ? "unique" : "ambiguous";
}

function normalized(column: unknown): SQL {
  return sql`lower(trim(${column}))`;
}

type Reader = Pick<ReturnType<typeof getAnalyticsDb>, "select" | "execute">;

/**
 * Trigram similarity cutoff. Short names have so few trigrams that one typo drops them
 * under 0.3 ("Brw" vs "Brew" scores 0.29), so short queries get a looser cutoff.
 */
export function similarityThreshold(query: string): number {
  return [...query].length <= 5 ? 0.2 : 0.3;
}

/**
 * Runs fuzzy lookups with the threshold set for this query. SET LOCAL (rather than an
 * explicit similarity() comparison) keeps the `%` operator, and so the trigram indexes,
 * in play; the transaction scopes it so pooled connections never inherit it.
 */
function withSimilarityThreshold<T>(query: string, fn: (tx: Reader) => Promise<T>): Promise<T> {
  return getAnalyticsDb().transaction(async (tx) => {
    // A number from code, never user input; SET cannot take a bind parameter.
    await tx.execute(
      sql.raw(`set local pg_trgm.similarity_threshold = ${similarityThreshold(query)}`),
    );
    return fn(tx);
  });
}

const centerSlugSql = sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`;

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

type PlayerMatchedOn =
  "ipl_id" | "member_id" | "current_callsign" | "previous_callsign" | "similar_callsign";

export type PlayerMatch = {
  ipl_id: string;
  member_id: string | null;
  callsign: string;
  matched_on: PlayerMatchedOn;
  similarity?: number;
  home_center: { slug: string; name: string } | null;
  games_played: number;
  last_played: string | null;
};

type Candidate = { playerId: string; matchedOn: PlayerMatchedOn; similarity?: number };

async function playerIdsWhere(where: SQL, matchedOn: PlayerMatchedOn): Promise<Candidate[]> {
  const rows = await getAnalyticsDb()
    .select({ id: player.id })
    .from(player)
    .where(where)
    .limit(MAX);
  return rows.map((r) => ({ playerId: r.id, matchedOn }));
}

async function findPlayerCandidates(
  query: string,
): Promise<{ candidates: Candidate[]; exact: boolean }> {
  const db = getAnalyticsDb();
  const q = query.toLowerCase();

  if (query.startsWith("#")) {
    return { candidates: await playerIdsWhere(eq(player.iplId, query), "ipl_id"), exact: true };
  }
  if (MEMBER_ID.test(query)) {
    return {
      candidates: await playerIdsWhere(eq(player.memberId, query), "member_id"),
      exact: true,
    };
  }

  const current = await playerIdsWhere(
    eq(normalized(player.currentCallsign), q),
    "current_callsign",
  );
  if (current.length > 0) return { candidates: current, exact: true };

  const previous = await db
    .selectDistinct({ id: playerCallsignHistory.playerId })
    .from(playerCallsignHistory)
    .where(eq(normalized(playerCallsignHistory.callsign), q))
    .limit(MAX);
  if (previous.length > 0) {
    return {
      candidates: previous.map((r) => ({ playerId: r.id, matchedOn: "previous_callsign" })),
      exact: true,
    };
  }

  if (BARE_IPL_ID.test(query)) {
    const byIpl = await playerIdsWhere(eq(player.iplId, `#${query}`), "ipl_id");
    if (byIpl.length > 0) return { candidates: byIpl, exact: true };
  }

  // Best similarity per player across current and previous callsigns.
  const fuzzy = await withSimilarityThreshold(query, (tx) =>
    tx.execute<{ player_id: string; sim: number }>(sql`
    select player_id, max(sim)::float8 as sim from (
      select ${player.id} as player_id, similarity(${player.currentCallsign}, ${query}) as sim
        from ${player} where ${player.currentCallsign} % ${query}
      union all
      select ${playerCallsignHistory.playerId}, similarity(${playerCallsignHistory.callsign}, ${query})
        from ${playerCallsignHistory} where ${playerCallsignHistory.callsign} % ${query}
    ) m
    group by player_id
    order by sim desc
    limit ${MAX}
  `),
  );
  return {
    candidates: [...fuzzy].map((r) => ({
      playerId: r.player_id,
      matchedOn: "similar_callsign" as const,
      similarity: Math.round(Number(r.sim) * 1000) / 1000,
    })),
    exact: false,
  };
}

/** Games played (both game types, non-excluded), last played, and most-played center. */
async function playerActivity(playerIds: string[]) {
  const db = getAnalyticsDb();
  const perCenter = (sc: typeof sm5Scorecard | typeof lbScorecard) =>
    db
      .select({
        playerId: sql<string>`${sc.playerId}`,
        centerId: game.centerId,
        games: count(),
        last: sql<string>`to_char(${max(game.startTime)}, 'YYYY-MM-DD')`,
      })
      .from(sc)
      .innerJoin(game, eq(game.id, sc.gameId))
      .where(and(inArray(sc.playerId, playerIds), eq(game.exclude, false)))
      .groupBy(sc.playerId, game.centerId);

  const [rows, centers] = await Promise.all([
    Promise.all([perCenter(sm5Scorecard), perCenter(lbScorecard)]).then(([a, b]) => [...a, ...b]),
    db.select({ id: center.id, slug: centerSlugSql, name: center.name }).from(center),
  ]);
  const centerById = new Map(centers.map((c) => [c.id, { slug: c.slug, name: c.name }]));

  const byPlayer = new Map<
    string,
    { games: number; last: string | null; centerGames: Map<string, number> }
  >();
  for (const r of rows) {
    const p = byPlayer.get(r.playerId) ?? { games: 0, last: null, centerGames: new Map() };
    p.games += r.games;
    if (!p.last || r.last > p.last) p.last = r.last;
    p.centerGames.set(r.centerId, (p.centerGames.get(r.centerId) ?? 0) + r.games);
    byPlayer.set(r.playerId, p);
  }

  return new Map(
    [...byPlayer].map(([id, p]) => {
      const [homeId] = [...p.centerGames].sort((a, b) => b[1] - a[1])[0] ?? [];
      return [
        id,
        {
          games: p.games,
          last: p.last,
          home: homeId ? (centerById.get(homeId) ?? null) : null,
        },
      ];
    }),
  );
}

export async function resolvePlayer(query: string): Promise<ResolveResult<PlayerMatch>> {
  const { candidates, exact } = await findPlayerCandidates(query);
  if (candidates.length === 0) {
    return {
      query,
      status: "not_found",
      matches: [],
      hint: MEMBER_ID.test(query)
        ? "Member ids are only recorded for players seen in newer game files, so some players can't be found by member id. Try their callsign."
        : "Check the spelling, or try an IPL id ('#1234567') or member id ('4-3-1137'). Guests are not searchable.",
    };
  }

  const ids = candidates.map((c) => c.playerId);
  const [players, activity] = await Promise.all([
    getAnalyticsDb()
      .select({
        id: player.id,
        iplId: player.iplId,
        memberId: player.memberId,
        callsign: player.currentCallsign,
      })
      .from(player)
      .where(inArray(player.id, ids)),
    playerActivity(ids),
  ]);
  const playerById = new Map(players.map((p) => [p.id, p]));

  const matches: PlayerMatch[] = candidates.map((c) => {
    const p = playerById.get(c.playerId)!;
    const a = activity.get(c.playerId);
    return {
      ipl_id: p.iplId,
      member_id: p.memberId,
      callsign: p.callsign.trim(),
      matched_on: c.matchedOn,
      ...(c.similarity !== undefined && { similarity: c.similarity }),
      home_center: a?.home ?? null,
      games_played: a?.games ?? 0,
      last_played: a?.last ?? null,
    };
  });
  matches.sort(
    (a, b) => (b.similarity ?? 1) - (a.similarity ?? 1) || b.games_played - a.games_played,
  );

  return { query, status: statusFor(matches.length, exact), matches };
}

// ---------------------------------------------------------------------------
// Centers
// ---------------------------------------------------------------------------

export type CenterMatch = {
  slug: string;
  name: string;
  short_name: string | null;
  city: string | null;
  country: string | null;
};

export async function resolveCenter(query: string): Promise<ResolveResult<CenterMatch>> {
  const db = getAnalyticsDb();
  const q = query.toLowerCase();
  const select = (d: Reader = db) =>
    d
      .select({
        slug: centerSlugSql,
        name: center.name,
        short_name: center.shortName,
        city: center.city,
        country: center.countryName,
      })
      .from(center);

  let matches: CenterMatch[];
  let exact = true;
  if (CENTER_SLUG.test(query)) {
    const [c, s] = query.split("-").map(Number) as [number, number];
    matches = await select().where(and(eq(center.countryCode, c), eq(center.siteCode, s)));
  } else {
    matches = await select()
      .where(
        or(
          eq(normalized(center.name), q),
          eq(normalized(center.shortName), q),
          eq(normalized(center.city), q),
        ),
      )
      .limit(MAX);
    if (matches.length === 0) {
      exact = false;
      const sim = sql`greatest(similarity(${center.name}, ${query}), similarity(coalesce(${center.shortName}, ''), ${query}), similarity(coalesce(${center.city}, ''), ${query}))`;
      matches = await withSimilarityThreshold(query, (tx) =>
        select(tx)
          .where(
            or(
              sql`${center.name} % ${query}`,
              sql`${center.shortName} % ${query}`,
              sql`${center.city} % ${query}`,
            ),
          )
          .orderBy(desc(sim))
          .limit(MAX),
      );
    }
  }

  return {
    query,
    status: statusFor(matches.length, exact),
    matches,
    ...(matches.length === 0 && { hint: "Try the center's city, or its slug such as '4-23'." }),
  };
}

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------

export type CompetitionMatch = {
  slug: string;
  name: string;
  type: string;
  format: string;
  category: string;
  state: string;
  start_date: string;
  end_date: string | null;
  host_center: string | null;
};

export async function resolveCompetition(query: string): Promise<ResolveResult<CompetitionMatch>> {
  const db = getAnalyticsDb();
  const q = query.toLowerCase();
  const slugAsWords = sql`replace(${competition.slug}, '_', ' ')`;
  const select = (d: Reader = db) =>
    d
      .select({
        slug: competition.slug,
        name: competition.name,
        type: competition.type,
        format: competition.format,
        category: competition.category,
        state: competition.state,
        start_date: competition.startDate,
        end_date: competition.endDate,
        host_center: sql<
          string | null
        >`case when ${center.id} is null then null else ${centerSlugSql} end`,
      })
      .from(competition)
      .leftJoin(center, eq(center.id, competition.hostCenterId));

  let matches = await select()
    .where(
      or(
        eq(competition.slug, query),
        eq(normalized(competition.name), q),
        eq(normalized(slugAsWords), q),
      ),
    )
    .limit(MAX);
  let exact = true;
  if (matches.length === 0) {
    exact = false;
    const sim = sql`greatest(similarity(${competition.name}, ${query}), similarity(${slugAsWords}, ${query}))`;
    matches = await withSimilarityThreshold(query, (tx) =>
      select(tx)
        .where(or(sql`${competition.name} % ${query}`, sql`${slugAsWords} % ${query}`))
        .orderBy(desc(sim), desc(competition.startDate))
        .limit(MAX),
    );
  }

  return {
    query,
    status: statusFor(matches.length, exact),
    matches,
    ...(matches.length === 0 && {
      hint: "Try part of the competition's name, e.g. 'internationals 2026'.",
    }),
  };
}

export async function resolveNames(request: ResolveRequest) {
  const [players, centers, competitions] = await Promise.all([
    Promise.all((request.players ?? []).map(resolvePlayer)),
    Promise.all((request.centers ?? []).map(resolveCenter)),
    Promise.all((request.competitions ?? []).map(resolveCompetition)),
  ]);
  return {
    data: {
      ...(request.players && { players }),
      ...(request.centers && { centers }),
      ...(request.competitions && { competitions }),
    },
  };
}

// ---------------------------------------------------------------------------
// Player identifiers in other endpoints
// ---------------------------------------------------------------------------

export type IdentifiedPlayer = {
  input: string;
  id: string;
  iplId: string;
  memberId: string | null;
  callsign: string;
};

/**
 * Turns the ids an endpoint was given (IPL id with or without '#', or member id) into
 * players, in input order. Callsigns are rejected rather than guessed at: that is what
 * resolve is for, and it can report ambiguity.
 */
export async function identifyPlayers(
  inputs: readonly string[],
  field: string,
): Promise<IdentifiedPlayer[]> {
  const db = getAnalyticsDb();
  const results: IdentifiedPlayer[] = [];
  for (const input of inputs) {
    let where: SQL;
    if (input.startsWith("#")) where = eq(player.iplId, input);
    else if (MEMBER_ID.test(input)) where = eq(player.memberId, input);
    else if (BARE_IPL_ID.test(input)) where = eq(player.iplId, `#${input}`);
    else {
      throw new QueryApiError("player_not_found", `'${input}' is not an IPL id or member id.`, {
        field,
        hint: "Call resolve with the callsign first, then pass the ipl_id it returns.",
      });
    }

    const rows = await db
      .select({
        id: player.id,
        iplId: player.iplId,
        memberId: player.memberId,
        callsign: player.currentCallsign,
      })
      .from(player)
      .where(where)
      .limit(2);

    if (rows.length === 0) {
      const bare = !input.startsWith("#") && !MEMBER_ID.test(input);
      throw new QueryApiError(
        "player_not_found",
        bare
          ? `'${input}' is not a known IPL id. If it is a callsign, resolve it first.`
          : `No player with id '${input}'.`,
        {
          field,
          hint: MEMBER_ID.test(input)
            ? "Member ids are only recorded for players seen in newer game files. Call resolve with the callsign instead."
            : "Call resolve with the callsign to find the right ipl_id.",
        },
      );
    }
    if (rows.length > 1) {
      throw new QueryApiError("invalid_request", `Member id '${input}' matches several players.`, {
        field,
        hint: `Use one of their IPL ids instead: ${rows.map((r) => r.iplId).join(", ")}.`,
      });
    }
    const p = rows[0]!;
    results.push({
      input,
      id: p.id,
      iplId: p.iplId,
      memberId: p.memberId,
      callsign: p.callsign.trim(),
    });
  }
  return results;
}
