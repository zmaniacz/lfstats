// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link"
import { getCenterList } from "@lfstats/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function TagsPage() {
  const centers = await getCenterList()

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Tags</h2>
      <p className="text-sm text-muted-foreground">
        Select a center to manage its game tags.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Center</TableHead>
            <TableHead>Games</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {centers.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/admin/tags/${c.slug}`}
                  className="hover:underline font-medium"
                >
                  {c.name}
                </Link>
              </TableCell>
              <TableCell className="tabular-nums">{c.gameCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
