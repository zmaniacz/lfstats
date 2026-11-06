// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { FlaskIcon } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import type { MvpModelChoice } from "@/lib/mvp-model-params";

/**
 * Marks a page whose MVP figures come from a non-default model. Renders nothing for the
 * default model, so official pages look exactly as before. The switcher in the sidebar
 * footer changes or clears the choice.
 */
export function MvpModelNotice({ model }: { model: MvpModelChoice | null }) {
  if (!model || model.isDefault) return null;
  return (
    <div className="flex">
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <FlaskIcon />
        MVP figures use model {model.version}
        {model.status === "development" ? " (development, not official)" : " (not the default)"}
      </Badge>
    </div>
  );
}
