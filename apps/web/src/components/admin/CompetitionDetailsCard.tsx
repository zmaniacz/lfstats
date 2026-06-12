// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CompetitionForm } from "./CompetitionForm";
import type { CenterListItem, CompetitionDetail } from "@lfstats/db";

type Props = {
  competition: CompetitionDetail;
  centers: CenterListItem[];
  action: (formData: FormData) => Promise<void>;
};

export function CompetitionDetailsCard({ competition, centers, action }: Props) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Details</CardTitle>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Edit Details
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <CompetitionForm
            competition={competition}
            centers={centers}
            action={action}
            onCancel={() => setIsEditing(false)}
            onSaved={() => setIsEditing(false)}
          />
        ) : (
          <p className="text-sm font-medium">{competition.name}</p>
        )}
      </CardContent>
    </Card>
  );
}
