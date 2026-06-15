// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { getPlayerOverallAverages } from "@lfstats/db";

export async function GET() {
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
