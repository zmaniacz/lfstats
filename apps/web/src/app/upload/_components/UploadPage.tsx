// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import * as React from "react";
import { UploadZone } from "./UploadZone";
import { JobStatusTable } from "./JobStatusTable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UploadCompetitionOption } from "@lfstats/db";

type Props = {
  competitions: UploadCompetitionOption[];
};

export function UploadPage({ competitions }: Props) {
  const [uploadedKeys, setUploadedKeys] = React.useState<string[]>([]);
  const [mode, setMode] = React.useState<"social" | "competition">("social");
  const [competitionSlug, setCompetitionSlug] = React.useState<string | null>(null);

  const canUpload = mode === "social" || !!competitionSlug;

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-4">
        <div className="space-y-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(value) => {
              if (value === "social" || value === "competition") setMode(value);
            }}
          >
            <ToggleGroupItem value="social">Social</ToggleGroupItem>
            <ToggleGroupItem value="competition">Competition</ToggleGroupItem>
          </ToggleGroup>

          {mode === "competition" &&
            (competitions.length > 0 ? (
              <Select
                value={competitionSlug ?? undefined}
                onValueChange={(value) => setCompetitionSlug(value)}
              >
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Select a competition" />
                </SelectTrigger>
                <SelectContent>
                  {competitions.map((c) => (
                    <SelectItem key={c.id} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active competitions available for upload.
              </p>
            ))}
        </div>

        <UploadZone
          competitionSlug={mode === "competition" ? competitionSlug : null}
          canUpload={canUpload}
          onUploadComplete={(keys) => setUploadedKeys(keys)}
        />
      </div>
      {uploadedKeys.length > 0 && (
        <div className="rounded-lg border p-6">
          <JobStatusTable s3Keys={uploadedKeys} />
        </div>
      )}
    </div>
  );
}
