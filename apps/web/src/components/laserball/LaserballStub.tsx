// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent } from "@/components/ui/card";

// Placeholder for Laserball sections not built yet. Keeps the page (and its
// SM5/Laserball toggle) usable so users can switch back to SM5.
export function LaserballStub({ feature }: { feature: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-lg font-medium">Laserball {feature} coming soon</p>
        <p className="text-sm text-muted-foreground">
          This view isn’t available for Laserball yet — switch to SM5 above.
        </p>
      </CardContent>
    </Card>
  );
}
