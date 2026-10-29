// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { LbPlayerAveragesTable } from "@/components/laserball/LbPlayerAveragesTable";
import { getLbPlayerAverages, type GameScopeFilter } from "@lfstats/db";

export async function LbPlayersContent({ scopeFilter }: { scopeFilter: GameScopeFilter }) {
  const players = await getLbPlayerAverages(scopeFilter);
  return <LbPlayerAveragesTable players={players} />;
}
