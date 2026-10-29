// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Pure standings arithmetic for Laserball competitions. Kept free of the db client so it can be
 * unit-tested directly; competition-laserball.ts feeds it rows.
 *
 * A Laserball match is one lb_match: half 1 and half 2, with the teams swapping sides between
 * them, plus an optional overtime (half 3) played only to break a tie. The match goes to the
 * team with more goals over halves 1 and 2; if those are level, the overtime decides it, and
 * with no overtime (or a level one) it is a tie. A win is worth 1 point and a tie 0.5 each,
 * scaled by the round multiplier. Nothing is awarded per half.
 */

export type LbStandingsHalfRow = {
  competitionMatchId: string;
  roundMultiplier: number;
  team1Id: string | null;
  team2Id: string | null;
  // 1, 2 or 3 (overtime). Side 1 is always the competition match's team 1.
  half: number;
  team1Goals: number;
  team2Goals: number;
};

export type LbMatchOutcome = {
  // Goals over every linked half, overtime included.
  team1Goals: number;
  team2Goals: number;
  // Null while incomplete (a regulation half is missing) — unless `completedCompetition`
  // finalises a one-half match on that half's result, which still earns no points.
  winner: 1 | 2 | "tie" | null;
  // Whether the match counts in the standings: both regulation halves are linked.
  complete: boolean;
  overtime: boolean;
};

/** One match's result from its linked halves. */
export function lbMatchOutcome(
  halves: { half: number; team1Goals: number; team2Goals: number }[],
  completedCompetition = false,
): LbMatchOutcome {
  const regulation = halves.filter((h) => h.half === 1 || h.half === 2);
  const overtime = halves.find((h) => h.half === 3);
  const team1Goals = halves.reduce((n, h) => n + h.team1Goals, 0);
  const team2Goals = halves.reduce((n, h) => n + h.team2Goals, 0);
  const compare = (a: number, b: number): 1 | 2 | "tie" => (a > b ? 1 : b > a ? 2 : "tie");

  if (regulation.length < 2) {
    // A lone half is final only once the competition is over, and never earns points.
    const only = regulation[0];
    return {
      team1Goals,
      team2Goals,
      winner: completedCompetition && only ? compare(only.team1Goals, only.team2Goals) : null,
      complete: false,
      overtime: false,
    };
  }

  const reg1 = regulation.reduce((n, h) => n + h.team1Goals, 0);
  const reg2 = regulation.reduce((n, h) => n + h.team2Goals, 0);
  let winner = compare(reg1, reg2);
  if (winner === "tie" && overtime) winner = compare(overtime.team1Goals, overtime.team2Goals);
  return { team1Goals, team2Goals, winner, complete: true, overtime: !!overtime };
}

export type LbTeamStats = {
  matchesPlayed: number;
  wins: number;
  ties: number;
  losses: number;
  // Match points plus adjustments.
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  // Net competition_team_adjustment points, already included in `points`.
  adjustmentPoints: number;
};

export function emptyLbTeamStats(): LbTeamStats {
  return {
    matchesPlayed: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    adjustmentPoints: 0,
  };
}

/**
 * Per-team standings from every linked half. Goals for and against count every half that was
 * played, including an incomplete match's and an overtime's; W/T/L and points count complete
 * matches only.
 */
export function computeLbTeamStats(rows: LbStandingsHalfRow[]): Map<string, LbTeamStats> {
  const matches = new Map<string, LbStandingsHalfRow[]>();
  for (const r of rows) {
    if (r.team1Id === null || r.team2Id === null) continue;
    const list = matches.get(r.competitionMatchId) ?? [];
    list.push(r);
    matches.set(r.competitionMatchId, list);
  }

  const stats = new Map<string, LbTeamStats>();
  const ensure = (id: string) => {
    if (!stats.has(id)) stats.set(id, emptyLbTeamStats());
    return stats.get(id)!;
  };

  for (const halves of matches.values()) {
    const { team1Id, team2Id, roundMultiplier } = halves[0];
    const t1 = ensure(team1Id!);
    const t2 = ensure(team2Id!);
    const o = lbMatchOutcome(halves);
    t1.goalsFor += o.team1Goals;
    t1.goalsAgainst += o.team2Goals;
    t2.goalsFor += o.team2Goals;
    t2.goalsAgainst += o.team1Goals;
    if (!o.complete) continue;

    t1.matchesPlayed += 1;
    t2.matchesPlayed += 1;
    if (o.winner === 1) {
      t1.wins += 1;
      t1.points += roundMultiplier;
      t2.losses += 1;
    } else if (o.winner === 2) {
      t2.wins += 1;
      t2.points += roundMultiplier;
      t1.losses += 1;
    } else {
      t1.ties += 1;
      t2.ties += 1;
      t1.points += 0.5 * roundMultiplier;
      t2.points += 0.5 * roundMultiplier;
    }
  }
  return stats;
}

/** Folds standings adjustments into points, creating an entry for a team with no matches yet. */
export function applyLbTeamAdjustments(
  stats: Map<string, LbTeamStats>,
  adjustments: { teamId: string; points: number }[],
): void {
  for (const a of adjustments) {
    if (!stats.has(a.teamId)) stats.set(a.teamId, emptyLbTeamStats());
    const t = stats.get(a.teamId)!;
    t.points += a.points;
    t.adjustmentPoints += a.points;
  }
}

/**
 * Sorts standings in place: points, then goal difference, then goals for, then points taken in
 * the complete matches among the teams still tied (head to head), then name.
 */
export function sortLbStandings<T extends LbTeamStats & { teamId: string; teamName: string }>(
  teams: T[],
  rows: LbStandingsHalfRow[],
): T[] {
  const key = (t: T) => [t.points, t.goalsFor - t.goalsAgainst, t.goalsFor].join("|");
  const groups = new Map<string, T[]>();
  for (const t of teams) groups.set(key(t), [...(groups.get(key(t)) ?? []), t]);

  const headToHead = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ids = new Set(group.map((t) => t.teamId));
    const mini = computeLbTeamStats(
      rows.filter((r) => r.team1Id && r.team2Id && ids.has(r.team1Id) && ids.has(r.team2Id)),
    );
    for (const id of ids) headToHead.set(id, mini.get(id)?.points ?? 0);
  }

  return teams.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      (headToHead.get(b.teamId) ?? 0) - (headToHead.get(a.teamId) ?? 0) ||
      a.teamName.localeCompare(b.teamName),
  );
}
