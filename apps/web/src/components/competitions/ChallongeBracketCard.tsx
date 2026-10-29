// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The finals bracket, embedded from Challonge — bracket structure is not modeled internally.
 * Shared by the SM5 and Laserball Finals tabs.
 */
export function ChallongeBracketCard({
  challongeLink,
  challongeBracketHeight,
}: {
  challongeLink: string | null;
  challongeBracketHeight: number | null;
}) {
  const bracketUrl = challongeLink?.replace(/\/+$/, "").replace(/\/module$/, "") ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bracket</CardTitle>
      </CardHeader>
      <CardContent>
        {bracketUrl ? (
          <>
            <iframe
              title="Tournament bracket"
              src={`${bracketUrl}/module?show_final_results=1&show_standings=1`}
              width="100%"
              height={challongeBracketHeight ?? 500}
              className="rounded-md border"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              <a href={bracketUrl} target="_blank" rel="noopener noreferrer" className="underline">
                View bracket on Challonge
              </a>
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Bracket not configured.</p>
        )}
      </CardContent>
    </Card>
  );
}
