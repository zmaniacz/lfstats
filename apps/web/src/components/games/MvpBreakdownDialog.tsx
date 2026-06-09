// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { getMvpComponentLabel, MVP_COMPONENTS } from "@/lib/mvp-components";
import type { MvpComponentRow } from "@lfstats/db";

const DISPLAY_ORDER = Object.keys(MVP_COMPONENTS);

type Props = {
  callsign: string;
  totalMvp: number;
  components: MvpComponentRow[];
};

export function MvpBreakdownDialog({ callsign, totalMvp, components }: Props) {
  const [open, setOpen] = useState(false);

  const sorted = [...components].sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.component) - DISPLAY_ORDER.indexOf(b.component),
  );

  return (
    <>
      <Button
        variant="link"
        className="h-auto p-0 tabular-nums font-normal"
        onClick={() => setOpen(true)}
      >
        {formatMVP(totalMvp)}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{callsign} — MVP Breakdown</DialogTitle>
          </DialogHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.component}>
                  <TableCell>{getMvpComponentLabel(row.component)}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${row.points < 0 ? "text-destructive" : ""}`}
                  >
                    {formatMVP(row.points)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">Total</TableCell>
                <TableCell className="text-right tabular-nums font-bold">
                  {formatMVP(totalMvp)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </DialogContent>
      </Dialog>
    </>
  );
}
