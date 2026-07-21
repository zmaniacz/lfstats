// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";

export function LbMatchDetailsDisclosure({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium hover:underline">
        {open ? (
          <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        Half-by-half details
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
