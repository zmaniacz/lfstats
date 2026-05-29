"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

const KEY = "nightly_state"
const TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

export function NightlyStateRestorer({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY)
      if (raw) {
        const { center, date, savedAt } = JSON.parse(raw) as {
          center: string
          date: string
          savedAt: number
        }
        if (center && date && Date.now() - savedAt <= TTL_MS) {
          router.replace(`/nightly?center=${center}&date=${date}`)
          return // page navigates away — never show children
        }
        sessionStorage.removeItem(KEY)
      }
    } catch {
      // ignore parse errors
    }
    setChecked(true)
  }, [router])

  if (!checked) return null // suppress flash while checking
  return <>{children}</>
}
