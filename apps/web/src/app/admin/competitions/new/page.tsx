// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { getCenterList } from "@lfstats/db";
import { CompetitionForm } from "@/components/admin/CompetitionForm";
import { createCompetitionAction } from "../actions";

export default async function NewCompetitionPage() {
  const centers = await getCenterList();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/competitions" className="text-sm text-muted-foreground hover:underline">
          ← Competitions
        </Link>
        <h2 className="text-xl font-semibold mt-1">New Competition</h2>
      </div>
      <CompetitionForm centers={centers} action={createCompetitionAction} />
    </div>
  );
}
