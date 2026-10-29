// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox";
import type { EntityGroup, EntityOption } from "./entity-options";

function matches(option: EntityOption, query: string): boolean {
  const haystack = `${option.label} ${option.keywords ?? ""}`.toLowerCase();
  // Every word must appear somewhere, so "ladder 24" finds "Winter Ladder 2024".
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * A type-to-filter picker for long entity lists (centers, competitions). Values are plain
 * strings, so it drops in where a `Select` keyed by slug or id used to be.
 */
export function EntityCombobox({
  groups,
  value,
  onValueChange,
  placeholder,
  emptyText = "No matches",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: {
  groups: EntityGroup[];
  value: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const selected =
    value === null ? null : (groups.flatMap((g) => g.items).find((o) => o.value === value) ?? null);
  const selectedLabel = selected?.label ?? "";

  const [inputValue, setInputValue] = useState(selectedLabel);
  // Follow the selection when it changes from outside (navigation, form reset).
  const [syncedLabel, setSyncedLabel] = useState(selectedLabel);
  if (syncedLabel !== selectedLabel) {
    setSyncedLabel(selectedLabel);
    setInputValue(selectedLabel);
  }

  return (
    <Combobox<EntityOption>
      items={groups}
      value={selected}
      onValueChange={(option) => {
        if (!option) return;
        setInputValue(option.label);
        onValueChange(option.value);
      }}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      onOpenChange={(open) => {
        // Abandoning a search puts the selected label back rather than leaving the half-typed query.
        if (!open) setInputValue(selectedLabel);
      }}
      // Enter picks the top match without arrowing down to it first.
      autoHighlight
      itemToStringLabel={(option) => option.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      filter={matches}
      disabled={disabled}
    >
      <ComboboxInput
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        // While the input shows the selected label, focusing or clicking it selects the label so
        // typing replaces it instead of appending. onFocus alone misses clicks when the input kept
        // focus (after Escape or a pick); a click inside a typed query still just moves the caret.
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => {
          if (e.currentTarget.value === selectedLabel) e.currentTarget.select();
        }}
      />
      <ComboboxContent className="min-w-80">
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(group: EntityGroup) => (
            <ComboboxGroup key={group.key} items={group.items}>
              {group.label && <ComboboxLabel>{group.label}</ComboboxLabel>}
              <ComboboxCollection>
                {(option: EntityOption) => (
                  <ComboboxItem key={option.value} value={option}>
                    <span className="flex-1 truncate">{option.label}</span>
                    {option.hint && (
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        {option.hint}
                      </span>
                    )}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
