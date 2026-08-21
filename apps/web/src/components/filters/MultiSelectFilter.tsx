// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MultiSelectOption = {
  value: string;
  label: string;
  /** Optional section heading. Consecutive options sharing a group render under one heading. */
  group?: string;
};

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  alwaysShowLabel = false,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Keep `label` on the trigger even when items are selected — for callers that show the
   *  selection themselves, where a "3 selected" summary would just repeat it. */
  alwaysShowLabel?: boolean;
}) {
  const triggerLabel =
    alwaysShowLabel || selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? label)
        : `${selected.length} selected`;

  function toggle(value: string, checked: boolean) {
    const next = checked
      ? new Set([...selected, value])
      : new Set(selected.filter((v) => v !== value));
    // Emit in option order, not click order — callers that map the selection onto table
    // columns need a stable order that doesn't depend on how the user got there.
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={selected.length > 0 ? "border-primary" : ""}>
          {triggerLabel}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {options.map((option, i) => {
          const previousGroup = i === 0 ? undefined : options[i - 1].group;
          const startsGroup = option.group !== undefined && option.group !== previousGroup;
          return (
            <Fragment key={option.value}>
              {startsGroup && (
                <>
                  {i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {option.group}
                  </DropdownMenuLabel>
                </>
              )}
              <DropdownMenuCheckboxItem
                checked={selected.includes(option.value)}
                onCheckedChange={(checked) => toggle(option.value, checked)}
                onSelect={(e) => e.preventDefault()}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
