import { notFound } from "next/navigation"
import { auth } from "@/auth"
import {
  getCompetitiveCompetitions,
  getCompetitionPenalties,
} from "@lfstats/db"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { CompetitionSelector } from "../standings/CompetitionSelector"
import { CompetitionPenaltyTable } from "./CompetitionPenaltyTable"
import {
  updateCompetitionPenaltyAction,
  rescindCompetitionPenaltyAction,
  deleteCompetitionPenaltyAction,
} from "./actions"

export default async function CompetitionPenaltiesPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string }>
}) {
  const { competition: competitionId } = await searchParams

  const [competitions, session] = await Promise.all([
    getCompetitiveCompetitions(),
    auth(),
  ])

  if (competitions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Penalties</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    )
  }

  const activeId = competitionId ?? competitions[0].id
  const activeComp = competitions.find((c) => c.id === activeId)
  if (!activeComp) notFound()

  const roles = session?.user?.roles ?? []
  const canEdit = roles.some(
    (r) =>
      r.role === "superAdmin" ||
      r.role === "admin" ||
      r.role === "centerAdmin",
  )

  const penalties = await getCompetitionPenalties(activeId)

  const actions = {
    updateAction: updateCompetitionPenaltyAction,
    rescindAction: rescindCompetitionPenaltyAction,
    deleteAction: deleteCompetitionPenaltyAction,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Penalties</h2>
        <CompetitionSelector competitions={competitions} activeId={activeId} activeParamBase="/competitions/penalties" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{activeComp.name} · {penalties.length} {penalties.length === 1 ? "penalty" : "penalties"}</CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitionPenaltyTable
            competitionId={activeId}
            penalties={penalties}
            canEdit={canEdit}
            actions={actions}
          />
        </CardContent>
      </Card>
    </div>
  )
}
