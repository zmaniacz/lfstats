import { db } from "../client";
import {
  game,
  sm5GameTeam,
  sm5Scorecard,
  sm5ScorecardMvp,
  sm5GamePlayerInteraction,
  center,
} from "../schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";

export const GAMES_PER_PAGE = 10;

export type GameTeamSummary = {
  colourEnum: number;
  score: number | null;
  eliminationBonus: number | null;
  result: "win" | "loss" | "draw" | null;
};

export type GameListItem = {
  id: string;
  startTime: Date;
  outcome: "score" | "elimination" | "draw";
  centerName: string;
  description: string | null;
  teams: GameTeamSummary[];
};

export async function getGamesPage(page: number): Promise<GameListItem[]> {
  const offset = (page - 1) * GAMES_PER_PAGE;

  const rows = await db
    .select({
      id: game.id,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
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
    .where(
      and(
        inArray(sm5GameTeam.gameId, gameIds),
        eq(sm5GameTeam.isNeutral, false),
      ),
    )
    .orderBy(sm5GameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const team of teamRows) {
    const list = teamsByGame.get(team.gameId) ?? [];
    list.push(team);
    teamsByGame.set(team.gameId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    startTime: row.startTime,
    outcome: row.outcome,
    centerName: row.centerName,
    description: row.description,
    teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
      colourEnum: t.colourEnum,
      score: t.score,
      eliminationBonus: t.eliminationBonus,
      result: t.result,
    })),
  }));
}

export async function getGamesCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(game);
  return row?.count ?? 0;
}

export type MvpComponentRow = {
  component: string;
  inputValue: number;
  points: number;
};

export type PlayerHitData = {
  callsign: string;
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
  result: "win" | "loss" | "draw" | null;
  eliminated: boolean | null;
  players: GameDetailPlayer[];
};

export type GameDetail = {
  id: string;
  centerId: string;
  description: string | null;
  startTime: Date;
  centerName: string;
  outcome: "score" | "elimination" | "draw";
  scheduledDuration: number;
  actualDuration: number;
  teams: GameDetailTeam[];
};

export async function getGameCenterId(id: string): Promise<string | null> {
  const [row] = await db
    .select({ centerId: game.centerId })
    .from(game)
    .where(eq(game.id, id));
  return row?.centerId ?? null;
}

export async function deleteGame(id: string): Promise<void> {
  await db.delete(game).where(eq(game.id, id));
}

export async function getGameDetail(id: string): Promise<GameDetail | null> {
  const [gameRow] = await db
    .select({
      id: game.id,
      centerId: game.centerId,
      description: game.description,
      startTime: game.startTime,
      centerName: center.name,
      outcome: game.outcome,
      scheduledDuration: game.scheduledDuration,
      actualDuration: game.actualDuration,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(eq(game.id, id));

  if (!gameRow) return null;

  const [teamRows, scorecardRows, mvpRows, interactionRows] = await Promise.all(
    [
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
        .where(
          and(eq(sm5GameTeam.gameId, id), eq(sm5GameTeam.isNeutral, false)),
        ),

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
        .innerJoin(
          sm5Scorecard,
          eq(sm5ScorecardMvp.scorecardId, sm5Scorecard.id),
        )
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
    ],
  );

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

  // Build a lookup of scorecardId → {callsign, teamId} for interaction labeling
  const scorecardMeta = new Map<string, { callsign: string; teamId: string }>();
  for (const sc of scorecardRows) {
    scorecardMeta.set(sc.id, { callsign: sc.callsign, teamId: sc.teamId });
  }

  // Build bidirectional interaction data keyed by player scorecardId
  // interactionDealt[actorId][targetId] = {shotsHit, missileHits}
  // interactionReceived[targetId][actorId] = {shotsHit, missileHits}
  type RawHit = { shotsHit: number; missileHits: number };
  const interactionDealt = new Map<string, Map<string, RawHit>>();
  const interactionReceived = new Map<string, Map<string, RawHit>>();

  for (const row of interactionRows) {
    if (!interactionDealt.has(row.scorecardId))
      interactionDealt.set(row.scorecardId, new Map());
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
        uptime: sc.uptime,
        resupplyDowntime: sc.resupplyDowntime,
        otherDowntime: sc.otherDowntime,
        mvpComponents: mvpByScorecard.get(sc.id) ?? [],
        hitInteractions: (() => {
          const dealt =
            interactionDealt.get(sc.id) ?? new Map<string, RawHit>();
          const received =
            interactionReceived.get(sc.id) ?? new Map<string, RawHit>();
          const otherIds = new Set([...dealt.keys(), ...received.keys()]);
          const interactions: PlayerHitData[] = [];
          for (const otherId of otherIds) {
            const meta = scorecardMeta.get(otherId);
            if (!meta) continue;
            const d = dealt.get(otherId) ?? { shotsHit: 0, missileHits: 0 };
            const r = received.get(otherId) ?? { shotsHit: 0, missileHits: 0 };
            interactions.push({
              callsign: meta.callsign,
              isTeammate: meta.teamId === sc.teamId,
              hitsDealt: d.shotsHit,
              missilesDealt: d.missileHits,
              hitsReceived: r.shotsHit,
              missilesReceived: r.missileHits,
            });
          }
          return interactions;
        })(),
      })),
    }));

  return {
    id: gameRow.id,
    centerId: gameRow.centerId,
    description: gameRow.description,
    startTime: gameRow.startTime,
    centerName: gameRow.centerName,
    outcome: gameRow.outcome,
    scheduledDuration: gameRow.scheduledDuration,
    actualDuration: gameRow.actualDuration,
    teams,
  };
}
