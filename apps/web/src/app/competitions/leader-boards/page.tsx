// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { DualStatLeaderboardCard } from "@/components/competitions/DualStatLeaderboardCard";
import { PositionLeaderboardCard } from "@/components/competitions/PositionLeaderboardCard";
import { StatLeaderboardCard } from "@/components/competitions/StatLeaderboardCard";
import {
  getCompetitionGamesPlayed,
  getCompetitionMedicTomfoolery,
  getCompetitionMiscMischief,
  getCompetitionMissileMalarkey,
  getCompetitionNukeNonsense,
  getCompetitionPositionScorecards,
  getCompetitionTotalScore,
  getCompetitionTotalTime,
  getCompetitiveCompetitions,
} from "@lfstats/db";
import { CompetitionSelector } from "../standings/CompetitionSelector";
import { LeaderBoardsFilters } from "./LeaderBoardsFilters";
import { resolveActiveCompetition } from "@/lib/active-competition";

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
  const { competition: competitionSlug, pool, finals, mercs } = await searchParams;

  const showPool = pool !== "0";
  const showFinals = finals === "1";
  const showMercs = mercs === "1";

  const competitions = await getCompetitiveCompetitions();

  if (competitions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Leader (Loser) Boards</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    );
  }

  const activeComp = await resolveActiveCompetition(competitions, competitionSlug);
  const activeId = activeComp.id;

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
    miscMischief,
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
    getCompetitionMiscMischief(activeId, options),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Leader (Loser) Boards</h2>
        <CompetitionSelector
          competitions={competitions}
          activeSlug={activeComp.slug}
          activeParamBase="/competitions/leader-boards"
        />
      </div>

      <LeaderBoardsFilters
        showPool={showPool}
        showFinals={showFinals}
        showMercs={showMercs}
        competitionSlug={activeComp.slug}
      />

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Positions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <PositionLeaderboardCard title="Commander" scorecards={commanders} />
          <PositionLeaderboardCard title="Heavy Weapons" scorecards={heavyPlayers} />
          <PositionLeaderboardCard title="Scout" scorecards={scoutPlayers} />
          <PositionLeaderboardCard title="Ammo Carrier" scorecards={ammoPlayers} />
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
            title="Total Times Missiled"
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
            title="Nuke Timing (i say we take off blah blah blah)"
            colLabel="Avg Activation"
            rows={[...nukeNonsense]
              .filter((r) => r.avgNukeActivationTime !== null)
              .sort((a, b) => (b.avgNukeActivationTime ?? 0) - (a.avgNukeActivationTime ?? 0))
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.avgNukeActivationTime! }))}
            format="ms"
          />
          <StatLeaderboardCard
            title="Nuke Violence"
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

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Miscellaneous Mischief</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatLeaderboardCard
            title="Melted Gun"
            colLabel="Shots Fired"
            rows={[...miscMischief]
              .filter((r) => r.totalShotsFired > 0)
              .sort((a, b) => b.totalShotsFired - a.totalShotsFired)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.totalShotsFired }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="A Little Help From Your Friends"
            colLabel="Assists"
            rows={[...miscMischief]
              .filter((r) => r.totalAssists > 0)
              .sort((a, b) => b.totalAssists - a.totalAssists)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.totalAssists }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Problem Child"
            colLabel="Penalties"
            rows={[...miscMischief]
              .filter((r) => r.totalPenalties > 0)
              .sort((a, b) => b.totalPenalties - a.totalPenalties)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.totalPenalties }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Killer"
            colLabel="Eliminations"
            rows={[...miscMischief]
              .filter((r) => r.totalEliminations > 0)
              .sort((a, b) => b.totalEliminations - a.totalEliminations)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.totalEliminations }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Easy Targets"
            colLabel="Resets"
            rows={[...miscMischief]
              .filter((r) => r.totalResets > 0)
              .sort((a, b) => b.totalResets - a.totalResets)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.totalResets }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="For the Greater Good (Maybe)"
            colLabel="Team Resets"
            rows={[...miscMischief]
              .filter((r) => r.totalTeamResets > 0)
              .sort((a, b) => b.totalTeamResets - a.totalTeamResets)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.totalTeamResets }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Lazy"
            colLabel="Unused SP"
            rows={[...miscMischief]
              .filter((r) => r.unusedSp !== null && r.unusedSp > 0)
              .sort((a, b) => (b.unusedSp ?? 0) - (a.unusedSp ?? 0))
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.unusedSp! }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="I Said Lives, Not Shots"
            colLabel="Resupply Downtime"
            rows={[...miscMischief]
              .filter((r) => r.totalResupplyDowntimeMs > 0)
              .sort((a, b) => b.totalResupplyDowntimeMs - a.totalResupplyDowntimeMs)
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.totalResupplyDowntimeMs }))}
            format="duration"
          />
          <StatLeaderboardCard
            title="N*SYNC"
            colLabel="Double Resupplies"
            rows={[...miscMischief]
              .filter(
                (r) => r.totalDoubleResuppliesGiven !== null && r.totalDoubleResuppliesGiven > 0,
              )
              .sort(
                (a, b) => (b.totalDoubleResuppliesGiven ?? 0) - (a.totalDoubleResuppliesGiven ?? 0),
              )
              .slice(0, 100)
              .map((r) => ({ ...r, value: r.totalDoubleResuppliesGiven! }))}
            format="integer"
          />
        </div>
      </div>
    </div>
  );
}
