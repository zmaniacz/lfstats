// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Builds a Laserball tournament out of games that are already ingested, from a JSON manifest:
 * the competition, its teams and rosters, its rounds, and each match's halves. Written to turn
 * the first Syracuse tournament (data/lb-tournament-syracuse-2026.json) into a competition, and
 * reusable for any other event played before Laserball competitions existed.
 *
 * The manifest names players and games only; the script works out the rest:
 *
 * - **Side mapping.** For each half, the game team holding most of a team's rostered players is
 *   that team. A half whose teams can't be told apart that way stops the run.
 * - **Halves.** The two games are linked as an lb_match, the earlier as half 1. A link of
 *   exactly these games made earlier from the game page is reused, its sides re-set from the
 *   rosters. A game linked to some other game, or already in a competition, stops the run.
 * - **Mercenaries.** A player on a side who isn't rostered on that side's team is added to that
 *   team's roster as a mercenary, then every half's scorecards are stamped.
 * - **Unassigned games** are filed into the competition but put in no match — for sequences
 *   still being researched.
 *
 * Everything runs in one transaction. `--dry-run` does the whole build, prints the standings
 * inputs it produced, and rolls back.
 *
 *   pnpm --filter @lfstats/db create-lb-tournament src/scripts/data/lb-tournament-syracuse-2026.json --dry-run
 *   pnpm --filter @lfstats/db create-lb-tournament src/scripts/data/lb-tournament-syracuse-2026.json
 */

import { readFileSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { initDb } from "../client";
import {
  center,
  competition,
  competitionMatch,
  competitionRound,
  competitionTeam,
  competitionTeamPlayer,
  game,
  lbGameTeam,
  lbMatch,
  lbMatchGame,
  lbScorecard,
  player,
} from "../schema";
import { slugify } from "../lib/slug";
import { stampLbMercenaries } from "../queries/competition-laserball";
import { lbMatchOutcome } from "../lib/lb-match-points";

type ManifestMatch = {
  team1: string;
  team2: string;
  // Game slugs. Omit both to create the match slot with no halves yet.
  half1?: string;
  half2?: string;
  // Overtime halves, any number, each played after the last.
  overtime?: string[];
};

type Manifest = {
  name: string;
  slug: string;
  centerSlug: string; // e.g. "4-23"
  startDate: string;
  endDate: string;
  state: "preshow" | "upcoming" | "active" | "completed";
  description?: string;
  teams: { name: string; roster: string[] }[]; // roster: IPL ids
  rounds: { name: string; type: "pool" | "finals"; matches: ManifestMatch[] }[];
  unassignedGames: string[];
};

class DryRunRollback extends Error {}

function parseGameSlug(slug: string): { countryCode: number; siteCode: number; start: string } {
  const m = /^(\d+)-(\d+)-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(slug);
  if (!m) throw new Error(`Bad game slug: ${slug}`);
  const [, cc, sc, y, mo, d, h, mi, s] = m;
  return {
    countryCode: Number(cc),
    siteCode: Number(sc),
    start: `${y}-${mo}-${d} ${h}:${mi}:${s}`,
  };
}

async function main() {
  const manifestPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!manifestPath) throw new Error("Usage: create-lb-tournament <manifest.json> [--dry-run]");
  const dryRun = process.argv.includes("--dry-run");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  const db = await initDb();

  try {
    await db.transaction(async (tx) => {
      const [cc, sc] = manifest.centerSlug.split("-").map(Number);
      const [host] = await tx
        .select({ id: center.id })
        .from(center)
        .where(and(eq(center.countryCode, cc!), eq(center.siteCode, sc!)));
      if (!host) throw new Error(`No center ${manifest.centerSlug}`);

      // --- games ---
      const allSlugs = [
        ...manifest.rounds.flatMap((r) =>
          r.matches.flatMap((m) =>
            [m.half1, m.half2, ...(m.overtime ?? [])].filter((s) => s !== undefined),
          ),
        ),
        ...manifest.unassignedGames,
      ];
      if (new Set(allSlugs).size !== allSlugs.length) throw new Error("A game is listed twice");
      const gameIdBySlug = new Map<string, string>();
      for (const slug of allSlugs) {
        const { start } = parseGameSlug(slug);
        const [row] = await tx
          .select({ id: game.id, type: game.type, competitionId: game.competitionId })
          .from(game)
          .where(and(eq(game.centerId, host.id), sql`${game.startTime} = ${start}::timestamp`));
        if (!row) throw new Error(`Game not found: ${slug}`);
        if (row.type !== "lb") throw new Error(`Not a Laserball game: ${slug}`);
        if (row.competitionId) throw new Error(`Already in a competition: ${slug}`);
        gameIdBySlug.set(slug, row.id);
      }

      // --- competition ---
      const [comp] = await tx
        .insert(competition)
        .values({
          name: manifest.name,
          slug: manifest.slug,
          type: "competitive",
          gameType: "lb",
          format: "team",
          category: "tournament",
          state: manifest.state,
          hostCenterId: host.id,
          startDate: manifest.startDate,
          endDate: manifest.endDate,
          description: manifest.description ?? null,
        })
        .returning({ id: competition.id });
      await tx
        .update(game)
        .set({ competitionId: comp!.id })
        .where(inArray(game.id, [...gameIdBySlug.values()]));

      // --- teams and rosters ---
      const allIplIds = manifest.teams.flatMap((t) => t.roster);
      const players = await tx
        .select({ id: player.id, iplId: player.iplId })
        .from(player)
        .where(inArray(player.iplId, allIplIds));
      const playerIdByIpl = new Map(players.map((p) => [p.iplId, p.id]));
      const teamIdByName = new Map<string, string>();
      const rosterByTeam = new Map<string, Set<string>>(); // team id → player ids
      for (const t of manifest.teams) {
        const [row] = await tx
          .insert(competitionTeam)
          .values({ competitionId: comp!.id, name: t.name, slug: slugify(t.name, "team") })
          .returning({ id: competitionTeam.id });
        teamIdByName.set(t.name, row!.id);
        const ids = t.roster.map((ipl) => {
          const id = playerIdByIpl.get(ipl);
          if (!id) throw new Error(`No player with IPL id ${ipl}`);
          return id;
        });
        rosterByTeam.set(row!.id, new Set(ids));
        await tx
          .insert(competitionTeamPlayer)
          .values(ids.map((playerId) => ({ competitionTeamId: row!.id, playerId })));
      }
      const teamId = (name: string) => {
        const id = teamIdByName.get(name);
        if (!id) throw new Error(`Unknown team "${name}"`);
        return id;
      };

      // --- rounds, matches, halves ---
      const mercs = new Map<string, Set<string>>(); // team id → merc player ids
      const lbMatchIds: string[] = [];
      const report: string[] = [];

      for (const [ri, round] of manifest.rounds.entries()) {
        const [roundRow] = await tx
          .insert(competitionRound)
          .values({
            competitionId: comp!.id,
            name: round.name,
            roundNumber: ri + 1,
            type: round.type,
          })
          .returning({ id: competitionRound.id });

        for (const [mi, m] of round.matches.entries()) {
          const t1 = teamId(m.team1);
          const t2 = teamId(m.team2);
          const [matchRow] = await tx
            .insert(competitionMatch)
            .values({
              competitionId: comp!.id,
              roundId: roundRow!.id,
              matchNumber: mi + 1,
              team1Id: t1,
              team2Id: t2,
            })
            .returning({ id: competitionMatch.id });
          const label = `${round.name} #${mi + 1} ${m.team1} v ${m.team2}`;
          if (!m.half1 || !m.half2) {
            report.push(`${label}: no halves`);
            continue;
          }

          // Which game team each competition team played as, by roster majority.
          // Overtime halves are numbered 3, 4, ... below, by start time.
          const halves: (readonly [number, string])[] = [
            [1, m.half1],
            [2, m.half2],
            ...(m.overtime ?? []).map((slug) => [3, slug] as const),
          ];
          const sides: {
            half: number;
            slug: string;
            gameId: string;
            side1: string;
            side2: string;
          }[] = [];
          for (const [half, slug] of halves) {
            const gameId = gameIdBySlug.get(slug)!;
            const cards = await tx
              .select({ teamId: lbScorecard.teamId, playerId: lbScorecard.playerId })
              .from(lbScorecard)
              .innerJoin(lbGameTeam, eq(lbGameTeam.id, lbScorecard.teamId))
              .where(and(eq(lbScorecard.gameId, gameId), eq(lbGameTeam.isNeutral, false)));
            const gameTeams = [...new Set(cards.map((c) => c.teamId))];
            if (gameTeams.length !== 2) throw new Error(`${slug}: expected two teams`);
            const count = (gt: string, team: string) =>
              cards.filter(
                (c) => c.teamId === gt && c.playerId && rosterByTeam.get(team)!.has(c.playerId),
              ).length;
            const [a, b] = gameTeams as [string, string];
            const aIsTeam1 = count(a, t1) + count(b, t2) > count(b, t1) + count(a, t2);
            const side1 = aIsTeam1 ? a : b;
            const side2 = aIsTeam1 ? b : a;
            if (count(side1, t1) < 3 || count(side2, t2) < 3) {
              throw new Error(`${slug}: can't tell ${m.team1} from ${m.team2} by roster`);
            }
            sides.push({ half, slug, gameId, side1, side2 });
            // Anyone on a side who isn't on that team's roster subbed in for it.
            for (const [gt, team] of [
              [side1, t1],
              [side2, t2],
            ] as const) {
              for (const c of cards) {
                if (c.teamId !== gt || !c.playerId || rosterByTeam.get(team)!.has(c.playerId))
                  continue;
                mercs.set(team, (mercs.get(team) ?? new Set()).add(c.playerId));
              }
            }
          }

          // Reuse an existing link of exactly these games (made from the game page), re-siding
          // it from the rosters; refuse a game linked to anything else.
          const existing = await tx
            .select({ matchId: lbMatchGame.matchId, gameId: lbMatchGame.gameId })
            .from(lbMatchGame)
            .where(
              inArray(
                lbMatchGame.matchId,
                tx
                  .select({ id: lbMatchGame.matchId })
                  .from(lbMatchGame)
                  .where(
                    inArray(
                      lbMatchGame.gameId,
                      sides.map((h) => h.gameId),
                    ),
                  ),
              ),
            );
          const existingIds = [...new Set(existing.map((e) => e.matchId))];
          const sameGames =
            existingIds.length === 1 &&
            existing.length === sides.length &&
            existing.every((e) => sides.some((h) => h.gameId === e.gameId));
          if (existingIds.length > 0 && !sameGames) {
            throw new Error(`${label}: a game is already linked to a different pairing`);
          }
          let lb: { id: string };
          if (sameGames) {
            [lb] = await tx
              .update(lbMatch)
              .set({ competitionMatchId: matchRow!.id })
              .where(eq(lbMatch.id, existingIds[0]!))
              .returning({ id: lbMatch.id });
            await tx.delete(lbMatchGame).where(eq(lbMatchGame.matchId, lb.id));
          } else {
            [lb] = await tx
              .insert(lbMatch)
              .values({ linkedBy: "create-lb-tournament", competitionMatchId: matchRow!.id })
              .returning({ id: lbMatch.id });
          }
          // Halves follow start time within regulation and within overtime (a slug sorts
          // chronologically within one center), whatever order the manifest lists them in.
          const byTime = (list: typeof sides) =>
            [...list].sort((x, y) => x.slug.localeCompare(y.slug));
          const ordered = [
            ...byTime(sides.filter((h) => h.half < 3)).map((h, i) => ({ ...h, half: i + 1 })),
            ...byTime(sides.filter((h) => h.half >= 3)).map((h, i) => ({ ...h, half: i + 3 })),
          ];
          await tx.insert(lbMatchGame).values(
            ordered.map((h) => ({
              matchId: lb!.id,
              gameId: h.gameId,
              half: h.half,
              side1GameTeamId: h.side1,
              side2GameTeamId: h.side2,
            })),
          );
          lbMatchIds.push(lb!.id);

          const goals = await tx
            .select({
              half: lbMatchGame.half,
              team1Goals: sql<number>`(select coalesce(score, 0) from lb_game_team where id = ${lbMatchGame.side1GameTeamId})`,
              team2Goals: sql<number>`(select coalesce(score, 0) from lb_game_team where id = ${lbMatchGame.side2GameTeamId})`,
            })
            .from(lbMatchGame)
            .where(eq(lbMatchGame.matchId, lb!.id));
          const o = lbMatchOutcome(goals);
          const winner = o.winner === 1 ? m.team1 : o.winner === 2 ? m.team2 : "tie";
          report.push(
            `${label}${sameGames ? " [reused link]" : ""}: ${goals
              .sort((x, y) => x.half - y.half)
              .map((g) => `${g.team1Goals}-${g.team2Goals}`)
              .join(", ")} → ${o.team1Goals}-${o.team2Goals} ${winner}`,
          );
        }
      }

      // --- mercenaries ---
      const names = new Map(
        (
          await tx
            .select({ id: player.id, callsign: player.currentCallsign })
            .from(player)
            .where(inArray(player.id, [...new Set([...mercs.values()].flatMap((s) => [...s]))]))
        ).map((p) => [p.id, p.callsign]),
      );
      for (const [team, playerIds] of mercs) {
        await tx.insert(competitionTeamPlayer).values(
          [...playerIds].map((playerId) => ({
            competitionTeamId: team,
            playerId,
            isMercenary: true,
          })),
        );
        const teamName = [...teamIdByName].find(([, id]) => id === team)![0];
        report.push(`Merc on ${teamName}: ${[...playerIds].map((p) => names.get(p)).join(", ")}`);
      }
      for (const id of lbMatchIds) await stampLbMercenaries(tx, id);

      console.log(report.join("\n"));
      console.log(
        `\n${manifest.name}: ${manifest.teams.length} teams, ${lbMatchIds.length} matches with halves, ` +
          `${manifest.unassignedGames.length} unassigned games, ${gameIdBySlug.size} games filed.`,
      );
      if (dryRun) throw new DryRunRollback();
    });
    console.log("Committed.");
  } catch (e) {
    if (e instanceof DryRunRollback) console.log("Dry run — rolled back.");
    else throw e;
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
