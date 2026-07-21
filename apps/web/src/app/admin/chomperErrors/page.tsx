// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { auth } from "@/auth";
import { getFailedChomperJobs } from "@lfstats/db";
import { redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArchiveAllButton, ArchiveButton } from "./archive-buttons";

export const metadata: Metadata = { title: "Admin: Chomper Errors" };

export default async function ChomperErrorsPage() {
  const session = await auth();
  if (!session) redirect("/");

  const roles = session.user.roles ?? [];
  const isAdminOrAbove = roles.some((r) => r.role === "superAdmin" || r.role === "admin");
  if (!isAdminOrAbove) redirect("/admin");

  const jobs = await getFailedChomperJobs();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Chomper Errors</h2>
        {jobs.length > 0 && <ArchiveAllButton />}
      </div>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No failed jobs.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>S3 Key</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Completed At</TableHead>
              <TableHead>Error Message</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-mono text-sm">{job.s3Key}</TableCell>
                <TableCell className="whitespace-nowrap text-sm capitalize">{job.status}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {job.startedAt.toLocaleString()}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {job.completedAt ? job.completedAt.toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
                    {job.errorMessage ?? "—"}
                  </pre>
                </TableCell>
                <TableCell className="text-right">
                  <ArchiveButton id={job.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
