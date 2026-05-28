export type MvpComponentMeta = {
  readonly label: string
}

export const MVP_COMPONENTS: Readonly<Record<string, MvpComponentMeta>> = {
  accuracy:                  { label: 'Accuracy' },
  score_bonus:               { label: 'Score Bonus' },
  shots_hit_opponent_medic:  { label: 'Opp. Medic Hits' },
  shots_hit_team_medic:      { label: 'Own Medic Hits' },
  missiles_hit_opponent:     { label: 'Missile Hits' },
  nukes_detonated:           { label: 'Nukes Detonated' },
  nukes_canceled_by_opponent:{ label: 'Nukes Canceled by Opp.' },
  nukes_canceled:            { label: 'Nukes Canceled' },
  team_nukes_canceled:       { label: 'Own Nukes Canceled' },
  shots_hit_opponent_3hit:   { label: '3-Hit Shots' },
  ammo_boost:                { label: 'Ammo Boost' },
  life_boost:                { label: 'Life Boost' },
  survival_bonus:            { label: 'Survival Bonus' },
  elimination_bonus:         { label: 'Elimination Bonus' },
  eliminated:                { label: 'Eliminated Penalty' },
  times_hit_by_missile:      { label: 'Times Missiled' },
} as const

export function getMvpComponentLabel(key: string): string {
  return MVP_COMPONENTS[key]?.label ?? key
}
