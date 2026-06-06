// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatHitDiff } from "@/lib/format"
import { POSITIONS } from "@/lib/positions"
import type { PlayerHitData } from "@lfstats/db"

type Props = {
  callsign: string
  hitDiff: number
  interactions: PlayerHitData[]
}

export function HitDiffDialog({ callsign, hitDiff, interactions }: Props) {
  const [open, setOpen] = useState(false)

  const opponents = interactions.filter((i) => !i.isTeammate)
  const teammates = interactions.filter((i) => i.isTeammate)

  return (
    <>
      <Button
        variant="link"
        className="h-auto p-0 tabular-nums font-normal"
        onClick={() => setOpen(true)}
      >
        {formatHitDiff(hitDiff)}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{callsign} — Hit Breakdown</DialogTitle>
          </DialogHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Hit</TableHead>
                <TableHead className="text-right">Hit By</TableHead>
                <TableHead className="text-right">Msl</TableHead>
                <TableHead className="text-right">Msl By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opponents.map((row) => (
                <TableRow key={row.callsign}>
                  <TableCell>
                    <span className="text-xs text-muted-foreground mr-1">{POSITIONS[row.position]?.abbr ?? "?"}</span>
                    {row.callsign}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{row.hitsDealt}</TableCell>
                  <TableCell className="text-center tabular-nums">{row.hitsReceived}</TableCell>
                  <TableCell className="text-center tabular-nums">{row.missilesDealt}</TableCell>
                  <TableCell className="text-center tabular-nums">{row.missilesReceived}</TableCell>
                </TableRow>
              ))}
              {teammates.length > 0 && (
                <>
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-xs font-medium uppercase tracking-wide py-1 bg-muted/40"
                    >
                      Teammates
                    </TableCell>
                  </TableRow>
                  {teammates.map((row) => (
                    <TableRow key={row.callsign}>
                      <TableCell>
                        <span className="text-xs text-muted-foreground mr-1">{POSITIONS[row.position]?.abbr ?? "?"}</span>
                        {row.callsign}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{row.hitsDealt}</TableCell>
                      <TableCell className="text-center tabular-nums">{row.hitsReceived}</TableCell>
                      <TableCell className="text-center tabular-nums">{row.missilesDealt}</TableCell>
                      <TableCell className="text-center tabular-nums">{row.missilesReceived}</TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </>
  )
}
