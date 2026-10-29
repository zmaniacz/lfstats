// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { getLbPlayerAverages, getPlayerOverallAverages } from "@lfstats/db";

export async function GET(request: Request) {
  const gameType = new URL(request.url).searchParams.get("game_type");
  if (gameType && gameType !== "sm5" && gameType !== "lb") {
    return NextResponse.json({ error: "game_type must be 'sm5' or 'lb'" }, { status: 400 });
  }

  if (gameType === "lb") {
    // Career averages: every game the player played, mercenary ones included.
    const lbPlayers = await getLbPlayerAverages({ scope: "all" }, { showMercs: true });
    return NextResponse.json({
      data: lbPlayers.map((p) => ({
        player_IPL_ID: p.iplId,
        player_name: p.callsign,
        games_won: p.wins,
        games_played: p.gamesPlayed,
        total_goals: p.totalGoals,
        avg_goals: p.avgGoals,
        avg_assists: p.avgAssists,
        avg_steals: p.avgSteals,
        avg_blocks: p.avgBlocks,
        avg_clears: p.avgClears,
        avg_passes: p.avgPasses,
        avg_possession_ms: p.avgPossessionMs,
      })),
    });
  }

  const players = await getPlayerOverallAverages();

  const data = players.map((p) => ({
    player_IPL_ID: p.playerIplId,
    player_name: p.playerName,
    avg_avg_mvp: p.avgAvgMvp,
    total_mvp: p.totalMvp,
    avg_avg_acc: p.avgAvgAcc,
    hit_diff: p.hitDiff,
    games_won: p.gamesWon,
    games_played: p.gamesPlayed,
    commander_avg_mvp: p.commanderAvgMvp,
    commander_avg_acc: p.commanderAvgAcc,
    commander_games_won: p.commanderGamesWon,
    commander_games_played: p.commanderGamesPlayed,
    heavy_avg_mvp: p.heavyAvgMvp,
    heavy_avg_acc: p.heavyAvgAcc,
    heavy_games_won: p.heavyGamesWon,
    heavy_games_played: p.heavyGamesPlayed,
    scout_avg_mvp: p.scoutAvgMvp,
    scout_avg_acc: p.scoutAvgAcc,
    scout_games_won: p.scoutGamesWon,
    scout_games_played: p.scoutGamesPlayed,
    ammo_avg_mvp: p.ammoAvgMvp,
    ammo_avg_acc: p.ammoAvgAcc,
    ammo_games_won: p.ammoGamesWon,
    ammo_games_played: p.ammoGamesPlayed,
    medic_avg_mvp: p.medicAvgMvp,
    medic_avg_acc: p.medicAvgAcc,
    medic_games_won: p.medicGamesWon,
    medic_games_played: p.medicGamesPlayed,
  }));

  return NextResponse.json({ data });
}
