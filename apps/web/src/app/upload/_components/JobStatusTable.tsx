// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import * as React from "react";
import { getJobStatusesAction } from "../actions";

type JobRow = Awaited<ReturnType<typeof getJobStatusesAction>>[number];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  processing: "outline",
  completed: "default",
  failed: "destructive",
  skipped: "secondary",
};

function formatTs(ts: Date | null) {
  if (!ts) return "—";
  return format(ts, "MMM d, yyyy HH:mm:ss");
}

interface JobStatusTableProps {
  s3Keys: string[];
}

export function JobStatusTable({ s3Keys }: JobStatusTableProps) {
  const [jobs, setJobs] = React.useState<JobRow[]>([]);
  const [allDone, setAllDone] = React.useState(false);

  React.useEffect(() => {
    if (s3Keys.length === 0) return;

    async function poll() {
      const rows = await getJobStatusesAction(s3Keys);
      setJobs(rows);
      return rows;
    }

    poll();

    const id = setInterval(async () => {
      const rows = await poll();
      const done = s3Keys.every((key) => rows.find((r) => r.s3Key === key)?.completedAt != null);
      if (done) {
        setAllDone(true);
        clearInterval(id);
      }
    }, 2500);

    return () => clearInterval(id);
  }, [s3Keys]);

  const jobsByKey = new Map(jobs.map((j) => [j.s3Key, j]));
  const completedCount = s3Keys.filter((key) => jobsByKey.get(key)?.completedAt != null).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Import Status</h2>
        <Badge variant={allDone ? "default" : "outline"}>
          {allDone ? "Complete" : "Processing"}
        </Badge>
        <span className="text-muted-foreground font-normal">
          {completedCount} / {s3Keys.length}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filename</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Skip Reason</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>
              <span>Completed </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {s3Keys.map((key) => {
            const job = jobsByKey.get(key) ?? null;
            const status = job?.status ?? "pending";
            return (
              <TableRow key={key}>
                <TableCell className="font-mono text-xs break-all">{key}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {job?.skipReason ?? "—"}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatTs(job?.startedAt ?? null)}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatTs(job?.completedAt ?? null)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
