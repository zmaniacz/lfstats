export type TeamColor = {
  readonly label: string
  readonly bg: string
  readonly text: string
  readonly border: string
}

export const TEAM_COLORS: Readonly<Record<number, TeamColor>> = {
  0:  { label: 'None',    bg: 'bg-muted',                                                  text: 'text-muted-foreground', border: 'border-border'    },
  1:  { label: 'Red',     bg: 'bg-red-500',                                                text: 'text-red-700',          border: 'border-red-500'   },
  2:  { label: 'Green',   bg: 'bg-green-500',                                              text: 'text-green-700',        border: 'border-green-500' },
  3:  { label: 'Yellow',  bg: 'bg-yellow-400',                                             text: 'text-yellow-700',       border: 'border-yellow-400'},
  4:  { label: 'Blue',    bg: 'bg-blue-500',                                               text: 'text-blue-700',         border: 'border-blue-500'  },
  5:  { label: 'Aqua',    bg: 'bg-cyan-500',                                               text: 'text-cyan-700',         border: 'border-cyan-500'  },
  6:  { label: 'Purple',  bg: 'bg-purple-500',                                             text: 'text-purple-700',       border: 'border-purple-500'},
  7:  { label: 'White',   bg: 'bg-white',                                                  text: 'text-gray-700',         border: 'border-gray-200'  },
  8:  { label: 'Orange',  bg: 'bg-orange-500',                                             text: 'text-orange-700',       border: 'border-orange-500'},
  9:  { label: 'Pink',    bg: 'bg-pink-400',                                               text: 'text-pink-700',         border: 'border-pink-400'  },
  10: { label: 'Black',   bg: 'bg-gray-900',                                               text: 'text-gray-900',         border: 'border-gray-900'  },
  11: { label: 'Fire',    bg: 'bg-red-600',                                                text: 'text-red-700',          border: 'border-red-600'   },
  12: { label: 'Ice',     bg: 'bg-sky-300',                                                text: 'text-blue-700',         border: 'border-sky-300'   },
  13: { label: 'Earth',   bg: 'bg-amber-700',                                              text: 'text-green-700',        border: 'border-amber-700' },
  14: { label: 'Crystal', bg: 'bg-violet-400',                                             text: 'text-violet-700',       border: 'border-violet-400'},
  15: { label: 'Rainbow', bg: 'bg-gradient-to-r from-red-500 via-yellow-400 to-blue-500', text: 'text-purple-600',       border: 'border-purple-500'},
} as const

export function getTeamColor(n: number): TeamColor | undefined {
  return TEAM_COLORS[n]
}
