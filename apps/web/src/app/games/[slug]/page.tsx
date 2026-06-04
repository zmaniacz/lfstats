import { auth } from "@/auth";
import { DeleteGameButton } from "@/components/games/DeleteGameButton";
import { ExcludeToggleButton } from "@/components/games/ExcludeToggleButton";
import { FavoriteButton } from "@/components/games/FavoriteButton";
import { GameCompetitionManager } from "@/components/games/GameCompetitionManager";
import { GameTabs } from "@/components/games/GameTabs";
import { GameTagManager } from "@/components/games/GameTagManager";
import { TeamStatsTable } from "@/components/games/TeamStatsTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatDateTime,
  formatGameName,
  formatMs,
  formatScore,
} from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import {
  getAvailableMatchesForGame,
  getCompetitionGameNavigation,
  getCompetitions,
  getGameDetailBySlug,
  getGameMatchAssignment,
  getTagsByCenter,
  isFavorite,
} from "@lfstats/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addFavoriteAction,
  addGameToCompetitionAction,
  assignGameToMatchAction,
  assignTagAction,
  removeFavoriteAction,
  removeGameFromCompetitionAction,
  removeGameFromMatchAction,
  removeTagAction,
  toggleExcludeAction,
} from "./actions";

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [game, session] = await Promise.all([
    getGameDetailBySlug(slug),
    auth(),
  ]);

  if (!game) notFound();

  const roles = session?.user.roles ?? [];
  const canDelete = roles.some(
    (r) =>
      r.role === "superAdmin" ||
      r.role === "admin" ||
      (r.role === "centerAdmin" && r.centerId === game.centerId),
  );

  const [
    centerTags,
    favorited,
    availableCompetitions,
    availableMatches,
    matchAssignment,
    gameNav,
  ] = await Promise.all([
    canDelete ? getTagsByCenter(game.centerId) : Promise.resolve([]),
    session?.user?.id
      ? isFavorite(session.user.id, game.id)
      : Promise.resolve(false),
    canDelete ? getCompetitions() : Promise.resolve([]),
    canDelete && game.competitionId
      ? getAvailableMatchesForGame(game.competitionId)
      : Promise.resolve([]),
    getGameMatchAssignment(game.id),
    game.competitionId
      ? getCompetitionGameNavigation(game.competitionId, game.id)
      : Promise.resolve(null),
  ]);

  const displayTeams = matchAssignment
    ? game.teams.map((t) => ({
        ...t,
        name:
          t.id === matchAssignment.team1GameTeamId
            ? matchAssignment.team1Name
            : t.id === matchAssignment.team2GameTeamId
              ? matchAssignment.team2Name
              : t.name,
      }))
    : game.teams;

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        {game.competitionName && (
          <p className="text-sm font-medium text-muted-foreground">
            {game.competitionName}
          </p>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {matchAssignment
              ? `${matchAssignment.roundName} · Match ${matchAssignment.matchNumber} · Game ${matchAssignment.gameNumber} · ${displayTeams.map((t) => t.name).join(" vs ")}`
              : formatGameName(game.description, game.startTime)}
          </h1>
          {session?.user && (
            <FavoriteButton
              gameId={game.id}
              isFavorited={favorited}
              addAction={addFavoriteAction}
              removeAction={removeFavoriteAction}
            />
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {game.centerName} · {formatDateTime(game.startTime)} ·{" "}
          {formatMs(game.actualDuration)}
        </p>
        <p className="text-muted-foreground text-sm">
          <a
            href={`https://lfstats-modern-archive.s3.us-west-1.amazonaws.com/${game.tdfFilename}`}
            className="hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {game.tdfFilename}
          </a>
        </p>
        {game.outcome === "aborted" && (
          <Badge variant="destructive">Aborted</Badge>
        )}
        {game.exclude && (
          <Badge variant="destructive">Excluded from Stats</Badge>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {canDelete && (
            <>
              <DeleteGameButton gameId={game.id} />
              <ExcludeToggleButton
                gameId={game.id}
                excluded={game.exclude}
                action={toggleExcludeAction}
              />
            </>
          )}
        </div>
        {canDelete && (
          <GameCompetitionManager
            gameId={game.id}
            gameTeams={displayTeams.map((t) => ({
              id: t.id,
              name: t.name,
              colourEnum: t.colourEnum,
            }))}
            competitionId={game.competitionId}
            competitionName={game.competitionName}
            matchAssignment={matchAssignment}
            availableCompetitions={availableCompetitions}
            availableMatches={availableMatches}
            addToCompetitionAction={addGameToCompetitionAction}
            removeFromCompetitionAction={removeGameFromCompetitionAction}
            assignToMatchAction={assignGameToMatchAction}
            removeFromMatchAction={removeGameFromMatchAction}
          />
        )}
        {gameNav && (
          <div className="flex items-center gap-2">
            {gameNav.prevSlug ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/games/${gameNav.prevSlug}`}>← Previous</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                ← Previous
              </Button>
            )}
            <span className="text-sm text-muted-foreground tabular-nums">
              {gameNav.position} / {gameNav.total}
            </span>
            {gameNav.nextSlug ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/games/${gameNav.nextSlug}`}>Next →</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next →
              </Button>
            )}
          </div>
        )}
        {canDelete && (
          <GameTagManager
            gameId={game.id}
            tags={game.tags}
            availableTags={centerTags}
            assignAction={assignTagAction}
            removeAction={removeTagAction}
          />
        )}
      </div>

      <GameTabs
        gameId={game.id}
        duration={game.actualDuration}
        scoreboardContent={
          <>
            {displayTeams.map((team) => {
              const color = getTeamColor(team.colourEnum);
              const baseScore = team.score ?? 0;
              const elimBonus = team.eliminationBonus ?? 0;
              const totalScore = baseScore + elimBonus;

              return (
                <section key={team.id} className="space-y-0">
                  <div
                    className={`flex items-center justify-between px-4 py-2 border-l-4 ${color?.border ?? "border-border"} bg-muted/40 rounded-tr-md`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold text-lg ${color?.text ?? ""}`}
                      >
                        {team.name}
                      </span>
                      {team.result === "win" && (
                        <Badge variant="default">Win</Badge>
                      )}
                      {team.result === "loss" && (
                        <Badge variant="secondary">Loss</Badge>
                      )}
                      {team.eliminated && (
                        <Badge
                          variant="destructive"
                          className="text-xs px-1 py-0"
                        >
                          ELIMINATED
                        </Badge>
                      )}
                      {team.result === "draw" && (
                        <Badge variant="secondary">Draw</Badge>
                      )}
                    </div>
                    <span className="tabular-nums font-semibold">
                      {formatScore(totalScore)}
                      {elimBonus > 0 && (
                        <span className="text-muted-foreground font-normal ml-1">
                          ({formatScore(elimBonus)})
                        </span>
                      )}
                    </span>
                  </div>

                  <TeamStatsTable team={team} />
                </section>
              );
            })}
          </>
        }
      />
    </div>
  );
}
