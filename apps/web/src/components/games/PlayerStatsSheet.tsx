"use client"

import type { GameDetailPlayer, PenaltyRecord } from "@lfstats/db"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { formatPct, formatMs } from "@/lib/format"
import { getPosition } from "@/lib/positions"
import { PenaltyManager } from "@/components/games/PenaltyManager"

type PenaltyActions = React.ComponentProps<typeof PenaltyManager>["actions"]

type Props = {
  player: GameDetailPlayer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  gameId: string
  penalties: PenaltyRecord[]
  canEdit: boolean
  penaltyActions: PenaltyActions
}

const EM_DASH = "—"

function fmt(n: number | null): string {
  if (n === null) return EM_DASH
  return n.toLocaleString("en-US")
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  )
}

function StatSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

export function PlayerStatsSheet({ player, open, onOpenChange, gameId, penalties, canEdit, penaltyActions }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto" aria-describedby={undefined}>
        {player && (
          <>
            <SheetHeader className="pb-3 border-b mb-4">
              <div className="flex items-center gap-2">
                <SheetTitle>{player.callsign}</SheetTitle>
                <Badge variant="outline" className="text-xs font-normal">
                  {getPosition(player.position)?.label ?? `Pos ${player.position}`}
                </Badge>
              </div>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              <StatSection title="Shooting">
                <StatRow label="Fired" value={fmt(player.shotsFired)} />
                <StatRow
                  label="Hit"
                  value={`${fmt(player.shotsHit)} (${formatPct(player.accuracy)})`}
                />
                <StatRow label="vs Opponents" value={fmt(player.shotsHitOpponent)} />
                <StatRow label="vs 3-Hit Targets" value={fmt(player.shotsHitOpponent3hit)} />
                <StatRow label="vs Opp Medic" value={fmt(player.shotsHitOpponentMedic)} />
                <StatRow label="vs Team" value={fmt(player.shotsHitTeam)} />
                <StatRow label="vs Team Medic" value={fmt(player.shotsHitTeamMedic)} />
                <StatRow label="Times Hit" value={fmt(player.timesHit)} />
              </StatSection>

              <StatSection title="Missiles">
                <StatRow label="Fired & Hit" value={fmt(player.missileHits)} />
                <StatRow label="vs Opponents" value={fmt(player.missilesHitOpponent)} />
                <StatRow label="vs Opp Medic" value={fmt(player.missilesHitOpponentMedic)} />
                <StatRow label="vs Team" value={fmt(player.missilesHitTeam)} />
                <StatRow label="vs Team Medic" value={fmt(player.missilesHitTeamMedic)} />
                <StatRow label="Times Missiled" value={fmt(player.timesHitByMissile)} />
              </StatSection>

              <StatSection title="Combat">
                <StatRow label="Deactivated Opp" value={fmt(player.deactivatedOpponent)} />
                <StatRow label="Eliminated Opp" value={fmt(player.eliminatedOpponent)} />
                <StatRow label="Eliminated Opp Medic" value={fmt(player.eliminatedOpponentMedic)} />
                <StatRow label="Assists" value={fmt(player.assists)} />
                <StatRow label="Resets (opp)" value={fmt(player.resetOpponent)} />
                <StatRow label="Missile Resets (opp)" value={fmt(player.missileResetOpponent)} />
                <StatRow label="Nuke Cancels" value={fmt(player.nukesCanceled)} />
                <StatRow label="Team Deactivated" value={fmt(player.deactivatedTeam)} />
                <StatRow label="Team Eliminated" value={fmt(player.eliminatedTeam)} />
                <StatRow label="Eliminated Team Medic" value={fmt(player.eliminatedTeamMedic)} />
                <StatRow label="Resets (team)" value={fmt(player.resetTeam)} />
                <StatRow label="Missile Resets (team)" value={fmt(player.missileResetTeam)} />
                <StatRow label="Team Nuke Cancels" value={fmt(player.teamNukesCanceled)} />
              </StatSection>

              <StatSection title="Time">
                <StatRow label="Uptime" value={formatMs(player.uptime)} />
                <StatRow label="Resupply Downtime" value={formatMs(player.resupplyDowntime)} />
                <StatRow label="Other Downtime" value={formatMs(player.otherDowntime)} />
              </StatSection>

              <StatSection title="Resupplies">
                {(player.position === 4 || player.position === 5) && (
                  <>
                    <StatRow label="Given" value={fmt(player.resuppliesGiven)} />
                    <StatRow label="Double Given" value={fmt(player.doubleResuppliesGiven)} />
                    {player.position === 4 && (
                      <StatRow label="Team Ammo Boost" value={fmt(player.ammoBoost)} />
                    )}
                    {player.position === 5 && (
                      <StatRow label="Team Life Boost" value={fmt(player.lifeBoost)} />
                    )}
                  </>
                )}
                <StatRow label="Received Ammo" value={fmt(player.resuppliesReceivedAmmo)} />
                <StatRow label="Received Lives" value={fmt(player.resuppliesReceivedLives)} />
                <StatRow label="Double Received" value={fmt(player.doubleResuppliesReceived)} />
              </StatSection>

              {player.position !== 2 && (
                <StatSection title="SP">
                  <StatRow label="Earned" value={fmt(player.spEarned)} />
                  <StatRow label="Spent" value={fmt(player.spSpent)} />
                </StatSection>
              )}

              {player.position === 1 && (
                <StatSection title="Nukes">
                  <StatRow label="Activated" value={fmt(player.nukesActivated)} />
                  <StatRow label="Detonated" value={fmt(player.nukesDetonated)} />
                  <StatRow label="Medic Hits" value={fmt(player.nukesHitMedic)} />
                  <StatRow label="Lives Removed" value={fmt(player.livesRemovedByNuke)} />
                  <StatRow
                    label="Avg Activation Time"
                    value={formatMs(player.averageNukeActivationTime)}
                  />
                </StatSection>
              )}

              {player.position === 3 && (
                <StatSection title="Rapid Fire">
                  <StatRow label="Activations" value={fmt(player.rapidFire)} />
                  <StatRow label="Avg Duration" value={formatMs(player.averageRapidTime)} />
                  <StatRow label="Fired During" value={fmt(player.shotsFiredDuringRapid)} />
                  <StatRow label="Hit During" value={fmt(player.shotsHitDuringRapid)} />
                  <StatRow label="vs Opponents" value={fmt(player.shotsHitOpponentDuringRapid)} />
                  <StatRow label="vs Team" value={fmt(player.shotsHitTeamDuringRapid)} />
                  <StatRow label="Accuracy" value={formatPct(player.accuracyDuringRapid)} />
                </StatSection>
              )}

              <StatSection title="Misc">
                <StatRow label="Targets Destroyed" value={fmt(player.targetsDestroyed)} />
              </StatSection>

              <StatSection title="Penalties">
                <PenaltyManager
                  gameId={gameId}
                  scorecardId={player.id}
                  penalties={penalties}
                  canEdit={canEdit}
                  actions={penaltyActions}
                />
              </StatSection>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
