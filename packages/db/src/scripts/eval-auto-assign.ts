// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Measures ingest auto-assignment against the assignments admins already made. For every TDF
 * game assigned to a match in an SM5 team/trios/duos competition, it rebuilds what ingest would
 * have seen (its own slot and every later game hidden) and compares the decision with the real
 * slot. Read-only.
 *
 *   pnpm --filter @lfstats/db eval-auto-assign
 *   pnpm --filter @lfstats/db eval-auto-assign <competition-slug> [--verbose]
 *
 * "wrong" is the number that matters: every one is a game ingest would have put in the wrong
 * slot. "skipped" games just fall back to the unassigned queue, as every game does today.
 * "reversed" counts disagreements in matches whose recorded game 2 started before game 1:
 * ingest numbers games in the order they were played, so those differ by construction.
 */

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { initDb } from "../client";
import { competition, competitionMatch, competitionMatchGame, game } from "../schema";
import { replayAutoAssign } from "../queries/competition-auto-assign";

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const slug = args.find((a) => !a.startsWith("--"));
  const db = await initDb();

  const comps = await db
    .select({ id: competition.id, name: competition.name, slug: competition.slug })
    .from(competition)
    .where(
      and(
        eq(competition.gameType, "sm5"),
        inArray(competition.format, ["team", "trios", "duos"]),
        slug ? eq(competition.slug, slug) : undefined,
      ),
    )
    .orderBy(asc(competition.startDate));

  const totals = { correct: 0, wrong: 0, reversed: 0, skipped: 0 };
  const skipReasons = new Map<string, number>();

  for (const comp of comps) {
    // TDF games only: PDF-era games have no sm5_game_team and are never ingested again.
    const assigned = await db
      .select({
        gameId: competitionMatchGame.gameId,
        matchId: competitionMatchGame.matchId,
        gameNumber: competitionMatchGame.gameNumber,
        team1GameTeamId: competitionMatchGame.team1Sm5GameTeamId,
        tdfFilename: game.tdfFilename,
        startTime: game.startTime,
      })
      .from(competitionMatchGame)
      .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
      .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
      .where(
        and(
          eq(competitionMatch.competitionId, comp.id),
          isNotNull(competitionMatchGame.team1Sm5GameTeamId),
          eq(game.exclude, false),
        ),
      )
      .orderBy(asc(game.startTime));
    // Forfeit placeholders have no TDF and no players to match.
    const games = assigned.filter((g) => g.tdfFilename !== "");
    if (games.length === 0) continue;

    const startsByMatch = new Map<string, Map<number, number>>();
    for (const g of assigned) {
      const starts = startsByMatch.get(g.matchId) ?? new Map<number, number>();
      starts.set(g.gameNumber, g.startTime.getTime());
      startsByMatch.set(g.matchId, starts);
    }
    const reversedMatches = new Set(
      [...startsByMatch]
        .filter(([, s]) => s.has(1) && s.has(2) && s.get(2)! < s.get(1)!)
        .map(([matchId]) => matchId),
    );

    const counts = { correct: 0, wrong: 0, reversed: 0, skipped: 0 };
    for (const g of games) {
      const replay = await replayAutoAssign(g.gameId, comp.id);
      if (replay.status === "skipped") {
        counts.skipped++;
        skipReasons.set(replay.reason, (skipReasons.get(replay.reason) ?? 0) + 1);
        if (verbose) console.log(`    skip   ${g.tdfFilename}: ${replay.reason}`);
        continue;
      }
      const right =
        replay.matchId === g.matchId &&
        replay.gameNumber === g.gameNumber &&
        replay.team1GameTeamId === g.team1GameTeamId;
      if (right) {
        counts.correct++;
      } else if (reversedMatches.has(g.matchId) || reversedMatches.has(replay.matchId)) {
        counts.reversed++;
        if (verbose) console.log(`    rev    ${g.tdfFilename}`);
      } else {
        counts.wrong++;
        console.log(
          `    WRONG  ${g.tdfFilename}: chose match ${replay.matchId} game ${replay.gameNumber}, ` +
            `actually match ${g.matchId} game ${g.gameNumber}` +
            (replay.matchId === g.matchId && replay.gameNumber === g.gameNumber
              ? " (sides swapped)"
              : ""),
        );
      }
    }

    console.log(
      `${comp.name}: ${games.length} games — ${counts.correct} correct, ` +
        `${counts.wrong} wrong, ${counts.reversed} reversed, ${counts.skipped} skipped`,
    );
    totals.correct += counts.correct;
    totals.wrong += counts.wrong;
    totals.reversed += counts.reversed;
    totals.skipped += counts.skipped;
  }

  const total = totals.correct + totals.wrong + totals.reversed + totals.skipped;
  console.log(
    `\nTotal: ${total} games — ${totals.correct} correct, ${totals.wrong} wrong, ` +
      `${totals.reversed} reversed, ${totals.skipped} skipped`,
  );
  if (skipReasons.size > 0) {
    console.log("\nSkip reasons:");
    for (const [reason, n] of [...skipReasons].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(5)}  ${reason}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
