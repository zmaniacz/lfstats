// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getPenalties, type GameScopeFilter } from "@lfstats/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CompetitionPenaltyTable } from "./CompetitionPenaltyTable";
import {
  updateCompetitionPenaltyAction,
  rescindCompetitionPenaltyAction,
  deleteCompetitionPenaltyAction,
} from "./actions";

export async function PenaltiesContent({
  scopeFilter,
  competitionId,
  canEdit,
  heading,
}: {
  scopeFilter: GameScopeFilter;
  competitionId: string;
  canEdit: boolean;
  heading: string;
}) {
  const penalties = await getPenalties(scopeFilter);

  const actions = {
    updateAction: updateCompetitionPenaltyAction,
    rescindAction: rescindCompetitionPenaltyAction,
    deleteAction: deleteCompetitionPenaltyAction,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {heading} · {penalties.length} {penalties.length === 1 ? "penalty" : "penalties"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CompetitionPenaltyTable
          competitionId={competitionId}
          penalties={penalties}
          canEdit={canEdit}
          actions={actions}
        />
      </CardContent>
    </Card>
  );
}
