// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, asc, desc, eq, inArray, ne, not, sql } from "drizzle-orm";
import { db } from "../client";
import { center, game, lbGameTeam, lbMatch, lbMatchGame, lbScorecard } from "../schema";
import { getLbGameReplayData } from "./laserball";
import type {
  LbGameDetailTeam,
  LbReplayEvent,
  LbReplayPlayer,
  LbReplayPlayerState,
} from "./laserball";

// Guests (null playerId) have no stable identity across games and are
// excluded from roster comparison. Players under this threshold are noise
// (a sub who took the floor for a few seconds), not a real absence.
const MIN_MEANINGFUL_TIME_PLAYED_MS = 30_000;

export type LbMatchHalfSide = {
  gameTeamId: string;
  name: string;
  colourEnum: number;
  score: number | null;
};

export type LbMatchHalf = {
  matchGameId: string;
  gameId: string;
  gameSlug: string;
  half: number;
  gameStartTime: Date;
  gameOutcome: string;
  gameExcluded: boolean;
  actualDuration: number;
  side1: LbMatchHalfSide;
  side2: LbMatchHalfSide;
};

export type LbMatchDetail = {
  id: string;
  createdAt: Date;
  halves: LbMatchHalf[]; // ordered by `half`
  side1TotalScore: number;
  side2TotalScore: number;
  winnerSide: 1 | 2 | "draw" | null; // null unless exactly 2 halves are linked
};

export type LbMatchRosterWarning = {
  side: 1 | 2;
  playerId: string;
  callsign: string;
  kind: "missing_from_half1" | "missing_from_half2" | "played_opposite_side";
};

export type LbMatchCandidateGame = {
  id: string;
  slug: string;
  startTime: Date;
  description: string | null;
  outcome: string;
  teams: { id: string; name: string; colourEnum: number }[];
};

const gameSlugSql = sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`;

// ---------------------------------------------------------------------------
// Lookup for the game-detail page
// ---------------------------------------------------------------------------

export async function getLbMatchIdForGame(gameId: string): Promise<string | null> {
  const [row] = await db
    .select({ matchId: lbMatchGame.matchId })
    .from(lbMatchGame)
    .where(eq(lbMatchGame.gameId, gameId));
  return row?.matchId ?? null;
}

export async function getLbMatchDetail(matchId: string): Promise<LbMatchDetail | null> {
  const [matchRow] = await db.select().from(lbMatch).where(eq(lbMatch.id, matchId));
  if (!matchRow) return null;

  const rows = await db
    .select({
      matchGameId: lbMatchGame.id,
      gameId: lbMatchGame.gameId,
      half: lbMatchGame.half,
      gameSlug: gameSlugSql,
      gameStartTime: game.startTime,
      gameOutcome: game.outcome,
      gameExcluded: game.exclude,
      actualDuration: game.actualDuration,
      side1GameTeamId: lbMatchGame.side1GameTeamId,
      side2GameTeamId: lbMatchGame.side2GameTeamId,
    })
    .from(lbMatchGame)
    .innerJoin(game, eq(game.id, lbMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .where(eq(lbMatchGame.matchId, matchId))
    .orderBy(asc(lbMatchGame.half));

  if (rows.length === 0) return null;

  const teamIds = rows.flatMap((r) => [r.side1GameTeamId, r.side2GameTeamId]);
  const teamRows = await db
    .select({
      id: lbGameTeam.id,
      name: lbGameTeam.name,
      colourEnum: lbGameTeam.colourEnum,
      score: lbGameTeam.score,
    })
    .from(lbGameTeam)
    .where(inArray(lbGameTeam.id, teamIds));
  const teamsById = new Map(teamRows.map((t) => [t.id, t]));

  const halves: LbMatchHalf[] = rows.map((r) => {
    const side1 = teamsById.get(r.side1GameTeamId);
    const side2 = teamsById.get(r.side2GameTeamId);
    return {
      matchGameId: r.matchGameId,
      gameId: r.gameId,
      gameSlug: r.gameSlug,
      half: r.half,
      gameStartTime: r.gameStartTime,
      gameOutcome: r.gameOutcome,
      gameExcluded: r.gameExcluded,
      actualDuration: r.actualDuration,
      side1: {
        gameTeamId: r.side1GameTeamId,
        name: side1?.name ?? "",
        colourEnum: side1?.colourEnum ?? 0,
        score: side1?.score ?? null,
      },
      side2: {
        gameTeamId: r.side2GameTeamId,
        name: side2?.name ?? "",
        colourEnum: side2?.colourEnum ?? 0,
        score: side2?.score ?? null,
      },
    };
  });

  const side1TotalScore = halves.reduce((sum, h) => sum + (h.side1.score ?? 0), 0);
  const side2TotalScore = halves.reduce((sum, h) => sum + (h.side2.score ?? 0), 0);
  const overtime = halves.find((h) => h.half === 3);

  let winnerSide: LbMatchDetail["winnerSide"] = null;
  if (halves.length === 2) {
    winnerSide =
      side1TotalScore === side2TotalScore ? "draw" : side1TotalScore > side2TotalScore ? 1 : 2;
  } else if (halves.length === 3 && overtime) {
    // Overtime is only played to break a half 1+2 tie — its own result alone
    // decides the match, not the (still tied) cumulative total.
    const otSide1 = overtime.side1.score ?? 0;
    const otSide2 = overtime.side2.score ?? 0;
    winnerSide = otSide1 === otSide2 ? "draw" : otSide1 > otSide2 ? 1 : 2;
  }

  return {
    id: matchRow.id,
    createdAt: matchRow.createdAt,
    halves,
    side1TotalScore,
    side2TotalScore,
    winnerSide,
  };
}

// ---------------------------------------------------------------------------
// Roster guardrail (advisory only, never blocks)
// ---------------------------------------------------------------------------

export async function getLbMatchRosterWarnings(matchId: string): Promise<LbMatchRosterWarning[]> {
  const halves = await db
    .select({
      half: lbMatchGame.half,
      side1GameTeamId: lbMatchGame.side1GameTeamId,
      side2GameTeamId: lbMatchGame.side2GameTeamId,
    })
    .from(lbMatchGame)
    .where(eq(lbMatchGame.matchId, matchId))
    .orderBy(asc(lbMatchGame.half));

  const half1 = halves.find((h) => h.half === 1);
  const half2 = halves.find((h) => h.half === 2);
  if (!half1 || !half2) return [];

  const teamIds = [
    half1.side1GameTeamId,
    half1.side2GameTeamId,
    half2.side1GameTeamId,
    half2.side2GameTeamId,
  ];
  const scorecardRows = await db
    .select({
      teamId: lbScorecard.teamId,
      playerId: lbScorecard.playerId,
      callsign: lbScorecard.callsign,
    })
    .from(lbScorecard)
    .where(
      and(
        inArray(lbScorecard.teamId, teamIds),
        sql`${lbScorecard.timePlayedMs} > ${MIN_MEANINGFUL_TIME_PLAYED_MS}`,
      ),
    );

  const playersOnTeam = (teamId: string) => {
    const map = new Map<string, string>();
    for (const r of scorecardRows) {
      if (r.teamId === teamId && r.playerId) map.set(r.playerId, r.callsign);
    }
    return map;
  };

  const half1Side1 = playersOnTeam(half1.side1GameTeamId);
  const half1Side2 = playersOnTeam(half1.side2GameTeamId);
  const half2Side1 = playersOnTeam(half2.side1GameTeamId);
  const half2Side2 = playersOnTeam(half2.side2GameTeamId);

  const warnings: LbMatchRosterWarning[] = [];

  for (const [side, half1Players, half2Players] of [
    [1, half1Side1, half2Side1],
    [2, half1Side2, half2Side2],
  ] as const) {
    for (const [playerId, callsign] of half1Players) {
      if (!half2Players.has(playerId)) {
        warnings.push({ side, playerId, callsign, kind: "missing_from_half2" });
      }
    }
    for (const [playerId, callsign] of half2Players) {
      if (!half1Players.has(playerId)) {
        warnings.push({ side, playerId, callsign, kind: "missing_from_half1" });
      }
    }
  }

  // Played on the opposite side across halves — likely a pairing mistake,
  // or a legitimate free-agent swap. Either way, advisory only.
  for (const [playerId, callsign] of half1Side1) {
    if (half2Side2.has(playerId)) {
      warnings.push({ side: 1, playerId, callsign, kind: "played_opposite_side" });
    }
  }
  for (const [playerId, callsign] of half1Side2) {
    if (half2Side1.has(playerId)) {
      warnings.push({ side: 2, playerId, callsign, kind: "played_opposite_side" });
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Candidate games for the "link as other half" dropdown
// ---------------------------------------------------------------------------

export async function getLbMatchCandidateGames(
  gameId: string,
  limit = 25,
): Promise<LbMatchCandidateGame[]> {
  const [current] = await db
    .select({ centerId: game.centerId, startTime: game.startTime, type: game.type })
    .from(game)
    .where(eq(game.id, gameId));
  if (!current || current.type !== "lb") return [];

  const linkedGameIds = db.select({ gameId: lbMatchGame.gameId }).from(lbMatchGame);

  const currentStartTime = current.startTime.toISOString();
  const rows = await db
    .select({
      id: game.id,
      slug: gameSlugSql,
      startTime: game.startTime,
      description: game.description,
      outcome: game.outcome,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .where(
      and(
        eq(game.type, "lb"),
        eq(game.centerId, current.centerId),
        ne(game.id, gameId),
        not(inArray(game.id, linkedGameIds)),
      ),
    )
    .orderBy(sql`abs(extract(epoch from (${game.startTime} - ${currentStartTime}::timestamp)))`)
    .limit(limit);

  if (rows.length === 0) return [];

  const gameIds = rows.map((r) => r.id);
  const teamRows = await db
    .select({
      gameId: lbGameTeam.gameId,
      id: lbGameTeam.id,
      name: lbGameTeam.name,
      colourEnum: lbGameTeam.colourEnum,
    })
    .from(lbGameTeam)
    .where(and(inArray(lbGameTeam.gameId, gameIds), eq(lbGameTeam.isNeutral, false)))
    .orderBy(lbGameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, { id: string; name: string; colourEnum: number }[]>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId) ?? [];
    list.push({ id: t.id, name: t.name, colourEnum: t.colourEnum });
    teamsByGame.set(t.gameId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    startTime: row.startTime,
    description: row.description,
    outcome: row.outcome,
    teams: teamsByGame.get(row.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type LbMatchTeamPairing = {
  gameSide1TeamId: string;
  gameSide2TeamId: string;
  otherSide1TeamId: string;
  otherSide2TeamId: string;
};

export async function linkLbMatch(
  gameId: string,
  otherGameId: string,
  pairing: LbMatchTeamPairing,
  linkedBy?: string,
): Promise<string> {
  if (gameId === otherGameId) throw new Error("Cannot link a game to itself");

  const [a] = await db
    .select({ centerId: game.centerId, startTime: game.startTime, type: game.type })
    .from(game)
    .where(eq(game.id, gameId));
  const [b] = await db
    .select({ centerId: game.centerId, startTime: game.startTime, type: game.type })
    .from(game)
    .where(eq(game.id, otherGameId));
  if (!a || !b) throw new Error("Game not found");
  if (a.type !== "lb" || b.type !== "lb") throw new Error("Both games must be Laserball games");
  if (a.centerId !== b.centerId) throw new Error("Cannot link games from different centers");

  const [existingA, existingB] = await Promise.all([
    getLbMatchIdForGame(gameId),
    getLbMatchIdForGame(otherGameId),
  ]);
  if (existingA || existingB) throw new Error("One of these games is already linked to a match");

  const gameIsHalf1 = a.startTime <= b.startTime;

  return db.transaction(async (tx) => {
    const [match] = await tx.insert(lbMatch).values({ linkedBy }).returning({ id: lbMatch.id });
    await tx.insert(lbMatchGame).values([
      {
        matchId: match!.id,
        gameId,
        half: gameIsHalf1 ? 1 : 2,
        side1GameTeamId: pairing.gameSide1TeamId,
        side2GameTeamId: pairing.gameSide2TeamId,
      },
      {
        matchId: match!.id,
        gameId: otherGameId,
        half: gameIsHalf1 ? 2 : 1,
        side1GameTeamId: pairing.otherSide1TeamId,
        side2GameTeamId: pairing.otherSide2TeamId,
      },
    ]);
    return match!.id;
  });
}

export async function unlinkLbMatch(matchId: string): Promise<void> {
  await db.delete(lbMatch).where(eq(lbMatch.id, matchId));
}

export type LbMatchOvertimePairing = {
  side1TeamId: string;
  side2TeamId: string;
};

export async function addLbMatchOvertimeGame(
  matchId: string,
  gameId: string,
  pairing: LbMatchOvertimePairing,
): Promise<void> {
  const existing = await db
    .select({ half: lbMatchGame.half })
    .from(lbMatchGame)
    .where(eq(lbMatchGame.matchId, matchId));
  const half1 = existing.find((h) => h.half === 1);
  const half2 = existing.find((h) => h.half === 2);
  if (!half1 || !half2)
    throw new Error("Match must have both halves linked before adding overtime");
  if (existing.some((h) => h.half === 3))
    throw new Error("Overtime is already linked to this match");

  const [halfGame] = await db
    .select({ centerId: game.centerId })
    .from(game)
    .innerJoin(lbMatchGame, eq(lbMatchGame.gameId, game.id))
    .where(eq(lbMatchGame.matchId, matchId))
    .limit(1);
  const [otGame] = await db
    .select({ centerId: game.centerId, type: game.type })
    .from(game)
    .where(eq(game.id, gameId));
  if (!halfGame || !otGame) throw new Error("Game not found");
  if (otGame.type !== "lb") throw new Error("Overtime game must be a Laserball game");
  if (otGame.centerId !== halfGame.centerId)
    throw new Error("Cannot link games from different centers");

  const alreadyLinked = await getLbMatchIdForGame(gameId);
  if (alreadyLinked) throw new Error("This game is already linked to a match");

  await db.insert(lbMatchGame).values({
    matchId,
    gameId,
    half: 3,
    side1GameTeamId: pairing.side1TeamId,
    side2GameTeamId: pairing.side2TeamId,
  });
}

export async function removeLbMatchOvertimeGame(matchId: string): Promise<void> {
  await db
    .delete(lbMatchGame)
    .where(and(eq(lbMatchGame.matchId, matchId), eq(lbMatchGame.half, 3)));
}

// ---------------------------------------------------------------------------
// Batched player rosters for every game linked to a match (public detail page)
// ---------------------------------------------------------------------------

export async function getLbMatchGamesDetail(
  matchId: string,
): Promise<Map<string, LbGameDetailTeam[]>> {
  const matchGames = await db
    .select({ gameId: lbMatchGame.gameId })
    .from(lbMatchGame)
    .where(eq(lbMatchGame.matchId, matchId));
  const gameIds = matchGames.map((g) => g.gameId);
  if (gameIds.length === 0) return new Map();

  const [teamRows, scorecardRows] = await Promise.all([
    db
      .select()
      .from(lbGameTeam)
      .where(and(inArray(lbGameTeam.gameId, gameIds), eq(lbGameTeam.isNeutral, false)))
      .orderBy(lbGameTeam.tdfTeamIndex),
    db
      .select()
      .from(lbScorecard)
      .where(inArray(lbScorecard.gameId, gameIds))
      .orderBy(desc(lbScorecard.goals)),
  ]);

  const playersByTeam = new Map<string, LbGameDetailTeam["players"]>();
  for (const s of scorecardRows) {
    const list = playersByTeam.get(s.teamId) ?? [];
    list.push(s);
    playersByTeam.set(s.teamId, list);
  }

  const teamsByGame = new Map<string, LbGameDetailTeam[]>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId) ?? [];
    list.push({
      id: t.id,
      tdfTeamIndex: t.tdfTeamIndex,
      name: t.name,
      colourEnum: t.colourEnum,
      score: t.score,
      result: t.result,
      players: playersByTeam.get(t.id) ?? [],
    });
    teamsByGame.set(t.gameId, list);
  }

  return teamsByGame;
}

// ---------------------------------------------------------------------------
// Combined replay data (halves stitched into one continuous timeline)
// ---------------------------------------------------------------------------

export type LbMatchReplayHalf = {
  half: number;
  gameId: string;
  startOffset: number;
  endOffset: number;
  side1ColourEnum: number;
  side2ColourEnum: number;
  // Cumulative side score from every earlier half — this half's own live
  // score is added on top, client-side, to get the running match total.
  side1PriorTotal: number;
  side2PriorTotal: number;
};

export type LbMatchReplayPlayer = LbReplayPlayer & { half: number; side: 1 | 2 };

export type LbMatchReplayData = {
  duration: number;
  halves: LbMatchReplayHalf[];
  players: LbMatchReplayPlayer[];
  events: LbReplayEvent[];
  playerStates: LbReplayPlayerState[];
};

export async function getLbMatchReplayData(matchId: string): Promise<LbMatchReplayData | null> {
  const matchDetail = await getLbMatchDetail(matchId);
  if (!matchDetail) return null;

  const perHalfData = await Promise.all(
    matchDetail.halves.map((h) => getLbGameReplayData(h.gameId)),
  );
  if (perHalfData.some((d) => d === null)) return null;

  let offset = 0;
  let side1Prior = 0;
  let side2Prior = 0;
  const halves: LbMatchReplayHalf[] = [];
  const players: LbMatchReplayPlayer[] = [];
  const events: LbReplayEvent[] = [];
  const playerStates: LbReplayPlayerState[] = [];

  matchDetail.halves.forEach((h, i) => {
    const data = perHalfData[i]!;
    const startOffset = offset;
    const endOffset = offset + data.duration;

    halves.push({
      half: h.half,
      gameId: h.gameId,
      startOffset,
      endOffset,
      side1ColourEnum: h.side1.colourEnum,
      side2ColourEnum: h.side2.colourEnum,
      side1PriorTotal: side1Prior,
      side2PriorTotal: side2Prior,
    });

    for (const p of data.players) {
      players.push({ ...p, half: h.half, side: p.teamId === h.side1.gameTeamId ? 1 : 2 });
    }
    for (const e of data.events) {
      events.push({ ...e, time: e.time + startOffset });
    }
    for (const s of data.playerStates) {
      playerStates.push({ ...s, time: s.time + startOffset });
    }

    side1Prior += h.side1.score ?? 0;
    side2Prior += h.side2.score ?? 0;
    offset = endOffset;
  });

  return { duration: offset, halves, players, events, playerStates };
}
