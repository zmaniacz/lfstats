"use client"

import { useEffect } from "react"

const KEY = "nightly_state"

export function NightlyStateManager({ center, date }: { center: string; date: string }) {
  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify({ center, date, savedAt: Date.now() }))
  }, [center, date])
  return null
}
