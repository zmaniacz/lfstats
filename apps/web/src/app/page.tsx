// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Welcome to LFstats</h1>
      <div className="grid grid-cols-1 max-w-2xl">
        <Card className="mt-4">
          <CardContent>
            <p className="mb-4">
              Over the next few weeks, you'll see this new version of the site
              more fully come to life. Any games uploaded to the current
              lfstats.com will appear here as well. I'm targeting end of June
              for the full launch, so we'll have time to work out any kinks
              prior to Internats.
            </p>
            <p className="mb-4">
              You'll note the stats here are limited to the TDF (~2020-present)
              era. Hammering TDF data into a system designed to read the old
              PDFs was no longer feasible. The current site will continue as a
              read-only version until I'm able to migrate the legacy data.
            </p>
            <p>
              For now, enjoy the new site and let me know on Discord what you
              like or hate. Any site admins, please login to the website with
              your Googel account so we can get access set up.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
