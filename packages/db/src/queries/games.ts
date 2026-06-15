// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import {
  game,
  sm5GameTeam,
  sm5Scorecard,
  sm5ScorecardMvp,
  sm5GamePlayerInteraction,
  sm5GameEvent,
  sm5GamePlayerState,
  sm5GameTarget,
  target,
  center,
  competition,
  gameTag,
  gameTagAssignment,
} from "../schema";
import { eq, and, asc, desc, inArray, isNull, sql, SQL } from "drizzle-orm";
import { getTeamPenaltyTotals } from "./penalties";
import { gameScopeConditions, type GameScopeFilter } from "./scope";

export const GAMES_PER_PAGE = 10;

export type GameListFilters = {
  centerId?: string;
  dateSearch?: string;
  scopeFilter?: GameScopeFilter;
};

export type GameTeamSummary = {
  colourEnum: number;
  score: number | null;
  eliminationBonus: number | null;
  result: "win" | "loss" | "draw" | null;
};

export type GameListItem = {
  id: string;
  slug: string;
  centerSlug: string;
  startTime: Date;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
  centerName: string;
  description: string | null;
  competitionName: string | null;
  teams: GameTeamSummary[];
};

function buildGameListConditions(filters: GameListFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.scopeFilter) {
    conditions.push(...gameScopeConditions(filters.scopeFilter));
  }
  if (filters.centerId) {
    conditions.push(eq(game.centerId, filters.centerId));
  }
  if (filters.dateSearch) {
    conditions.push(
      sql`to_char(${game.startTime}, 'YYYY-MM-DD') ILIKE ${"%" + filters.dateSearch + "%"}`,
    );
  }
  return conditions;
}

export async function getGamesPage(
  page: number,
  filters: GameListFilters = {},
): Promise<GameListItem[]> {
  const offset = (page - 1) * GAMES_PER_PAGE;
  const conditions = buildGameListConditions(filters);

  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
      competitionName: competition.name,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .leftJoin(competition, eq(game.competitionId, competition.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(game.startTime))
    .limit(GAMES_PER_PAGE)
    .offset(offset);

  if (rows.length === 0) return [];

  const gameIds = rows.map((r) => r.id);

  const teamRows = await db
    .select({
      gameId: sm5GameTeam.gameId,
      colourEnum: sm5GameTeam.colourEnum,
      score: sm5GameTeam.score,
      eliminationBonus: sm5GameTeam.eliminationBonus,
      result: sm5GameTeam.result,
    })
    .from(sm5GameTeam)
    .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))
    .orderBy(sm5GameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const team of teamRows) {
    const list = teamsByGame.get(team.gameId) ?? [];
    list.push(team);
    teamsByGame.set(team.gameId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    centerSlug: row.centerSlug,
    startTime: row.startTime,
    outcome: row.outcome,
    centerName: row.centerName,
    description: row.description,
    competitionName: row.competitionName,
    teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
      colourEnum: t.colourEnum,
      score: t.score,
      eliminationBonus: t.eliminationBonus,
      result: t.result,
    })),
  }));
}

export async function getGamesCount(filters: GameListFilters = {}): Promise<number> {
  const conditions = buildGameListConditions(filters);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(conditions.length ? and(...conditions) : undefined);
  return row?.count ?? 0;
}

export type MvpComponentRow = {
  component: string;
  inputValue: number;
  points: number;
};

export type PlayerHitData = {
  callsign: string;
  position: number;
  score: number;
  isTeammate: boolean;
  hitsDealt: number;
  missilesDealt: number;
  hitsReceived: number;
  missilesReceived: number;
};

export type GameDetailPlayer = {
  id: string;
  playerId: string | null;
  iplId: string | null;
  callsign: string;
  position: number;
  eliminated: boolean;
  score: number;
  mvpPoints: number;
  livesLeft: number;
  shotsLeft: number;
  hitDiff: number;
  accuracy: number;
  // Shot stats
  shotsFired: number;
  shotsHit: number;
  shotsHitOpponent: number;
  shotsHitOpponent3hit: number;
  shotsHitTeam: number;
  shotsHitOpponentMedic: number;
  shotsHitTeamMedic: number;
  medicHits: number;
  teamMedicHits: number;
  timesHit: number;
  // Missile stats
  missileHits: number;
  missilesHitOpponent: number;
  missilesHitTeam: number;
  missilesHitOpponentMedic: number;
  missilesHitTeamMedic: number;
  timesHitByMissile: number;
  // Nuke stats (Commander only, nullable)
  nukesActivated: number | null;
  nukesDetonated: number | null;
  nukesHitMedic: number | null;
  livesRemovedByNuke: number | null;
  totalNukeActivationTime: number | null;
  averageNukeActivationTime: number | null;
  // Nuke cancel stats (all positions)
  nukesCanceled: number;
  teamNukesCanceled: number;
  // Scout special ability (nullable)
  rapidFire: number | null;
  totalRapidTime: number | null;
  averageRapidTime: number | null;
  shotsFiredDuringRapid: number | null;
  shotsHitDuringRapid: number | null;
  shotsHitOpponentDuringRapid: number | null;
  shotsHitTeamDuringRapid: number | null;
  accuracyDuringRapid: number | null;
  // Ammo/Medic special ability (nullable)
  ammoBoost: number | null;
  lifeBoost: number | null;
  // Support stats (Ammo/Medic only, nullable for giving; universal for receiving)
  resuppliesGiven: number | null;
  doubleResuppliesGiven: number | null;
  resuppliesReceivedAmmo: number;
  resuppliesReceivedLives: number;
  doubleResuppliesReceived: number;
  // Combat outcomes
  deactivatedOpponent: number;
  deactivatedTeam: number;
  eliminatedOpponent: number;
  eliminatedTeam: number;
  eliminatedOpponentMedic: number;
  eliminatedTeamMedic: number;
  assists: number;
  resetOpponent: number;
  resetTeam: number;
  missileResetOpponent: number;
  missileResetTeam: number;
  // SP tracking (null for Heavy Weapons)
  spEarned: number | null;
  spSpent: number | null;
  // Targets and penalties
  targetsDestroyed: number;
  penalties: number;
  isMercenary: boolean;
  // Uptime & downtime (ms)
  uptime: number;
  resupplyDowntime: number;
  otherDowntime: number;
  mvpComponents: MvpComponentRow[];
  hitInteractions: PlayerHitData[];
};

export type GameDetailTeam = {
  id: string;
  name: string;
  colourEnum: number;
  score: number | null;
  eliminationBonus: number | null;
  penaltyScore: number;
  result: "win" | "loss" | "draw" | null;
  eliminated: boolean | null;
  players: GameDetailPlayer[];
};

export type GameTagSummary = {
  id: string;
  name: string;
  color: string | null;
};

export type GameDetail = {
  id: string;
  slug: string;
  centerId: string;
  centerSlug: string;
  competitionId: string | null;
  competitionName: string | null;
  description: string | null;
  startTime: Date;
  centerName: string;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
  scheduledDuration: number;
  actualDuration: number;
  exclude: boolean;
  tdfFilename: string;
  tags: GameTagSummary[];
  teams: GameDetailTeam[];
};

export async function getNightlyDetails(centerId: string, date: string): Promise<GameDetail[]> {
  const gameRows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerId: game.centerId,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      competitionId: game.competitionId,
      competitionName: sql<string | null>`null`,
      description: game.description,
      startTime: game.startTime,
      centerName: center.name,
      outcome: game.outcome,
      scheduledDuration: game.scheduledDuration,
      actualDuration: game.actualDuration,
      exclude: game.exclude,
      tdfFilename: game.tdfFilename,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(game.centerId, centerId),
        sql`date(${game.startTime}) = ${date}::date`,
        isNull(game.competitionId),
        eq(game.exclude, false),
      ),
    )
    .orderBy(desc(game.startTime));

  if (gameRows.length === 0) return [];

  const gameIds = gameRows.map((r) => r.id);

  const [teamRows, scorecardRows, mvpRows, interactionRows, tagRows] = await Promise.all([
    db
      .select({
        gameId: sm5GameTeam.gameId,
        id: sm5GameTeam.id,
        name: sm5GameTeam.name,
        colourEnum: sm5GameTeam.colourEnum,
        score: sm5GameTeam.score,
        eliminationBonus: sm5GameTeam.eliminationBonus,
        result: sm5GameTeam.result,
        eliminated: sm5GameTeam.eliminated,
      })
      .from(sm5GameTeam)
      .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false))),

    db
      .select({
        id: sm5Scorecard.id,
        teamId: sm5Scorecard.teamId,
        playerId: sm5Scorecard.playerId,
        iplId: sm5Scorecard.iplId,
        callsign: sm5Scorecard.callsign,
        position: sm5Scorecard.position,
        eliminated: sm5Scorecard.eliminated,
        score: sm5Scorecard.score,
        mvpPoints: sm5Scorecard.mvpPoints,
        livesLeft: sm5Scorecard.livesLeft,
        shotsLeft: sm5Scorecard.shotsLeft,
        hitDiff: sm5Scorecard.hitDiff,
        accuracy: sm5Scorecard.accuracy,
        shotsFired: sm5Scorecard.shotsFired,
        shotsHit: sm5Scorecard.shotsHit,
        shotsHitOpponent: sm5Scorecard.shotsHitOpponent,
        shotsHitOpponent3hit: sm5Scorecard.shotsHitOpponent3hit,
        shotsHitTeam: sm5Scorecard.shotsHitTeam,
        shotsHitOpponentMedic: sm5Scorecard.shotsHitOpponentMedic,
        shotsHitTeamMedic: sm5Scorecard.shotsHitTeamMedic,
        medicHits: sm5Scorecard.medicHits,
        teamMedicHits: sm5Scorecard.teamMedicHits,
        timesHit: sm5Scorecard.timesHit,
        missileHits: sm5Scorecard.missileHits,
        missilesHitOpponent: sm5Scorecard.missilesHitOpponent,
        missilesHitTeam: sm5Scorecard.missilesHitTeam,
        missilesHitOpponentMedic: sm5Scorecard.missilesHitOpponentMedic,
        missilesHitTeamMedic: sm5Scorecard.missilesHitTeamMedic,
        timesHitByMissile: sm5Scorecard.timesHitByMissile,
        nukesActivated: sm5Scorecard.nukesActivated,
        nukesDetonated: sm5Scorecard.nukesDetonated,
        nukesHitMedic: sm5Scorecard.nukesHitMedic,
        livesRemovedByNuke: sm5Scorecard.livesRemovedByNuke,
        totalNukeActivationTime: sm5Scorecard.totalNukeActivationTime,
        averageNukeActivationTime: sm5Scorecard.averageNukeActivationTime,
        nukesCanceled: sm5Scorecard.nukesCanceled,
        teamNukesCanceled: sm5Scorecard.teamNukesCanceled,
        rapidFire: sm5Scorecard.rapidFire,
        totalRapidTime: sm5Scorecard.totalRapidTime,
        averageRapidTime: sm5Scorecard.averageRapidTime,
        shotsFiredDuringRapid: sm5Scorecard.shotsFiredDuringRapid,
        shotsHitDuringRapid: sm5Scorecard.shotsHitDuringRapid,
        shotsHitOpponentDuringRapid: sm5Scorecard.shotsHitOpponentDuringRapid,
        shotsHitTeamDuringRapid: sm5Scorecard.shotsHitTeamDuringRapid,
        accuracyDuringRapid: sm5Scorecard.accuracyDuringRapid,
        ammoBoost: sm5Scorecard.ammoBoost,
        lifeBoost: sm5Scorecard.lifeBoost,
        resuppliesGiven: sm5Scorecard.resuppliesGiven,
        doubleResuppliesGiven: sm5Scorecard.doubleResuppliesGiven,
        resuppliesReceivedAmmo: sm5Scorecard.resuppliesReceivedAmmo,
        resuppliesReceivedLives: sm5Scorecard.resuppliesReceivedLives,
        doubleResuppliesReceived: sm5Scorecard.doubleResuppliesReceived,
        deactivatedOpponent: sm5Scorecard.deactivatedOpponent,
        deactivatedTeam: sm5Scorecard.deactivatedTeam,
        eliminatedOpponent: sm5Scorecard.eliminatedOpponent,
        eliminatedTeam: sm5Scorecard.eliminatedTeam,
        eliminatedOpponentMedic: sm5Scorecard.eliminatedOpponentMedic,
        eliminatedTeamMedic: sm5Scorecard.eliminatedTeamMedic,
        assists: sm5Scorecard.assists,
        resetOpponent: sm5Scorecard.resetOpponent,
        resetTeam: sm5Scorecard.resetTeam,
        missileResetOpponent: sm5Scorecard.missileResetOpponent,
        missileResetTeam: sm5Scorecard.missileResetTeam,
        spEarned: sm5Scorecard.spEarned,
        spSpent: sm5Scorecard.spSpent,
        targetsDestroyed: sm5Scorecard.targetsDestroyed,
        penalties: sm5Scorecard.penalties,
        isMercenary: sm5Scorecard.isMercenary,
        uptime: sm5Scorecard.uptime,
        resupplyDowntime: sm5Scorecard.resupplyDowntime,
        otherDowntime: sm5Scorecard.otherDowntime,
      })
      .from(sm5Scorecard)
      .where(inArray(sm5Scorecard.gameId, gameIds))
      .orderBy(desc(sm5Scorecard.score)),

    db
      .select({
        scorecardId: sm5ScorecardMvp.scorecardId,
        component: sm5ScorecardMvp.component,
        inputValue: sm5ScorecardMvp.inputValue,
        points: sm5ScorecardMvp.points,
      })
      .from(sm5ScorecardMvp)
      .innerJoin(sm5Scorecard, eq(sm5ScorecardMvp.scorecardId, sm5Scorecard.id))
      .where(inArray(sm5Scorecard.gameId, gameIds)),

    db
      .select({
        scorecardId: sm5GamePlayerInteraction.scorecardId,
        targetScorecardId: sm5GamePlayerInteraction.targetScorecardId,
        shotsHit: sm5GamePlayerInteraction.shotsHit,
        missileHits: sm5GamePlayerInteraction.missileHits,
      })
      .from(sm5GamePlayerInteraction)
      .where(inArray(sm5GamePlayerInteraction.gameId, gameIds)),

    db
      .select({
        gameId: gameTagAssignment.gameId,
        id: gameTag.id,
        name: gameTag.name,
        color: gameTag.color,
      })
      .from(gameTag)
      .innerJoin(gameTagAssignment, eq(gameTagAssignment.tagId, gameTag.id))
      .where(inArray(gameTagAssignment.gameId, gameIds)),
  ]);

  const mvpByScorecard = new Map<string, MvpComponentRow[]>();
  for (const row of mvpRows) {
    if (row.inputValue === 0 && row.points === 0) continue;
    const list = mvpByScorecard.get(row.scorecardId) ?? [];
    list.push({ component: row.component, inputValue: row.inputValue, points: row.points });
    mvpByScorecard.set(row.scorecardId, list);
  }

  const scorecardMeta = new Map<
    string,
    { callsign: string; position: number; score: number; teamId: string }
  >();
  for (const sc of scorecardRows) {
    scorecardMeta.set(sc.id, {
      callsign: sc.callsign,
      position: sc.position,
      score: sc.score,
      teamId: sc.teamId,
    });
  }

  type RawHit = { shotsHit: number; missileHits: number };
  const interactionDealt = new Map<string, Map<string, RawHit>>();
  const interactionReceived = new Map<string, Map<string, RawHit>>();
  for (const row of interactionRows) {
    if (!interactionDealt.has(row.scorecardId)) interactionDealt.set(row.scorecardId, new Map());
    interactionDealt
      .get(row.scorecardId)!
      .set(row.targetScorecardId, { shotsHit: row.shotsHit, missileHits: row.missileHits });
    if (!interactionReceived.has(row.targetScorecardId))
      interactionReceived.set(row.targetScorecardId, new Map());
    interactionReceived
      .get(row.targetScorecardId)!
      .set(row.scorecardId, { shotsHit: row.shotsHit, missileHits: row.missileHits });
  }

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const team of teamRows) {
    const list = teamsByGame.get(team.gameId) ?? [];
    list.push(team);
    teamsByGame.set(team.gameId, list);
  }

  const scorecardsByTeam = new Map<string, typeof scorecardRows>();
  for (const sc of scorecardRows) {
    const list = scorecardsByTeam.get(sc.teamId) ?? [];
    list.push(sc);
    scorecardsByTeam.set(sc.teamId, list);
  }

  const tagsByGame = new Map<string, GameTagSummary[]>();
  for (const tag of tagRows) {
    const list = tagsByGame.get(tag.gameId) ?? [];
    list.push({ id: tag.id, name: tag.name, color: tag.color });
    tagsByGame.set(tag.gameId, list);
  }

  function buildPlayers(teamId: string, teamIdRef: string): GameDetailPlayer[] {
    return (scorecardsByTeam.get(teamId) ?? []).map((sc) => ({
      id: sc.id,
      playerId: sc.playerId,
      iplId: sc.iplId,
      callsign: sc.callsign,
      position: sc.position,
      eliminated: sc.eliminated,
      score: sc.score,
      mvpPoints: sc.mvpPoints,
      livesLeft: sc.livesLeft,
      shotsLeft: sc.shotsLeft,
      hitDiff: sc.hitDiff,
      accuracy: sc.accuracy,
      shotsFired: sc.shotsFired,
      shotsHit: sc.shotsHit,
      shotsHitOpponent: sc.shotsHitOpponent,
      shotsHitOpponent3hit: sc.shotsHitOpponent3hit,
      shotsHitTeam: sc.shotsHitTeam,
      shotsHitOpponentMedic: sc.shotsHitOpponentMedic,
      shotsHitTeamMedic: sc.shotsHitTeamMedic,
      medicHits: sc.medicHits,
      teamMedicHits: sc.teamMedicHits,
      timesHit: sc.timesHit,
      missileHits: sc.missileHits,
      missilesHitOpponent: sc.missilesHitOpponent,
      missilesHitTeam: sc.missilesHitTeam,
      missilesHitOpponentMedic: sc.missilesHitOpponentMedic,
      missilesHitTeamMedic: sc.missilesHitTeamMedic,
      timesHitByMissile: sc.timesHitByMissile,
      nukesActivated: sc.nukesActivated,
      nukesDetonated: sc.nukesDetonated,
      nukesHitMedic: sc.nukesHitMedic,
      livesRemovedByNuke: sc.livesRemovedByNuke,
      totalNukeActivationTime: sc.totalNukeActivationTime,
      averageNukeActivationTime: sc.averageNukeActivationTime,
      nukesCanceled: sc.nukesCanceled,
      teamNukesCanceled: sc.teamNukesCanceled,
      rapidFire: sc.rapidFire,
      totalRapidTime: sc.totalRapidTime,
      averageRapidTime: sc.averageRapidTime,
      shotsFiredDuringRapid: sc.shotsFiredDuringRapid,
      shotsHitDuringRapid: sc.shotsHitDuringRapid,
      shotsHitOpponentDuringRapid: sc.shotsHitOpponentDuringRapid,
      shotsHitTeamDuringRapid: sc.shotsHitTeamDuringRapid,
      accuracyDuringRapid: sc.accuracyDuringRapid,
      ammoBoost: sc.ammoBoost,
      lifeBoost: sc.lifeBoost,
      resuppliesGiven: sc.resuppliesGiven,
      doubleResuppliesGiven: sc.doubleResuppliesGiven,
      resuppliesReceivedAmmo: sc.resuppliesReceivedAmmo,
      resuppliesReceivedLives: sc.resuppliesReceivedLives,
      doubleResuppliesReceived: sc.doubleResuppliesReceived,
      deactivatedOpponent: sc.deactivatedOpponent,
      deactivatedTeam: sc.deactivatedTeam,
      eliminatedOpponent: sc.eliminatedOpponent,
      eliminatedTeam: sc.eliminatedTeam,
      eliminatedOpponentMedic: sc.eliminatedOpponentMedic,
      eliminatedTeamMedic: sc.eliminatedTeamMedic,
      assists: sc.assists,
      resetOpponent: sc.resetOpponent,
      resetTeam: sc.resetTeam,
      missileResetOpponent: sc.missileResetOpponent,
      missileResetTeam: sc.missileResetTeam,
      spEarned: sc.spEarned,
      spSpent: sc.spSpent,
      targetsDestroyed: sc.targetsDestroyed,
      penalties: sc.penalties,
      isMercenary: sc.isMercenary,
      uptime: sc.uptime,
      resupplyDowntime: sc.resupplyDowntime,
      otherDowntime: sc.otherDowntime,
      mvpComponents: mvpByScorecard.get(sc.id) ?? [],
      hitInteractions: (() => {
        const dealt = interactionDealt.get(sc.id) ?? new Map<string, RawHit>();
        const received = interactionReceived.get(sc.id) ?? new Map<string, RawHit>();
        const otherIds = new Set([...dealt.keys(), ...received.keys()]);
        const interactions: PlayerHitData[] = [];
        for (const otherId of otherIds) {
          const meta = scorecardMeta.get(otherId);
          if (!meta) continue;
          const d = dealt.get(otherId) ?? { shotsHit: 0, missileHits: 0 };
          const r = received.get(otherId) ?? { shotsHit: 0, missileHits: 0 };
          interactions.push({
            callsign: meta.callsign,
            position: meta.position,
            isTeammate: meta.teamId === teamIdRef,
            hitsDealt: d.shotsHit,
            missilesDealt: d.missileHits,
            hitsReceived: r.shotsHit,
            missilesReceived: r.missileHits,
            score: meta.score,
          });
        }
        return interactions.sort((a, b) => b.score - a.score);
      })(),
    }));
  }

  return gameRows.map((gameRow) => {
    const gameTeams: GameDetailTeam[] = (teamsByGame.get(gameRow.id) ?? [])
      .sort((a, b) => (a.result === "win" ? -1 : b.result === "win" ? 1 : 0))
      .map((team) => ({
        id: team.id,
        name: team.name,
        colourEnum: team.colourEnum,
        score: team.score,
        eliminationBonus: team.eliminationBonus,
        penaltyScore: 0,
        result: team.result,
        eliminated: team.eliminated,
        players: buildPlayers(team.id, team.id),
      }));

    return {
      id: gameRow.id,
      slug: gameRow.slug,
      centerId: gameRow.centerId,
      centerSlug: gameRow.centerSlug,
      competitionId: gameRow.competitionId,
      competitionName: null,
      description: gameRow.description,
      startTime: gameRow.startTime,
      centerName: gameRow.centerName,
      outcome: gameRow.outcome,
      scheduledDuration: gameRow.scheduledDuration,
      actualDuration: gameRow.actualDuration,
      exclude: gameRow.exclude,
      tdfFilename: gameRow.tdfFilename,
      tags: tagsByGame.get(gameRow.id) ?? [],
      teams: gameTeams,
    };
  });
}

export async function getGameCenterId(id: string): Promise<string | null> {
  const [row] = await db.select({ centerId: game.centerId }).from(game).where(eq(game.id, id));
  return row?.centerId ?? null;
}

export async function deleteGame(id: string): Promise<void> {
  await db.delete(game).where(eq(game.id, id));
}

export async function getGameDetail(id: string): Promise<GameDetail | null> {
  const [gameRow] = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerId: game.centerId,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      competitionId: game.competitionId,
      competitionName: competition.name,
      description: game.description,
      startTime: game.startTime,
      centerName: center.name,
      outcome: game.outcome,
      scheduledDuration: game.scheduledDuration,
      actualDuration: game.actualDuration,
      exclude: game.exclude,
      tdfFilename: game.tdfFilename,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .leftJoin(competition, eq(game.competitionId, competition.id))
    .where(eq(game.id, id));

  if (!gameRow) return null;

  const [teamRows, scorecardRows, mvpRows, interactionRows, tagRows, penaltyTotals] =
    await Promise.all([
      db
        .select({
          id: sm5GameTeam.id,
          name: sm5GameTeam.name,
          colourEnum: sm5GameTeam.colourEnum,
          score: sm5GameTeam.score,
          eliminationBonus: sm5GameTeam.eliminationBonus,
          result: sm5GameTeam.result,
          eliminated: sm5GameTeam.eliminated,
        })
        .from(sm5GameTeam)
        .where(and(eq(sm5GameTeam.gameId, id), eq(sm5GameTeam.isNeutral, false))),

      db
        .select({
          id: sm5Scorecard.id,
          teamId: sm5Scorecard.teamId,
          playerId: sm5Scorecard.playerId,
          iplId: sm5Scorecard.iplId,
          callsign: sm5Scorecard.callsign,
          position: sm5Scorecard.position,
          eliminated: sm5Scorecard.eliminated,
          score: sm5Scorecard.score,
          mvpPoints: sm5Scorecard.mvpPoints,
          livesLeft: sm5Scorecard.livesLeft,
          shotsLeft: sm5Scorecard.shotsLeft,
          hitDiff: sm5Scorecard.hitDiff,
          accuracy: sm5Scorecard.accuracy,
          // Shot stats
          shotsFired: sm5Scorecard.shotsFired,
          shotsHit: sm5Scorecard.shotsHit,
          shotsHitOpponent: sm5Scorecard.shotsHitOpponent,
          shotsHitOpponent3hit: sm5Scorecard.shotsHitOpponent3hit,
          shotsHitTeam: sm5Scorecard.shotsHitTeam,
          shotsHitOpponentMedic: sm5Scorecard.shotsHitOpponentMedic,
          shotsHitTeamMedic: sm5Scorecard.shotsHitTeamMedic,
          medicHits: sm5Scorecard.medicHits,
          teamMedicHits: sm5Scorecard.teamMedicHits,
          timesHit: sm5Scorecard.timesHit,
          // Missile stats
          missileHits: sm5Scorecard.missileHits,
          missilesHitOpponent: sm5Scorecard.missilesHitOpponent,
          missilesHitTeam: sm5Scorecard.missilesHitTeam,
          missilesHitOpponentMedic: sm5Scorecard.missilesHitOpponentMedic,
          missilesHitTeamMedic: sm5Scorecard.missilesHitTeamMedic,
          timesHitByMissile: sm5Scorecard.timesHitByMissile,
          // Nuke stats
          nukesActivated: sm5Scorecard.nukesActivated,
          nukesDetonated: sm5Scorecard.nukesDetonated,
          nukesHitMedic: sm5Scorecard.nukesHitMedic,
          livesRemovedByNuke: sm5Scorecard.livesRemovedByNuke,
          totalNukeActivationTime: sm5Scorecard.totalNukeActivationTime,
          averageNukeActivationTime: sm5Scorecard.averageNukeActivationTime,
          // Nuke cancel stats
          nukesCanceled: sm5Scorecard.nukesCanceled,
          teamNukesCanceled: sm5Scorecard.teamNukesCanceled,
          // Scout special ability
          rapidFire: sm5Scorecard.rapidFire,
          totalRapidTime: sm5Scorecard.totalRapidTime,
          averageRapidTime: sm5Scorecard.averageRapidTime,
          shotsFiredDuringRapid: sm5Scorecard.shotsFiredDuringRapid,
          shotsHitDuringRapid: sm5Scorecard.shotsHitDuringRapid,
          shotsHitOpponentDuringRapid: sm5Scorecard.shotsHitOpponentDuringRapid,
          shotsHitTeamDuringRapid: sm5Scorecard.shotsHitTeamDuringRapid,
          accuracyDuringRapid: sm5Scorecard.accuracyDuringRapid,
          // Ammo/Medic special ability
          ammoBoost: sm5Scorecard.ammoBoost,
          lifeBoost: sm5Scorecard.lifeBoost,
          // Support stats
          resuppliesGiven: sm5Scorecard.resuppliesGiven,
          doubleResuppliesGiven: sm5Scorecard.doubleResuppliesGiven,
          resuppliesReceivedAmmo: sm5Scorecard.resuppliesReceivedAmmo,
          resuppliesReceivedLives: sm5Scorecard.resuppliesReceivedLives,
          doubleResuppliesReceived: sm5Scorecard.doubleResuppliesReceived,
          // Combat outcomes
          deactivatedOpponent: sm5Scorecard.deactivatedOpponent,
          deactivatedTeam: sm5Scorecard.deactivatedTeam,
          eliminatedOpponent: sm5Scorecard.eliminatedOpponent,
          eliminatedTeam: sm5Scorecard.eliminatedTeam,
          eliminatedOpponentMedic: sm5Scorecard.eliminatedOpponentMedic,
          eliminatedTeamMedic: sm5Scorecard.eliminatedTeamMedic,
          assists: sm5Scorecard.assists,
          resetOpponent: sm5Scorecard.resetOpponent,
          resetTeam: sm5Scorecard.resetTeam,
          missileResetOpponent: sm5Scorecard.missileResetOpponent,
          missileResetTeam: sm5Scorecard.missileResetTeam,
          // SP tracking
          spEarned: sm5Scorecard.spEarned,
          spSpent: sm5Scorecard.spSpent,
          // Targets and penalties
          targetsDestroyed: sm5Scorecard.targetsDestroyed,
          penalties: sm5Scorecard.penalties,
          isMercenary: sm5Scorecard.isMercenary,
          // Uptime & downtime
          uptime: sm5Scorecard.uptime,
          resupplyDowntime: sm5Scorecard.resupplyDowntime,
          otherDowntime: sm5Scorecard.otherDowntime,
        })
        .from(sm5Scorecard)
        .where(eq(sm5Scorecard.gameId, id))
        .orderBy(desc(sm5Scorecard.score)),

      db
        .select({
          scorecardId: sm5ScorecardMvp.scorecardId,
          component: sm5ScorecardMvp.component,
          inputValue: sm5ScorecardMvp.inputValue,
          points: sm5ScorecardMvp.points,
        })
        .from(sm5ScorecardMvp)
        .innerJoin(sm5Scorecard, eq(sm5ScorecardMvp.scorecardId, sm5Scorecard.id))
        .where(eq(sm5Scorecard.gameId, id)),

      db
        .select({
          scorecardId: sm5GamePlayerInteraction.scorecardId,
          targetScorecardId: sm5GamePlayerInteraction.targetScorecardId,
          shotsHit: sm5GamePlayerInteraction.shotsHit,
          missileHits: sm5GamePlayerInteraction.missileHits,
        })
        .from(sm5GamePlayerInteraction)
        .where(eq(sm5GamePlayerInteraction.gameId, id)),

      db
        .select({
          id: gameTag.id,
          name: gameTag.name,
          color: gameTag.color,
        })
        .from(gameTag)
        .innerJoin(gameTagAssignment, eq(gameTagAssignment.tagId, gameTag.id))
        .where(eq(gameTagAssignment.gameId, id)),

      getTeamPenaltyTotals(id),
    ]);

  const mvpByScorecard = new Map<string, MvpComponentRow[]>();
  for (const row of mvpRows) {
    if (row.inputValue === 0 && row.points === 0) continue;
    const list = mvpByScorecard.get(row.scorecardId) ?? [];
    list.push({
      component: row.component,
      inputValue: row.inputValue,
      points: row.points,
    });
    mvpByScorecard.set(row.scorecardId, list);
  }

  // Build a lookup of scorecardId → {callsign, position, score, teamId} for interaction labeling
  const scorecardMeta = new Map<
    string,
    { callsign: string; position: number; score: number; teamId: string }
  >();
  for (const sc of scorecardRows) {
    scorecardMeta.set(sc.id, {
      callsign: sc.callsign,
      position: sc.position,
      score: sc.score,
      teamId: sc.teamId,
    });
  }

  // Build bidirectional interaction data keyed by player scorecardId
  // interactionDealt[actorId][targetId] = {shotsHit, missileHits}
  // interactionReceived[targetId][actorId] = {shotsHit, missileHits}
  type RawHit = { shotsHit: number; missileHits: number };
  const interactionDealt = new Map<string, Map<string, RawHit>>();
  const interactionReceived = new Map<string, Map<string, RawHit>>();

  for (const row of interactionRows) {
    if (!interactionDealt.has(row.scorecardId)) interactionDealt.set(row.scorecardId, new Map());
    interactionDealt.get(row.scorecardId)!.set(row.targetScorecardId, {
      shotsHit: row.shotsHit,
      missileHits: row.missileHits,
    });
    if (!interactionReceived.has(row.targetScorecardId))
      interactionReceived.set(row.targetScorecardId, new Map());
    interactionReceived.get(row.targetScorecardId)!.set(row.scorecardId, {
      shotsHit: row.shotsHit,
      missileHits: row.missileHits,
    });
  }

  const scorecardsByTeam = new Map<string, typeof scorecardRows>();
  for (const sc of scorecardRows) {
    const list = scorecardsByTeam.get(sc.teamId) ?? [];
    list.push(sc);
    scorecardsByTeam.set(sc.teamId, list);
  }

  const teams: GameDetailTeam[] = teamRows
    .sort((a, b) => (a.result === "win" ? -1 : b.result === "win" ? 1 : 0))
    .map((team) => ({
      id: team.id,
      name: team.name,
      colourEnum: team.colourEnum,
      score: team.score,
      eliminationBonus: team.eliminationBonus,
      penaltyScore: penaltyTotals.get(team.id) ?? 0,
      result: team.result,
      eliminated: team.eliminated,
      players: (scorecardsByTeam.get(team.id) ?? []).map((sc) => ({
        id: sc.id,
        playerId: sc.playerId,
        iplId: sc.iplId,
        callsign: sc.callsign,
        position: sc.position,
        eliminated: sc.eliminated,
        score: sc.score,
        mvpPoints: sc.mvpPoints,
        livesLeft: sc.livesLeft,
        shotsLeft: sc.shotsLeft,
        hitDiff: sc.hitDiff,
        accuracy: sc.accuracy,
        shotsFired: sc.shotsFired,
        shotsHit: sc.shotsHit,
        shotsHitOpponent: sc.shotsHitOpponent,
        shotsHitOpponent3hit: sc.shotsHitOpponent3hit,
        shotsHitTeam: sc.shotsHitTeam,
        shotsHitOpponentMedic: sc.shotsHitOpponentMedic,
        shotsHitTeamMedic: sc.shotsHitTeamMedic,
        medicHits: sc.medicHits,
        teamMedicHits: sc.teamMedicHits,
        timesHit: sc.timesHit,
        missileHits: sc.missileHits,
        missilesHitOpponent: sc.missilesHitOpponent,
        missilesHitTeam: sc.missilesHitTeam,
        missilesHitOpponentMedic: sc.missilesHitOpponentMedic,
        missilesHitTeamMedic: sc.missilesHitTeamMedic,
        timesHitByMissile: sc.timesHitByMissile,
        nukesActivated: sc.nukesActivated,
        nukesDetonated: sc.nukesDetonated,
        nukesHitMedic: sc.nukesHitMedic,
        livesRemovedByNuke: sc.livesRemovedByNuke,
        totalNukeActivationTime: sc.totalNukeActivationTime,
        averageNukeActivationTime: sc.averageNukeActivationTime,
        nukesCanceled: sc.nukesCanceled,
        teamNukesCanceled: sc.teamNukesCanceled,
        rapidFire: sc.rapidFire,
        totalRapidTime: sc.totalRapidTime,
        averageRapidTime: sc.averageRapidTime,
        shotsFiredDuringRapid: sc.shotsFiredDuringRapid,
        shotsHitDuringRapid: sc.shotsHitDuringRapid,
        shotsHitOpponentDuringRapid: sc.shotsHitOpponentDuringRapid,
        shotsHitTeamDuringRapid: sc.shotsHitTeamDuringRapid,
        accuracyDuringRapid: sc.accuracyDuringRapid,
        ammoBoost: sc.ammoBoost,
        lifeBoost: sc.lifeBoost,
        resuppliesGiven: sc.resuppliesGiven,
        doubleResuppliesGiven: sc.doubleResuppliesGiven,
        resuppliesReceivedAmmo: sc.resuppliesReceivedAmmo,
        resuppliesReceivedLives: sc.resuppliesReceivedLives,
        doubleResuppliesReceived: sc.doubleResuppliesReceived,
        deactivatedOpponent: sc.deactivatedOpponent,
        deactivatedTeam: sc.deactivatedTeam,
        eliminatedOpponent: sc.eliminatedOpponent,
        eliminatedTeam: sc.eliminatedTeam,
        eliminatedOpponentMedic: sc.eliminatedOpponentMedic,
        eliminatedTeamMedic: sc.eliminatedTeamMedic,
        assists: sc.assists,
        resetOpponent: sc.resetOpponent,
        resetTeam: sc.resetTeam,
        missileResetOpponent: sc.missileResetOpponent,
        missileResetTeam: sc.missileResetTeam,
        spEarned: sc.spEarned,
        spSpent: sc.spSpent,
        targetsDestroyed: sc.targetsDestroyed,
        penalties: sc.penalties,
        isMercenary: sc.isMercenary,
        uptime: sc.uptime,
        resupplyDowntime: sc.resupplyDowntime,
        otherDowntime: sc.otherDowntime,
        mvpComponents: mvpByScorecard.get(sc.id) ?? [],
        hitInteractions: (() => {
          const dealt = interactionDealt.get(sc.id) ?? new Map<string, RawHit>();
          const received = interactionReceived.get(sc.id) ?? new Map<string, RawHit>();
          const otherIds = new Set([...dealt.keys(), ...received.keys()]);
          const interactions: PlayerHitData[] = [];
          for (const otherId of otherIds) {
            const meta = scorecardMeta.get(otherId);
            if (!meta) continue;
            const d = dealt.get(otherId) ?? { shotsHit: 0, missileHits: 0 };
            const r = received.get(otherId) ?? { shotsHit: 0, missileHits: 0 };
            interactions.push({
              callsign: meta.callsign,
              position: meta.position,
              isTeammate: meta.teamId === sc.teamId,
              hitsDealt: d.shotsHit,
              missilesDealt: d.missileHits,
              hitsReceived: r.shotsHit,
              missilesReceived: r.missileHits,
              score: meta.score,
            });
          }
          return interactions.sort((a, b) => b.score - a.score);
        })(),
      })),
    }));

  return {
    id: gameRow.id,
    slug: gameRow.slug,
    centerId: gameRow.centerId,
    centerSlug: gameRow.centerSlug,
    competitionId: gameRow.competitionId,
    competitionName: gameRow.competitionName ?? null,
    description: gameRow.description,
    startTime: gameRow.startTime,
    centerName: gameRow.centerName,
    outcome: gameRow.outcome,
    scheduledDuration: gameRow.scheduledDuration,
    actualDuration: gameRow.actualDuration,
    exclude: gameRow.exclude,
    tdfFilename: gameRow.tdfFilename,
    tags: tagRows.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    teams,
  };
}

export async function getGameDetailBySlug(slug: string): Promise<GameDetail | null> {
  const parts = slug.split("-");
  if (parts.length !== 3) return null;
  const [cc, sc, ts] = parts;
  const countryCode = parseInt(cc, 10);
  const siteCode = parseInt(sc, 10);
  if (isNaN(countryCode) || isNaN(siteCode) || !/^\d{14}$/.test(ts)) return null;

  const [idRow] = await db
    .select({ id: game.id })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(center.countryCode, countryCode),
        eq(center.siteCode, siteCode),
        sql`to_char(${game.startTime}, 'YYYYMMDDHH24MISS') = ${ts}`,
      ),
    );

  if (!idRow) return null;
  return getGameDetail(idRow.id);
}

export async function getGameSlugById(gameId: string): Promise<string | null> {
  const [row] = await db
    .select({
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(eq(game.id, gameId));

  return row?.slug ?? null;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export type ReplayPlayer = {
  scorecardId: string;
  callsign: string;
  position: number;
  teamId: string;
  teamName: string;
  teamColour: number;
  eliminated: boolean;
};

export type ReplayEvent = {
  id: string;
  time: number;
  eventType: string;
  description: string;
  actorScorecardId: string | null;
  actorGameTargetId: string | null;
  targetScorecardId: string | null;
  isPlayerTarget: boolean;
};

export type NonPlayerActor = {
  gameTargetId: string;
  name: string;
  type: string;
};

export type ReplayPlayerState = {
  scorecardId: string;
  time: number;
  score: number;
  lives: number;
  shots: number;
  missiles: number;
  sp: number;
  state: number;
  isEliminated: boolean;
  accuracy: number;
  hitDiff: number;
};

export type ReplayData = {
  duration: number;
  players: ReplayPlayer[];
  events: ReplayEvent[];
  playerStates: ReplayPlayerState[];
  nonPlayerActors: NonPlayerActor[];
};

export async function getGameReplayData(gameId: string): Promise<ReplayData | null> {
  const [gameRow] = await db
    .select({ actualDuration: game.actualDuration })
    .from(game)
    .where(eq(game.id, gameId));

  if (!gameRow) return null;

  const [eventRows, stateRows, scorecardRows, nonPlayerActorRows] = await Promise.all([
    db
      .select({
        id: sm5GameEvent.id,
        time: sm5GameEvent.time,
        eventType: sm5GameEvent.eventType,
        description: sm5GameEvent.description,
        actorScorecardId: sm5GameEvent.actorScorecardId,
        actorGameTargetId: sm5GameEvent.actorGameTargetId,
        targetScorecardId: sm5GameEvent.targetScorecardId,
        targetGameTargetId: sm5GameEvent.targetGameTargetId,
      })
      .from(sm5GameEvent)
      .where(eq(sm5GameEvent.gameId, gameId))
      .orderBy(asc(sm5GameEvent.time)),

    db
      .select({
        scorecardId: sm5GamePlayerState.scorecardId,
        time: sm5GamePlayerState.time,
        score: sm5GamePlayerState.score,
        lives: sm5GamePlayerState.lives,
        shots: sm5GamePlayerState.shots,
        missiles: sm5GamePlayerState.missiles,
        sp: sm5GamePlayerState.sp,
        state: sm5GamePlayerState.state,
        isEliminated: sm5GamePlayerState.isEliminated,
        accuracy: sm5GamePlayerState.accuracy,
        hitDiff: sm5GamePlayerState.hitDiff,
      })
      .from(sm5GamePlayerState)
      .where(eq(sm5GamePlayerState.gameId, gameId))
      .orderBy(asc(sm5GamePlayerState.scorecardId), asc(sm5GamePlayerState.time)),

    db
      .select({
        id: sm5Scorecard.id,
        callsign: sm5Scorecard.callsign,
        position: sm5Scorecard.position,
        teamId: sm5Scorecard.teamId,
        eliminated: sm5Scorecard.eliminated,
        teamName: sm5GameTeam.name,
        teamColour: sm5GameTeam.colourEnum,
      })
      .from(sm5Scorecard)
      .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
      .where(and(eq(sm5Scorecard.gameId, gameId), eq(sm5GameTeam.isNeutral, false))),

    db
      .select({
        gameTargetId: sm5GameTarget.id,
        name: target.name,
        type: sm5GameTarget.type,
      })
      .from(sm5GameTarget)
      .innerJoin(target, eq(sm5GameTarget.targetId, target.id))
      .where(eq(sm5GameTarget.gameId, gameId)),
  ]);

  return {
    duration: gameRow.actualDuration,
    players: scorecardRows.map((sc) => ({
      scorecardId: sc.id,
      callsign: sc.callsign,
      position: sc.position,
      teamId: sc.teamId,
      teamName: sc.teamName,
      teamColour: sc.teamColour,
      eliminated: sc.eliminated,
    })),
    events: eventRows.map((e) => ({
      id: e.id,
      time: e.time,
      eventType: e.eventType,
      description: e.description,
      actorScorecardId: e.actorScorecardId,
      actorGameTargetId: e.actorGameTargetId,
      targetScorecardId: e.targetScorecardId,
      isPlayerTarget: e.targetScorecardId !== null,
    })),
    playerStates: stateRows.map((s) => ({
      scorecardId: s.scorecardId,
      time: s.time,
      score: s.score,
      lives: s.lives,
      shots: s.shots,
      missiles: s.missiles,
      sp: s.sp,
      state: s.state,
      isEliminated: s.isEliminated,
      accuracy: s.accuracy,
      hitDiff: s.hitDiff,
    })),
    nonPlayerActors: nonPlayerActorRows,
  };
}

export async function setScorecardMercenary(
  scorecardId: string,
  isMercenary: boolean,
): Promise<void> {
  await db.update(sm5Scorecard).set({ isMercenary }).where(eq(sm5Scorecard.id, scorecardId));
}
