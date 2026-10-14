// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { describeRedirects } from "@/lib/oauth/describe-redirect";
import type { OAuthGrantListing } from "@lfstats/db";

export type RevokeGrantResult = { ok: true } | { ok: false; error: string };

type Props = {
  grants: OAuthGrantListing[];
  revokeAction: (familyId: string) => Promise<RevokeGrantResult>;
  /** Adds a column for whose grant it is (the superAdmin view across all users). */
  showUser?: boolean;
};

/**
 * Active OAuth grants, one row per token family. Shared by /account/connected-apps and the
 * superAdmin section of /admin/api-keys; each passes its own guarded revoke action.
 */
export function OAuthGrantsTable({ grants, revokeAction, showUser = false }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>App</TableHead>
          {showUser && <TableHead>User</TableHead>}
          <TableHead>Returns to</TableHead>
          <TableHead>Authorized</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {grants.map((g) => {
          const appName = g.clientName ?? "Unnamed app";
          return (
            <TableRow key={g.familyId}>
              <TableCell className="font-medium">{appName}</TableCell>
              {showUser && (
                <TableCell className="text-sm text-muted-foreground">{g.userEmail}</TableCell>
              )}
              <TableCell className="text-sm">{describeRedirects(g.redirectUris)}</TableCell>
              <TableCell className="text-sm">{formatDateTime(g.authorizedAt)}</TableCell>
              <TableCell className="text-sm">
                {g.lastUsedAt ? formatDateTime(g.lastUsedAt) : "Never"}
              </TableCell>
              <TableCell className="text-right">
                <RevokeGrantButton
                  familyId={g.familyId}
                  appName={appName}
                  revokeAction={revokeAction}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function RevokeGrantButton({
  familyId,
  appName,
  revokeAction,
}: {
  familyId: string;
  appName: string;
  revokeAction: Props["revokeAction"];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(e: React.MouseEvent) {
    // AlertDialogAction closes on click; keep it open so a failure stays visible.
    e.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      const result = await revokeAction(familyId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={isPending}
        >
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke access for {appName}?</AlertDialogTitle>
          <AlertDialogDescription>
            It stops working immediately and can&apos;t refresh its access. To use it again, connect
            it again and approve it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Revoking…" : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
