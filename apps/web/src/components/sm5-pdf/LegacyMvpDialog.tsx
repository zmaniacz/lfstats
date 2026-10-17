// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMVP } from "@/lib/format";
import type { LegacyMvpComponent } from "@lfstats/db";

type Props = {
  callsign: string;
  totalMvp: number;
  components: LegacyMvpComponent[];
};

/**
 * The legacy site's MVP breakdown for a PDF-era scorecard. It used an older formula
 * than modern MVP, so it is labelled as legacy and never compared with modern values.
 */
export function LegacyMvpDialog({ callsign, totalMvp, components }: Props) {
  const [open, setOpen] = useState(false);
  const nonZero = components.filter((c) => c.value !== 0);

  return (
    <>
      <Button
        variant="link"
        className="h-auto p-0 tabular-nums text-foreground"
        onClick={() => setOpen(true)}
      >
        {formatMVP(totalMvp)}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{callsign} — legacy MVP</DialogTitle>
            <DialogDescription>
              Scored by the legacy site's formula. Not comparable with modern MVP.
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nonZero.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    No breakdown recorded.
                  </TableCell>
                </TableRow>
              ) : (
                nonZero.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMVP(c.value)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatMVP(totalMvp)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </DialogContent>
      </Dialog>
    </>
  );
}
