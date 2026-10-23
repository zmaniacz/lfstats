// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CompetitionTeamListItem } from "@lfstats/db";

/**
 * The team slots of one match, as Select values ("tbd" for an empty slot). In a trios
 * competition each side holds two trios; the partner slots are unused otherwise.
 */
export type MatchTeamSlots = {
  team1Id: string;
  team1PartnerId: string;
  team2Id: string;
  team2PartnerId: string;
};

type SlotKey = keyof MatchTeamSlots;

export const EMPTY_MATCH_SLOTS: MatchTeamSlots = {
  team1Id: "tbd",
  team1PartnerId: "tbd",
  team2Id: "tbd",
  team2PartnerId: "tbd",
};

export function matchSlotsFrom(m: {
  team1Id: string | null;
  team1PartnerId: string | null;
  team2Id: string | null;
  team2PartnerId: string | null;
}): MatchTeamSlots {
  return {
    team1Id: m.team1Id ?? "tbd",
    team1PartnerId: m.team1PartnerId ?? "tbd",
    team2Id: m.team2Id ?? "tbd",
    team2PartnerId: m.team2PartnerId ?? "tbd",
  };
}

/** Writes the slots into the form data the match actions read; partners only for trios. */
export function setMatchSlotsOnFormData(
  formData: FormData,
  slots: MatchTeamSlots,
  trios: boolean,
): void {
  const keys: SlotKey[] = trios
    ? ["team1Id", "team1PartnerId", "team2Id", "team2PartnerId"]
    : ["team1Id", "team2Id"];
  for (const key of keys) formData.set(key, slots[key] === "tbd" ? "" : slots[key]);
}

const SLOT_LABELS: Record<SlotKey, string> = {
  team1Id: "Team 1",
  team1PartnerId: "Team 1 partner",
  team2Id: "Team 2",
  team2PartnerId: "Team 2 partner",
};

const TRIO_SLOT_LABELS: Record<SlotKey, string> = {
  team1Id: "Side 1 · Trio A",
  team1PartnerId: "Side 1 · Trio B",
  team2Id: "Side 2 · Trio A",
  team2PartnerId: "Side 2 · Trio B",
};

type Props = {
  teams: CompetitionTeamListItem[];
  slots: MatchTeamSlots;
  onChange: (slots: MatchTeamSlots) => void;
  trios: boolean;
  /** Show a label above each select (the add-match form) or not (inline edit rows). */
  labelled?: boolean;
  triggerClassName?: string;
};

/**
 * Team pickers for one match: "Team 1 vs Team 2", or for trios "A + B vs C + D". A team chosen
 * in any slot is disabled in the others, mirroring the competition_match distinct-teams check.
 */
export function MatchTeamSelects({
  teams,
  slots,
  onChange,
  trios,
  labelled = false,
  triggerClassName = "w-44",
}: Props) {
  const labels = trios ? TRIO_SLOT_LABELS : SLOT_LABELS;

  function renderSelect(key: SlotKey) {
    const takenElsewhere = new Set(
      (Object.keys(slots) as SlotKey[])
        .filter((k) => k !== key && (trios || !k.endsWith("PartnerId")))
        .map((k) => slots[k])
        .filter((v) => v !== "tbd"),
    );
    const select = (
      <Select value={slots[key]} onValueChange={(v) => onChange({ ...slots, [key]: v })}>
        <SelectTrigger className={triggerClassName} aria-label={labels[key]}>
          <SelectValue placeholder="Select team…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tbd">TBD</SelectItem>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id} disabled={takenElsewhere.has(t.id)}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
    if (!labelled) return <div key={key}>{select}</div>;
    return (
      <div key={key} className="space-y-1">
        <Label>{labels[key]}</Label>
        {select}
      </div>
    );
  }

  if (!trios) {
    return (
      <>
        {renderSelect("team1Id")}
        <span className="text-sm text-muted-foreground pb-2">vs</span>
        {renderSelect("team2Id")}
      </>
    );
  }

  return (
    <>
      {renderSelect("team1Id")}
      <span className="text-sm text-muted-foreground pb-2">+</span>
      {renderSelect("team1PartnerId")}
      <span className="text-sm text-muted-foreground pb-2">vs</span>
      {renderSelect("team2Id")}
      <span className="text-sm text-muted-foreground pb-2">+</span>
      {renderSelect("team2PartnerId")}
    </>
  );
}
