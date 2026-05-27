const EM_DASH = '—'

export function formatScore(n: number | null): string {
  if (n === null) return EM_DASH
  return n.toLocaleString('en-US')
}

export function formatPct(n: number | null): string {
  if (n === null) return EM_DASH
  return `${(n * 100).toFixed(1)}%`
}

export function formatMs(ms: number | null): string {
  if (ms === null) return EM_DASH
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatHitDiff(n: number | null): string {
  if (n === null) return EM_DASH
  return n.toFixed(2)
}

export function formatMVP(n: number | null): string {
  if (n === null) return EM_DASH
  return n.toFixed(3)
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatDateTime(d: Date | null): string {
  if (d === null) return EM_DASH
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h12}:${String(m).padStart(2, '0')} ${ampm}`
}
