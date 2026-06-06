// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { DualStatLeaderboardCard } from "@/components/competitions/DualStatLeaderboardCard";
import { PositionLeaderboardCard } from "@/components/competitions/PositionLeaderboardCard";
import { StatLeaderboardCard } from "@/components/competitions/StatLeaderboardCard";
import {
  getCompetitionGamesPlayed,
  getCompetitionMedicTomfoolery,
  getCompetitionMissileMalarkey,
  getCompetitionNukeNonsense,
  getCompetitionPositionScorecards,
  getCompetitionTotalScore,
  getCompetitionTotalTime,
  getCompetitiveCompetitions,
} from "@lfstats/db";
import { notFound } from "next/navigation";
import { CompetitionSelector } from "../standings/CompetitionSelector";
import { LeaderBoardsFilters } from "./LeaderBoardsFilters";

export default async function LeaderBoardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    competition?: string;
    pool?: string;
    finals?: string;
    mercs?: string;
  }>;
}) {
  const {
    competition: competitionId,
    pool,
    finals,
    mercs,
  } = await searchParams;

  const showPool = pool !== "0";
  const showFinals = finals === "1";
  const showMercs = mercs === "1";

  const competitions = await getCompetitiveCompetitions();

  if (competitions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Leader (Loser) Boards</h2>
        <p className="text-muted-foreground text-sm">
          No competitive competitions found.
        </p>
      </div>
    );
  }

  const activeId = competitionId ?? competitions[0].id;
  const activeComp = competitions.find((c) => c.id === activeId);
  if (!activeComp) notFound();

  const options = { showPool, showFinals, showMercs };
  const [
    commanders,
    heavyPlayers,
    scoutPlayers,
    ammoPlayers,
    medicPlayers,
    gamesPlayed,
    totalScore,
    totalTime,
    medicTomfoolery,
    missileMalarkey,
    nukeNonsense,
  ] = await Promise.all([
    getCompetitionPositionScorecards(activeId, 1, options),
    getCompetitionPositionScorecards(activeId, 2, options),
    getCompetitionPositionScorecards(activeId, 3, options),
    getCompetitionPositionScorecards(activeId, 4, options),
    getCompetitionPositionScorecards(activeId, 5, options),
    getCompetitionGamesPlayed(activeId, options),
    getCompetitionTotalScore(activeId, options),
    getCompetitionTotalTime(activeId, options),
    getCompetitionMedicTomfoolery(activeId, options),
    getCompetitionMissileMalarkey(activeId, options),
    getCompetitionNukeNonsense(activeId, options),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Leader (Loser) Boards</h2>
        <CompetitionSelector
          competitions={competitions}
          activeId={activeId}
          activeParamBase="/competitions/leader-boards"
        />
      </div>

      <LeaderBoardsFilters
        showPool={showPool}
        showFinals={showFinals}
        showMercs={showMercs}
        competitionId={activeId}
      />

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Positions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <PositionLeaderboardCard title="Commander" scorecards={commanders} />
          <PositionLeaderboardCard
            title="Heavy Weapons"
            scorecards={heavyPlayers}
          />
          <PositionLeaderboardCard title="Scout" scorecards={scoutPlayers} />
          <PositionLeaderboardCard
            title="Ammo Carrier"
            scorecards={ammoPlayers}
          />
          <PositionLeaderboardCard title="Medic" scorecards={medicPlayers} />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Games and Points</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatLeaderboardCard
            title="Total Games Played"
            colLabel="Games"
            rows={gamesPlayed.map((r) => ({ ...r, value: r.totalGames }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Total Score"
            colLabel="Score"
            rows={totalScore.map((r) => ({ ...r, value: r.totalScore }))}
            format="score"
          />
          <StatLeaderboardCard
            title="Total Time Played"
            colLabel="Time"
            rows={totalTime.map((r) => ({ ...r, value: r.totalTimeMs }))}
            format="duration"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Medic Tomfoolery</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatLeaderboardCard
            title="Total Medic Hits"
            colLabel="Medic Hits"
            rows={[...medicTomfoolery]
              .filter((r) => r.totalMedicHits > 0)
              .sort((a, b) => b.totalMedicHits - a.totalMedicHits)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.totalMedicHits }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Own Medic Hits (ouch)"
            colLabel="Own Medic Hits"
            rows={[...medicTomfoolery]
              .filter((r) => r.ownMedicHits > 0)
              .sort((a, b) => b.ownMedicHits - a.ownMedicHits)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.ownMedicHits }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Medic on Medic Hits (i thought we were familia)"
            colLabel="Medic Hits"
            rows={[...medicTomfoolery]
              .filter((r) => r.medicOnMedicHits > 0)
              .sort((a, b) => b.medicOnMedicHits - a.medicOnMedicHits)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.medicOnMedicHits }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Medic Kills (oh the humanity)"
            colLabel="Medic Kills"
            rows={[...medicTomfoolery]
              .filter((r) => r.medicKills > 0)
              .sort((a, b) => b.medicKills - a.medicKills)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.medicKills }))}
            format="integer"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Missile Malarkey</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DualStatLeaderboardCard
            title="Total Missiles"
            col1Label="Total"
            col2Label="Avg"
            rows={[...missileMalarkey]
              .filter((r) => r.totalMissiles > 0)
              .sort((a, b) => b.totalMissiles - a.totalMissiles)
              .slice(0, 100)
              .map((r) => ({
                ...r,
                value1: r.totalMissiles,
                value2: r.avgMissiles,
              }))}
            format1="integer"
            format2="decimal"
          />
          <StatLeaderboardCard
            title="Total Times Missiled (couldn't dodge a wrench)"
            colLabel="Times Missiled"
            rows={[...missileMalarkey]
              .filter((r) => r.timesHitByMissile > 0)
              .sort((a, b) => b.timesHitByMissile - a.timesHitByMissile)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.timesHitByMissile }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Total Team Missiles (you idiot)"
            colLabel="Team Missiles"
            rows={[...missileMalarkey]
              .filter((r) => r.teamMissiles > 0)
              .sort((a, b) => b.teamMissiles - a.teamMissiles)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.teamMissiles }))}
            format="integer"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Nuke Nonsense</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatLeaderboardCard
            title="Total Nukes Detonated"
            colLabel="Nukes"
            rows={[...nukeNonsense]
              .filter((r) => r.nukesDetonated > 0)
              .sort((a, b) => b.nukesDetonated - a.nukesDetonated)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.nukesDetonated }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Total Nukes Canceled"
            colLabel="Canceled"
            rows={[...nukeNonsense]
              .filter((r) => r.nukesCanceled > 0)
              .sort((a, b) => b.nukesCanceled - a.nukesCanceled)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.nukesCanceled }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Own Nukes Canceled (sorry DK)"
            colLabel="Own Canceled"
            rows={[...nukeNonsense]
              .filter((r) => r.teamNukesCanceled > 0)
              .sort((a, b) => b.teamNukesCanceled - a.teamNukesCanceled)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.teamNukesCanceled }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Nuke Timing"
            colLabel="Avg Activation"
            rows={[...nukeNonsense]
              .filter((r) => r.avgNukeActivationTime !== null)
              .sort(
                (a, b) =>
                  (b.avgNukeActivationTime ?? 0) -
                  (a.avgNukeActivationTime ?? 0),
              )
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.avgNukeActivationTime! }))}
            format="ms"
          />
          <StatLeaderboardCard
            title="Nuke Violence (shoulda jumped in the fridge)"
            colLabel="Lives Nuked"
            rows={[...nukeNonsense]
              .filter((r) => r.livesRemovedByNuke > 0)
              .sort((a, b) => b.livesRemovedByNuke - a.livesRemovedByNuke)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.livesRemovedByNuke }))}
            format="integer"
          />
        </div>
      </div>
    </div>
  );
}
