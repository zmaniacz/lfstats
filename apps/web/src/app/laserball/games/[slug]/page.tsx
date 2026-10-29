// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { cache } from "react";
import { auth } from "@/auth";
import { DeleteGameButton } from "@/components/games/DeleteGameButton";
import { EditModeToggle } from "@/components/games/EditModeToggle";
import { ExcludeToggleButton } from "@/components/games/ExcludeToggleButton";
import { LbMatchCombinedScoreboard } from "@/components/laserball/LbMatchCombinedScoreboard";
import { LbMatchDetailsDisclosure } from "@/components/laserball/LbMatchDetailsDisclosure";
import { LbGameCompetitionManager } from "@/components/laserball/LbGameCompetitionManager";
import { LbMatchManager } from "@/components/laserball/LbMatchManager";
import { haltCaveat, halfLabel } from "@/components/laserball/lb-match-shared";
import { LbMatchScorecards } from "@/components/laserball/LbMatchScorecards";
import { LbMatchSideSummary } from "@/components/laserball/LbMatchSideSummary";
import { LbPossessionBar } from "@/components/laserball/LbPossessionBar";
import { LbReplayTab } from "@/components/laserball/LbReplayTab";
import { LbTeamScoreboard } from "@/components/laserball/LbTeamScoreboard";
import { VideoManager } from "@/components/games/VideoManager";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EDIT_MODE_COOKIE } from "@/lib/edit-mode";
import {
  formatDateTime,
  formatGameName,
  formatMatchName,
  formatMs,
  formatScore,
} from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import { getTdfArchiveUrl } from "@/lib/tdf";
import {
  getGameVideosForGames,
  getLbGameDetailBySlug,
  getLbMatchCandidateGames,
  getLbMatchDetail,
  getLbMatchGamesDetail,
  getLbMatchIdForGame,
  getLbGameCompetitionMatch,
  getLbGameCompetition,
  getOpenLbCompetitionMatches,
  getCompetitionsByState,
  getLbMatchRosterWarnings,
  type LbGameDetailTeam,
} from "@lfstats/db";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  addLbGameVideoAction,
  addLbMatchOvertimeAction,
  addLbGameToCompetitionAction,
  assignLbGameMatchAction,
  removeLbGameFromCompetitionAction,
  unassignLbGameMatchAction,
  linkLbMatchAction,
  removeLbGameVideoAction,
  updateLbGameVideoAction,
  removeLbMatchOvertimeAction,
  toggleExcludeAction,
  unlinkLbMatchAction,
} from "./actions";

const getGame = cache(getLbGameDetailBySlug);
const getMatchId = cache(getLbMatchIdForGame);
const getMatchDetail = cache(getLbMatchDetail);
const getCompetitionMatch = cache(getLbGameCompetitionMatch);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: "Game Not Found" };

  const matchId = await getMatchId(game.id);
  const [matchDetail, competitionMatch] = matchId
    ? await Promise.all([getMatchDetail(matchId), getCompetitionMatch(game.id)])
    : [null, null];
  const title =
    competitionMatch?.team1Name && competitionMatch.team2Name
      ? `${competitionMatch.team1Name} vs ${competitionMatch.team2Name} – ${competitionMatch.competitionName}`
      : matchDetail
        ? `${matchDetail.halves[0]!.side1.name} vs ${matchDetail.halves[0]!.side2.name} – Match`
        : `${formatGameName(game.description, game.startTime)} – ${game.centerName}`;

  return { title };
}

export default async function LaserballGameDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [game, session, cookieStore] = await Promise.all([getGame(slug), auth(), cookies()]);
  if (!game) notFound();

  const roles = session?.user.roles ?? [];
  const canManage = roles.some(
    (r) =>
      r.role === "superAdmin" ||
      r.role === "admin" ||
      (r.role === "centerAdmin" && r.centerId === game.centerId),
  );
  const editMode = cookieStore.get(EDIT_MODE_COOKIE)?.value === "true";
  const canEdit = canManage && editMode;

  const matchId = await getMatchId(game.id);
  const [matchDetail, rosterWarnings, candidateGames, competitionMatch] = await Promise.all([
    matchId ? getMatchDetail(matchId) : Promise.resolve(null),
    matchId ? getLbMatchRosterWarnings(matchId) : Promise.resolve([]),
    !matchId && canEdit ? getLbMatchCandidateGames(game.id) : Promise.resolve([]),
    matchId ? getCompetitionMatch(game.id) : Promise.resolve(null),
  ]);

  const half2GameId = matchDetail?.halves.find((h) => h.half === 2)?.gameId;
  // In a competition, Side 1 is always the match's team 1: label the sides with the teams.
  const sideNames: [string, string] | undefined =
    competitionMatch?.team1Name && competitionMatch.team2Name
      ? [competitionMatch.team1Name, competitionMatch.team2Name]
      : undefined;

  const gameCompetition = canEdit ? await getLbGameCompetition(game.id) : null;
  const [availableCompetitions, openMatches] = await Promise.all([
    // Completed events too: correcting a finished tournament is the usual reason to be here.
    canEdit && !gameCompetition
      ? getCompetitionsByState(["active", "completed"], { order: "desc", gameType: "lb" })
      : Promise.resolve([]),
    gameCompetition && !competitionMatch
      ? getOpenLbCompetitionMatches(gameCompetition.competitionId)
      : Promise.resolve([]),
  ]);

  // A match renders as one page regardless of which half's slug was loaded, so
  // the Videos tab unions every game in the match (halves plus overtime).
  const matchGameIds = matchDetail?.halves.map((h) => h.gameId) ?? [game.id];

  // Overtime halves are added after the last half played, so offer games near it.
  const lastHalfGameId = matchDetail?.halves.at(-1)?.gameId;
  const [otCandidateGames, matchGamesDetail, videos] = await Promise.all([
    canEdit && half2GameId && lastHalfGameId
      ? getLbMatchCandidateGames(lastHalfGameId)
      : Promise.resolve([]),
    matchId
      ? getLbMatchGamesDetail(matchId)
      : Promise.resolve(new Map<string, LbGameDetailTeam[]>()),
    getGameVideosForGames(matchGameIds),
  ]);

  // Winning team first; draws keep tdf order.
  const teams = [...game.teams].sort((a, b) =>
    a.result === "win" ? -1 : b.result === "win" ? 1 : 0,
  );

  const possessionTeams = teams.map((t) => ({
    name: t.name,
    colourEnum: t.colourEnum,
    possessionMs: t.players.reduce((sum, p) => sum + p.possessionTimeMs, 0),
  }));

  const replayDuration = matchDetail
    ? matchDetail.halves.reduce((sum, h) => sum + h.actualDuration, 0)
    : game.actualDuration;

  // Labels each video with the half it belongs to when viewing a linked match.
  const gameLabels = matchDetail
    ? new Map(matchDetail.halves.map((h) => [h.gameId, halfLabel(h.half)]))
    : undefined;

  // New videos attach to the half currently being viewed, so the POV picker
  // offers that game's roster. Guests have no player row and are excluded.
  const videoRoster = teams
    .flatMap((t) => t.players)
    .filter((p) => p.playerId !== null)
    .map((p) => ({ playerId: p.playerId!, callsign: p.callsign }));

  const showVideosTab = videos.length > 0 || canManage;

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        {competitionMatch && (
          <Link
            href={`/standings?game=lb&scope=competition&competition=${competitionMatch.competitionSlug}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            {competitionMatch.competitionName} · {competitionMatch.roundName} · Match{" "}
            {competitionMatch.matchNumber} · {competitionMatch.team1Name ?? "TBD"} vs{" "}
            {competitionMatch.team2Name ?? "TBD"}
          </Link>
        )}
        <h1 className="text-2xl font-bold">
          {matchDetail
            ? formatMatchName(matchDetail.halves[0]!.gameStartTime)
            : formatGameName(game.description, game.startTime)}
        </h1>
        {matchDetail ? (
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <span>{game.centerName}</span>
            {matchDetail.halves.map((h) => {
              const caveat = haltCaveat(h.gameOutcome, h.gameExcluded);
              return (
                <span key={h.gameId} className="flex items-center gap-1.5">
                  {h.half > 2 ? (
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      {halfLabel(h.half)}
                    </Badge>
                  ) : (
                    `${halfLabel(h.half)}:`
                  )}{" "}
                  {formatDateTime(h.gameStartTime)}
                  {caveat && (
                    <Badge variant="destructive" className="text-xs px-1 py-0">
                      {caveat}
                    </Badge>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {game.centerName} · {formatDateTime(game.startTime)} · {formatMs(game.actualDuration)}
          </p>
        )}
        <p className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          {(matchDetail
            ? matchDetail.halves.map((h) => ({
                key: h.gameId,
                label: halfLabel(h.half),
                tdfFilename: h.tdfFilename,
              }))
            : [{ key: game.id, label: null, tdfFilename: game.tdfFilename }]
          ).map(({ key, label, tdfFilename }) => (
            <span key={key}>
              {label && `${label}: `}
              <a
                href={getTdfArchiveUrl(tdfFilename)}
                className="hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tdfFilename}
              </a>
            </span>
          ))}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {game.exclude && <Badge variant="destructive">Excluded from Stats</Badge>}
        </div>
        {canManage && <EditModeToggle editMode={editMode} />}
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <DeleteGameButton gameId={game.id} />
            <ExcludeToggleButton
              gameId={game.id}
              excluded={game.exclude}
              action={toggleExcludeAction}
            />
          </div>
        )}
        {canEdit && (
          <LbGameCompetitionManager
            gameId={game.id}
            competition={gameCompetition}
            availableCompetitions={availableCompetitions}
            assignment={competitionMatch}
            openMatches={openMatches}
            gameTeams={teams.map((t) => ({
              id: t.id,
              name: t.name,
              colourEnum: t.colourEnum,
              callsigns: t.players.map((p) => p.callsign),
            }))}
            side1GameTeamId={
              matchDetail?.halves.find((h) => h.gameId === game.id)?.side1.gameTeamId ?? null
            }
            addToCompetitionAction={addLbGameToCompetitionAction}
            removeFromCompetitionAction={removeLbGameFromCompetitionAction}
            assignAction={assignLbGameMatchAction}
            unassignAction={unassignLbGameMatchAction}
          />
        )}
        {canEdit && (
          <LbMatchManager
            gameId={game.id}
            gameTeams={teams.map((t) => ({
              id: t.id,
              name: t.name,
              colourEnum: t.colourEnum,
              callsigns: t.players.map((p) => p.callsign),
            }))}
            sideNames={sideNames}
            matchDetail={matchDetail}
            rosterWarnings={rosterWarnings}
            candidateGames={candidateGames}
            otCandidateGames={otCandidateGames}
            linkAction={linkLbMatchAction}
            unlinkAction={unlinkLbMatchAction}
            addOvertimeAction={addLbMatchOvertimeAction}
            removeOvertimeAction={removeLbMatchOvertimeAction}
          />
        )}
      </div>

      <Tabs defaultValue="scoreboard">
        <TabsList>
          <TabsTrigger value="scoreboard">Scoreboard</TabsTrigger>
          <TabsTrigger value="replay">Replay</TabsTrigger>
          {showVideosTab && <TabsTrigger value="videos">Videos</TabsTrigger>}
        </TabsList>
        <TabsContent value="scoreboard" className="mt-6 space-y-8">
          {matchDetail ? (
            <>
              <LbMatchSideSummary matchDetail={matchDetail} sideNames={sideNames} />
              <LbMatchCombinedScoreboard
                matchDetail={matchDetail}
                gamesById={matchGamesDetail}
                sideNames={sideNames}
              />
              <LbMatchDetailsDisclosure>
                <LbMatchScorecards
                  matchDetail={matchDetail}
                  gamesById={matchGamesDetail}
                  sideNames={sideNames}
                />
              </LbMatchDetailsDisclosure>
            </>
          ) : (
            <>
              {teams.map((team) => {
                const color = getTeamColor(team.colourEnum);
                return (
                  <section key={team.id} className="space-y-0">
                    <div
                      className={`flex items-center justify-between px-4 py-2 border-l-4 ${color?.border ?? "border-border"} bg-muted/40 rounded-tr-md`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-lg ${color?.text ?? ""}`}>
                          {team.name}
                        </span>
                        {team.result === "win" && <Badge variant="default">Win</Badge>}
                        {team.result === "loss" && <Badge variant="secondary">Loss</Badge>}
                        {team.result === "draw" && <Badge variant="secondary">Draw</Badge>}
                      </div>
                      <span className="tabular-nums font-semibold">
                        {formatScore(team.score ?? 0)}
                      </span>
                    </div>
                    <LbTeamScoreboard team={team} />
                  </section>
                );
              })}
              <section className="space-y-1.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Possession
                </h2>
                <LbPossessionBar teams={possessionTeams} />
              </section>
            </>
          )}
        </TabsContent>
        <TabsContent value="replay" className="mt-6">
          {matchDetail ? (
            <LbReplayTab
              mode="match"
              matchId={matchDetail.id}
              duration={replayDuration}
              sideNames={sideNames}
            />
          ) : (
            <LbReplayTab mode="game" gameId={game.id} duration={replayDuration} />
          )}
        </TabsContent>
        {showVideosTab && (
          <TabsContent value="videos" className="mt-6">
            <VideoManager
              gameId={game.id}
              videos={videos}
              roster={videoRoster}
              canEdit={canEdit}
              addAction={addLbGameVideoAction}
              removeAction={removeLbGameVideoAction}
              updateAction={updateLbGameVideoAction}
              gameLabels={gameLabels}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
