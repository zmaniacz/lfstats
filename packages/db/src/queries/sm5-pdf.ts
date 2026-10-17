// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Reads for legacy PDF-era SM5 games (game.type = "sm5_pdf"), which keep their data in
 * the sm5_pdf_* tables — see the schema comment and docs/Legacy_Migration_PDF_Games.md.
 *
 * These games are shown, never aggregated: they appear in game lists and a player's game
 * log, but no career stat, leaderboard or rating reads them.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { parseGameSlug } from "../lib/game-slug";
import {
  center,
  game,
  sm5PdfGame,
  sm5PdfGamePenalty,
  sm5PdfGamePlayerInteraction,
  sm5PdfGameTeam,
  sm5PdfGameTeamPenalty,
  sm5PdfScorecard,
  player,
} from "../schema";
import type { PlayerHitData } from "./games";

const slugSql = sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`;

/** One entry of the legacy site's MVP breakdown, as stored in `legacy_mvp_details`. */
export type LegacyMvpComponent = { key: string; name: string; value: number };

export type PdfPenalty = {
  id: string;
  scoreValue: number;
  description: string;
  type: string;
  mvpValue: number;
  inGame: boolean;
  rescinded: boolean;
};

export type PdfGamePlayer = {
  id: string;
  playerId: string;
  iplId: string;
  callsign: string;
  position: number;
  isSub: boolean;
  eliminated: boolean;
  survived: number | null;
  score: number;
  accuracy: number;
  hitDiff: number;
  shotsFired: number;
  shotsHit: number;
  shotsHitOpponent: number;
  shotsHitTeam: number;
  shotsHitOpponent3hit: number;
  timesHit: number;
  missileHits: number;
  missilesHitOpponent: number;
  missilesHitTeam: number;
  timesHitByMissile: number;
  medicHits: number;
  ownMedicHits: number;
  nukesCanceled: number;
  teamNukesCanceled: number;
  nukesActivated: number | null;
  nukesDetonated: number | null;
  nukesHitMedic: number | null;
  rapidFire: number | null;
  ammoBoost: number | null;
  lifeBoost: number | null;
  resupplies: number;
  spEarned: number | null;
  spSpent: number | null;
  livesLeft: number;
  shotsLeft: number;
  targetsDestroyed: number;
  legacyMvpPoints: number;
  legacyMvp: LegacyMvpComponent[];
  penalties: PdfPenalty[];
  hitInteractions: PlayerHitData[];
};

export type PdfGameTeam = {
  id: string;
  side: "red" | "green";
  name: string;
  colourEnum: number;
  score: number;
  eliminationBonus: number;
  penaltyScore: number;
  result: "win" | "loss" | "draw" | null;
  eliminated: boolean;
  penalties: PdfPenalty[];
  players: PdfGamePlayer[];
};

export type PdfGameDetail = {
  id: string;
  slug: string;
  centerId: string;
  centerName: string;
  centerSlug: string;
  startTime: Date;
  outcome: string;
  actualDuration: number;
  description: string | null;
  exclude: boolean;
  gameName: string | null;
  legacyType: string;
  teams: PdfGameTeam[];
};

function legacyMvp(details: unknown): LegacyMvpComponent[] {
  if (!details || typeof details !== "object") return [];
  return Object.entries(details as Record<string, { name?: unknown; value?: unknown }>)
    .map(([key, c]) => ({
      key,
      name: typeof c?.name === "string" ? c.name : key,
      value: Number(c?.value ?? 0),
    }))
    .filter((c) => Number.isFinite(c.value));
}

export async function getPdfGameDetailBySlug(slug: string): Promise<PdfGameDetail | null> {
  const parsed = parseGameSlug(slug);
  if (!parsed) return null;

  const [g] = await db
    .select({
      id: game.id,
      slug: slugSql,
      centerId: game.centerId,
      centerName: center.name,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      actualDuration: game.actualDuration,
      description: game.description,
      exclude: game.exclude,
      gameName: sm5PdfGame.gameName,
      legacyType: sm5PdfGame.legacyType,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .innerJoin(sm5PdfGame, eq(sm5PdfGame.gameId, game.id))
    .where(
      and(
        eq(game.type, "sm5_pdf"),
        eq(center.countryCode, parsed.countryCode),
        eq(center.siteCode, parsed.siteCode),
        sql`to_char(${game.startTime}, 'YYYYMMDDHH24MISS') = ${parsed.timestamp}`,
      ),
    );
  if (!g) return null;

  const [teams, scorecards, interactions, penalties, teamPenalties] = await Promise.all([
    db
      .select()
      .from(sm5PdfGameTeam)
      .where(eq(sm5PdfGameTeam.gameId, g.id))
      .orderBy(asc(sm5PdfGameTeam.colourEnum)),
    db
      .select({ sc: sm5PdfScorecard, iplId: player.iplId })
      .from(sm5PdfScorecard)
      .innerJoin(player, eq(player.id, sm5PdfScorecard.playerId))
      .where(eq(sm5PdfScorecard.gameId, g.id))
      .orderBy(desc(sm5PdfScorecard.score)),
    db
      .select()
      .from(sm5PdfGamePlayerInteraction)
      .where(eq(sm5PdfGamePlayerInteraction.gameId, g.id)),
    db.select().from(sm5PdfGamePenalty).where(eq(sm5PdfGamePenalty.gameId, g.id)),
    db.select().from(sm5PdfGameTeamPenalty).where(eq(sm5PdfGameTeamPenalty.gameId, g.id)),
  ]);

  const meta = new Map(scorecards.map(({ sc }) => [sc.id, sc]));
  const toPenalty = (
    p: typeof sm5PdfGamePenalty.$inferSelect | typeof sm5PdfGameTeamPenalty.$inferSelect,
  ): PdfPenalty => ({
    id: p.id,
    scoreValue: p.scoreValue,
    description: p.description,
    type: p.type,
    mvpValue: "mvpValue" in p ? p.mvpValue : 0,
    inGame: "inGame" in p ? p.inGame : true,
    rescinded: p.rescinded,
  });

  const hitsFor = (scorecardId: string, teamId: string): PlayerHitData[] => {
    const byOther = new Map<string, PlayerHitData>();
    const entry = (otherId: string) => {
      let e = byOther.get(otherId);
      if (!e) {
        const o = meta.get(otherId)!;
        e = {
          callsign: o.callsign,
          position: o.position,
          score: o.score,
          isTeammate: o.teamId === teamId,
          hitsDealt: 0,
          missilesDealt: 0,
          hitsReceived: 0,
          missilesReceived: 0,
          resetsDealt: 0,
          resetsReceived: 0,
          missileResetsDealt: 0,
          missileResetsReceived: 0,
        };
        byOther.set(otherId, e);
      }
      return e;
    };
    for (const i of interactions) {
      if (i.scorecardId === scorecardId) {
        const e = entry(i.targetScorecardId);
        e.hitsDealt += i.shotsHit;
        e.missilesDealt += i.missileHits;
      } else if (i.targetScorecardId === scorecardId) {
        const e = entry(i.scorecardId);
        e.hitsReceived += i.shotsHit;
        e.missilesReceived += i.missileHits;
      }
    }
    return [...byOther.values()];
  };

  return {
    ...g,
    teams: teams.map((t) => ({
      id: t.id,
      side: t.side,
      name: t.name,
      colourEnum: t.colourEnum,
      score: t.score,
      eliminationBonus: t.eliminationBonus,
      penaltyScore: t.penaltyScore,
      result: t.result,
      eliminated: t.eliminated,
      penalties: teamPenalties.filter((p) => p.gameTeamId === t.id).map(toPenalty),
      players: scorecards
        .filter(({ sc }) => sc.teamId === t.id)
        .map(({ sc, iplId }) => ({
          id: sc.id,
          playerId: sc.playerId,
          iplId,
          callsign: sc.callsign,
          position: sc.position,
          isSub: sc.isSub,
          eliminated: sc.eliminated,
          survived: sc.survived,
          score: sc.score,
          accuracy: sc.accuracy,
          hitDiff: sc.hitDiff,
          shotsFired: sc.shotsFired,
          shotsHit: sc.shotsHit,
          shotsHitOpponent: sc.shotsHitOpponent,
          shotsHitTeam: sc.shotsHitTeam,
          shotsHitOpponent3hit: sc.shotsHitOpponent3hit,
          timesHit: sc.timesHit,
          missileHits: sc.missileHits,
          missilesHitOpponent: sc.missilesHitOpponent,
          missilesHitTeam: sc.missilesHitTeam,
          timesHitByMissile: sc.timesHitByMissile,
          medicHits: sc.medicHits,
          ownMedicHits: sc.ownMedicHits,
          nukesCanceled: sc.nukesCanceled,
          teamNukesCanceled: sc.teamNukesCanceled,
          nukesActivated: sc.nukesActivated,
          nukesDetonated: sc.nukesDetonated,
          nukesHitMedic: sc.nukesHitMedic,
          rapidFire: sc.rapidFire,
          ammoBoost: sc.ammoBoost,
          lifeBoost: sc.lifeBoost,
          resupplies: sc.resupplies,
          spEarned: sc.spEarned,
          spSpent: sc.spSpent,
          livesLeft: sc.livesLeft,
          shotsLeft: sc.shotsLeft,
          targetsDestroyed: sc.targetsDestroyed,
          legacyMvpPoints: sc.legacyMvpPoints,
          legacyMvp: legacyMvp(sc.legacyMvpDetails),
          penalties: penalties.filter((p) => p.scorecardId === sc.id).map(toPenalty),
          hitInteractions: hitsFor(sc.id, t.id),
        })),
    })),
  };
}

export type PlayerPdfGame = {
  slug: string;
  startTime: Date;
  centerName: string;
  callsign: string;
  position: number;
  side: "red" | "green";
  result: "win" | "loss" | "draw" | null;
  score: number;
  accuracy: number;
  legacyMvpPoints: number;
};

/** A player's PDF-era game log, newest first. Display only — never aggregated. */
export async function getPlayerPdfGames(playerId: string): Promise<PlayerPdfGame[]> {
  const rows = await db
    .select({
      slug: slugSql,
      startTime: game.startTime,
      centerName: center.name,
      callsign: sm5PdfScorecard.callsign,
      position: sm5PdfScorecard.position,
      side: sm5PdfGameTeam.side,
      result: sm5PdfGameTeam.result,
      score: sm5PdfScorecard.score,
      accuracy: sm5PdfScorecard.accuracy,
      legacyMvpPoints: sm5PdfScorecard.legacyMvpPoints,
    })
    .from(sm5PdfScorecard)
    .innerJoin(game, eq(game.id, sm5PdfScorecard.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(sm5PdfGameTeam, eq(sm5PdfGameTeam.id, sm5PdfScorecard.teamId))
    .where(eq(sm5PdfScorecard.playerId, playerId))
    .orderBy(desc(game.startTime));
  return rows;
}

/** How many PDF-era games each of these players has. */
export async function getPdfGameCounts(playerIds: string[]): Promise<Map<string, number>> {
  if (playerIds.length === 0) return new Map();
  const rows = await db
    .select({ playerId: sm5PdfScorecard.playerId, games: sql<number>`count(*)::int` })
    .from(sm5PdfScorecard)
    .where(inArray(sm5PdfScorecard.playerId, playerIds))
    .groupBy(sm5PdfScorecard.playerId);
  return new Map(rows.map((r) => [r.playerId, r.games]));
}
