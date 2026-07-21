// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "About SM5" };

const classDetails = [
  {
    class: "Commander",
    shotsInitial: 30,
    shotsResupply: 5,
    shotsMax: 60,
    livesInitial: 15,
    livesResupply: 4,
    livesMax: 30,
    missiles: "5",
    hitPoints: 3,
    shotPower: 2,
  },
  {
    class: "Heavy Weapons",
    shotsInitial: 20,
    shotsResupply: 5,
    shotsMax: 40,
    livesInitial: 10,
    livesResupply: 3,
    livesMax: 20,
    missiles: "5",
    hitPoints: 3,
    shotPower: 3,
  },
  {
    class: "Scout",
    shotsInitial: 30,
    shotsResupply: 10,
    shotsMax: 60,
    livesInitial: 15,
    livesResupply: 5,
    livesMax: 30,
    missiles: "—",
    hitPoints: 1,
    shotPower: 1,
  },
  {
    class: "Ammo Carrier",
    shotsInitial: "—",
    shotsResupply: "—",
    shotsMax: "—",
    livesInitial: 10,
    livesResupply: 3,
    livesMax: 20,
    missiles: "—",
    hitPoints: 1,
    shotPower: 1,
  },
  {
    class: "Medic",
    shotsInitial: 15,
    shotsResupply: 5,
    shotsMax: 30,
    livesInitial: 20,
    livesResupply: 0,
    livesMax: 20,
    missiles: "—",
    hitPoints: 1,
    shotPower: 1,
  },
] as const;

const scoringEvents = [
  { event: "Zap opponent", score: "100", specialPoints: "1", notes: "—" },
  { event: "Zap team", score: "-100", specialPoints: "—", notes: "—" },
  { event: "Missile opponent", score: "500", specialPoints: "2", notes: "—" },
  { event: "Missile team", score: "-500", specialPoints: "—", notes: "—" },
  { event: "Destroy target", score: "1001", specialPoints: "5", notes: "—" },
  { event: "Detonate nuke", score: "500", specialPoints: "—", notes: "—" },
  { event: "Get zapped", score: "-20", specialPoints: "—", notes: "Lose 1 life" },
  { event: "Get Missiled", score: "-100", specialPoints: "—", notes: "Lose 2 lives" },
  { event: "Get nuked", score: "0", specialPoints: "—", notes: "Lose 3 lives" },
] as const;

export default function AboutSM5Page() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">About SM5</h1>
        <a
          href="https://lfstats-scorecards.s3.amazonaws.com/2023-09-23-Laserforce-Official-Tournament-Rules.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary underline underline-offset-4"
        >
          Official Rules PDF (2023-09-23)
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class Details</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead className="text-center">Shots: Initial</TableHead>
                <TableHead className="text-center">Shots: Resupply</TableHead>
                <TableHead className="text-center">Shots: Max</TableHead>
                <TableHead className="text-center">Lives: Initial</TableHead>
                <TableHead className="text-center">Lives: Resupply</TableHead>
                <TableHead className="text-center">Lives: Max</TableHead>
                <TableHead className="text-center">Missiles</TableHead>
                <TableHead className="text-center">Hit Points</TableHead>
                <TableHead className="text-center">Shot Power</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classDetails.map((row) => (
                <TableRow key={row.class}>
                  <TableCell className="font-medium">{row.class}</TableCell>
                  <TableCell className="text-center">{row.shotsInitial}</TableCell>
                  <TableCell className="text-center">{row.shotsResupply}</TableCell>
                  <TableCell className="text-center">{row.shotsMax}</TableCell>
                  <TableCell className="text-center">{row.livesInitial}</TableCell>
                  <TableCell className="text-center">{row.livesResupply}</TableCell>
                  <TableCell className="text-center">{row.livesMax}</TableCell>
                  <TableCell className="text-center">{row.missiles}</TableCell>
                  <TableCell className="text-center">{row.hitPoints}</TableCell>
                  <TableCell className="text-center">{row.shotPower}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scoring System</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="text-center">Special Points</TableHead>
                <TableHead className="text-center">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scoringEvents.map((row) => (
                <TableRow key={row.event}>
                  <TableCell className="font-medium">{row.event}</TableCell>
                  <TableCell className="text-center">{row.score}</TableCell>
                  <TableCell className="text-center">{row.specialPoints}</TableCell>
                  <TableCell className="text-center">{row.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MVP Points System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2">All Players</h3>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Accuracy: 0.1 point per 1% (75% = 7.5 pts)</li>
              <li>Medic Hits: 1 point per enemy Medic hit; -1 for friendly</li>
              <li>Elimination: Minimum 4 points; +1/60 per second over 3 minutes</li>
              <li>Cancel opponent&apos;s nuke: 3 points</li>
              <li>Cancel own team&apos;s nuke: -3 points</li>
              <li>Get missiled: -1 point</li>
              <li>Get eliminated: -1 point (excludes Medics)</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Commander</h3>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Missiles: 1 point per opponent missile</li>
              <li>Nukes: 1 point per successful nuke</li>
              <li>Score bonus: 1 point per 1000 over 10,000</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Heavy Weapons</h3>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Missiles: 2 points per opponent missile</li>
              <li>Score bonus: 1 point per 1000 over 7,000</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Scout</h3>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Hits vs. Commander/Heavy: 0.2 points per hit</li>
              <li>Score bonus: 1 point per 1000 over 6,000</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Ammo Carrier</h3>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Power Boost: 3 points each activation</li>
              <li>Score bonus: 1 point per 1000 over 3,000</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Medic</h3>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Power Boost: 3 points each activation</li>
              <li>Survival Bonus: 2 points if alive at clock expiration</li>
              <li>Score bonus: 2 points per 1000 over 2,000</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
