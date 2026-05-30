import { notFound } from "next/navigation"
import { getGameDetailBySlug, getTagsByCenter, isFavorite } from "@lfstats/db"
import { auth } from "@/auth"
import { Badge } from "@/components/ui/badge"
import {
  formatScore,
  formatGameName,
  formatDateTime,
  formatMs,
} from "@/lib/format"
import { getTeamColor } from "@/lib/team-colors"
import { TeamStatsTable } from "@/components/games/TeamStatsTable"
import { DeleteGameButton } from "@/components/games/DeleteGameButton"
import { ExcludeToggleButton } from "@/components/games/ExcludeToggleButton"
import { GameTagManager } from "@/components/games/GameTagManager"
import { FavoriteButton } from "@/components/games/FavoriteButton"
import {
  toggleExcludeAction,
  assignTagAction,
  removeTagAction,
  addFavoriteAction,
  removeFavoriteAction,
} from "./actions"

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [game, session] = await Promise.all([getGameDetailBySlug(slug), auth()])

  if (!game) notFound()

  const roles = session?.user.roles ?? []
  const canDelete = roles.some(
    (r) =>
      r.role === "admin" ||
      (r.role === "centerAdmin" && r.centerId === game.centerId),
  )

  const [centerTags, favorited] = await Promise.all([
    canDelete ? getTagsByCenter(game.centerId) : Promise.resolve([]),
    session?.user?.id ? isFavorite(session.user.id, game.id) : Promise.resolve(false),
  ])

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {formatGameName(game.description, game.startTime)}
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
          {game.centerName} · {formatDateTime(game.startTime)} · {formatMs(game.actualDuration)}
        </p>
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
          <GameTagManager
            gameId={game.id}
            tags={game.tags}
            availableTags={centerTags}
            assignAction={assignTagAction}
            removeAction={removeTagAction}
          />
        )}
      </div>

      {game.teams.map((team) => {
        const color = getTeamColor(team.colourEnum)
        const baseScore = team.score ?? 0
        const elimBonus = team.eliminationBonus ?? 0
        const totalScore = baseScore + elimBonus

        return (
          <section key={team.id} className="space-y-0">
            <div
              className={`flex items-center justify-between px-4 py-2 border-l-4 ${color?.border ?? "border-border"} bg-muted/40 rounded-tr-md`}
            >
              <div className="flex items-center gap-2">
                <span className={`font-bold text-lg ${color?.text ?? ""}`}>
                  {team.name}
                </span>
                {team.result === "win" && (
                  <Badge variant="default">Win</Badge>
                )}
                {team.result === "loss" && (
                  <Badge variant="secondary">Loss</Badge>
                )}
                {team.eliminated && (
                  <Badge variant="destructive" className="text-xs px-1 py-0">ELIMINATED</Badge>
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
        )
      })}
    </div>
  )
}
