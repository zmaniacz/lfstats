import { Suspense } from "react"
import {
  getCenterList,
  getPlayersLeaderboard,
  getPlayersMedicHitsLeaderboard,
} from "@lfstats/db"
import { CenterFilter } from "@/components/players/CenterFilter"
import { PlayersLeaderboardTable } from "@/components/players/PlayersLeaderboardTable"
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable"

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string }>
}) {
  const { center: centerId } = await searchParams

  const [
    centers,
    overall,
    commanders,
    heavyWeapons,
    scouts,
    ammoCarriers,
    medics,
    medicHits,
  ] = await Promise.all([
    getCenterList(),
    getPlayersLeaderboard({ centerId }),
    getPlayersLeaderboard({ centerId, position: 1 }),
    getPlayersLeaderboard({ centerId, position: 2 }),
    getPlayersLeaderboard({ centerId, position: 3 }),
    getPlayersLeaderboard({ centerId, position: 4 }),
    getPlayersLeaderboard({ centerId, position: 5 }),
    getPlayersMedicHitsLeaderboard({ centerId }),
  ])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Players</h1>
        <Suspense>
          <CenterFilter centers={centers} selected={centerId} />
        </Suspense>
      </div>

      <PlayersLeaderboardTable players={overall} title="Overall" />
      <PlayersLeaderboardTable players={commanders} title="Commander" />
      <PlayersLeaderboardTable players={heavyWeapons} title="Heavy Weapons" />
      <PlayersLeaderboardTable players={scouts} title="Scout" />
      <PlayersLeaderboardTable players={ammoCarriers} title="Ammo Carrier" />
      <PlayersLeaderboardTable players={medics} title="Medic" />
      <MedicHitsLeaderboardTable players={medicHits} />
    </div>
  )
}
