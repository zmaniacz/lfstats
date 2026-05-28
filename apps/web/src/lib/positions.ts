export type Position = {
  readonly label: string;
  readonly abbr: string;
  readonly category: number;
};

export const POSITIONS: Readonly<Record<number, Position>> = {
  1: { label: "Commander", abbr: "CMD", category: 1 },
  2: { label: "Heavy Weapons", abbr: "HVY", category: 2 },
  3: { label: "Scout", abbr: "SCT", category: 3 },
  4: { label: "Ammo Carrier", abbr: "AMO", category: 4 },
  5: { label: "Medic", abbr: "MED", category: 5 },
} as const;

export function getPosition(n: number): Position | undefined {
  return POSITIONS[n];
}
