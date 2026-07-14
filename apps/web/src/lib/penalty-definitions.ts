// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

export type PenaltyDefinition = {
  name: string;
  defaultScore: number;
  defaultMvp: number;
};

// Keep in sync with docs/SM5-penalty-definitions.md
export const PENALTY_DEFINITIONS: PenaltyDefinition[] = [
  { name: "Common Foul", defaultScore: 0, defaultMvp: 0 },
  { name: "Shielding", defaultScore: 0, defaultMvp: 0 },
  { name: "Chasing", defaultScore: 0, defaultMvp: 0 },
  { name: "Blocking", defaultScore: 0, defaultMvp: 0 },
  { name: "Dangerous Play", defaultScore: -1000, defaultMvp: -5 },
  { name: "Illegal Language", defaultScore: -1000, defaultMvp: -5 },
  { name: "Physical Abuse", defaultScore: -1000, defaultMvp: -5 },
  { name: "Unsportsmanlike Conduct", defaultScore: -1000, defaultMvp: -5 },
  { name: "Leaving Starting Area", defaultScore: 0, defaultMvp: 0 },
  { name: "Leaving Playing Arena", defaultScore: 0, defaultMvp: 0 },
  { name: "Removing Equipment", defaultScore: 0, defaultMvp: 0 },
  { name: "Sitting or Lying", defaultScore: 0, defaultMvp: 0 },
  { name: "Climbing", defaultScore: 0, defaultMvp: 0 },
  { name: "Swapping Guns", defaultScore: 0, defaultMvp: 0 },
  { name: "Loitering", defaultScore: 0, defaultMvp: 0 },
  { name: "Illegal Interaction", defaultScore: 0, defaultMvp: 0 },
  { name: "Illegal Targeting", defaultScore: 0, defaultMvp: 0 },
  { name: "Shoulder Tilting", defaultScore: 0, defaultMvp: 0 },
  { name: "Game Misconduct", defaultScore: -1000, defaultMvp: -5 },
];

export const ELEVATED_SCORE = -1000;
export const ELEVATED_MVP = -5;
