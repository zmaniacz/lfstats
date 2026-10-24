// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Pure standings arithmetic for team, trios and duos competitions. Kept free of the db client
 * so it can be unit-tested directly; the queries in competition-tournament.ts feed it rows.
 *
 * A side of a match is one team, or several teams sharing one sm5_game_team — two trios in a
 * trios competition, three duos in a duos competition. Every point a side earns is credited in
 * full to each team on it.
 */

/** The teams on one side of a match: the main slot plus any partner slots that are set. */
export function sideTeamIds(...ids: (string | null | undefined)[]): string[] {
  return ids.filter((id): id is string => id != null);
}

export type StandingsGameRow = {
  matchId: string;
  gameNumber: number;
  // Round-level scaling applied to every point this game can earn.
  roundMultiplier: number;
  team1Id: string | null;
  // Trios and duos: the second team on side 1. Null in every other format.
  team1PartnerId: string | null;
  // Duos only: the third duo on side 1.
  team1Partner2Id: string | null;
  team1Score: number;
  team1Result: string;
  team1EliminatedOpponent: boolean;
  team2Id: string | null;
  team2PartnerId: string | null;
  team2Partner2Id: string | null;
  team2Score: number;
  team2Result: string;
  team2EliminatedOpponent: boolean;
};

export type TeamStatsAccumulator = {
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
  teamEliminations: number;
  scoreFor: number;
  scoreAgainst: number;
};

export function emptyTeamStats(): TeamStatsAccumulator {
  return {
    matchPoints: 0,
    matchWins: 0,
    matchLosses: 0,
    matchDraws: 0,
    gameWins: 0,
    gameLosses: 0,
    gameDraws: 0,
    teamEliminations: 0,
    scoreFor: 0,
    scoreAgainst: 0,
  };
}

// Accumulates per-team match/game stats from a set of match-game rows.
// Shared by the overall round standings and per-pool standings (split-pool rounds).
export function computeTeamStats(gameRows: StandingsGameRow[]): Map<string, TeamStatsAccumulator> {
  // Group games by match (matches always have both teams assigned once games are linked)
  const matchMap = new Map<
    string,
    { side1: string[]; side2: string[]; multiplier: number; games: StandingsGameRow[] }
  >();
  for (const row of gameRows) {
    if (row.team1Id === null || row.team2Id === null) continue;
    if (!matchMap.has(row.matchId)) {
      matchMap.set(row.matchId, {
        side1: sideTeamIds(row.team1Id, row.team1PartnerId, row.team1Partner2Id),
        side2: sideTeamIds(row.team2Id, row.team2PartnerId, row.team2Partner2Id),
        multiplier: row.roundMultiplier,
        games: [],
      });
    }
    matchMap.get(row.matchId)!.games.push(row);
  }

  const stats = new Map<string, TeamStatsAccumulator>();

  function ensureTeam(id: string) {
    if (!stats.has(id)) stats.set(id, emptyTeamStats());
    return stats.get(id)!;
  }

  for (const [, { side1, side2, multiplier, games }] of matchMap) {
    const s1 = side1.map(ensureTeam);
    const s2 = side2.map(ensureTeam);
    const each = (side: TeamStatsAccumulator[], fn: (t: TeamStatsAccumulator) => void) =>
      side.forEach(fn);

    let t1TotalScore = 0;
    let t2TotalScore = 0;

    for (const g of games) {
      const t1s = Number(g.team1Score ?? 0);
      const t2s = Number(g.team2Score ?? 0);
      t1TotalScore += t1s;
      t2TotalScore += t2s;

      each(s1, (t) => {
        t.scoreFor += t1s;
        t.scoreAgainst += t2s;
        if (g.team1EliminatedOpponent) t.teamEliminations += 1;
      });
      each(s2, (t) => {
        t.scoreFor += t2s;
        t.scoreAgainst += t1s;
        if (g.team2EliminatedOpponent) t.teamEliminations += 1;
      });

      // Game points: 2 per win, 1 per draw, scaled by the round multiplier.
      if (g.team1Result === "win") {
        each(s1, (t) => {
          t.gameWins += 1;
          t.matchPoints += 2 * multiplier;
        });
        each(s2, (t) => (t.gameLosses += 1));
      } else if (g.team2Result === "win") {
        each(s2, (t) => {
          t.gameWins += 1;
          t.matchPoints += 2 * multiplier;
        });
        each(s1, (t) => (t.gameLosses += 1));
      } else {
        each([...s1, ...s2], (t) => {
          t.gameDraws += 1;
          t.matchPoints += multiplier;
        });
      }
    }

    // Match bonus: compare combined scores. Only awarded once the match is complete
    // (both games reported) — an in-progress match shouldn't grant the win/draw bonus yet.
    if (games.length >= 2) {
      if (t1TotalScore > t2TotalScore) {
        each(s1, (t) => {
          t.matchPoints += 2 * multiplier;
          t.matchWins += 1;
        });
        each(s2, (t) => (t.matchLosses += 1));
      } else if (t2TotalScore > t1TotalScore) {
        each(s2, (t) => {
          t.matchPoints += 2 * multiplier;
          t.matchWins += 1;
        });
        each(s1, (t) => (t.matchLosses += 1));
      } else {
        each([...s1, ...s2], (t) => {
          t.matchPoints += multiplier;
          t.matchDraws += 1;
        });
      }
    }
  }

  return stats;
}

function scoreRatio(s: { scoreFor: number; scoreAgainst: number }): number {
  return s.scoreAgainst === 0 ? (s.scoreFor === 0 ? 0 : Infinity) : s.scoreFor / s.scoreAgainst;
}

/**
 * Standings order: match points, then score ratio, then game wins. In a trios or duos
 * competition scoreFor/scoreAgainst hold the team's own player score rather than the side's
 * team score (see getPartnerScoreTotals), so the same comparator serves every format.
 */
export function compareStandings(
  a: { matchPoints: number; scoreFor: number; scoreAgainst: number; gameWins: number },
  b: { matchPoints: number; scoreFor: number; scoreAgainst: number; gameWins: number },
): number {
  if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
  const ratioA = scoreRatio(a);
  const ratioB = scoreRatio(b);
  if (ratioB !== ratioA) return ratioB - ratioA;
  return b.gameWins - a.gameWins;
}
