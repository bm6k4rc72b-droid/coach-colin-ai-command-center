import { useRef } from 'react'

const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const MAX_TOTAL_ACTIONS = 10 // Max 10 total actions per window

/**
 * Rate limiting hook - prevents spam on individual sightings
 * and limits total actions per time window
 */
export function useRateLimit(key: string) {
  const actionTimestampsRef = useRef<number[]>([])
  const sightingActionsRef = useRef<Map<string, number>>(new Map())

  const canPerformAction = (sightingId?: string): boolean => {
    const now = Date.now()
    const storageKey = `rate_limit_${key}`
    const sightingKey = sightingId ? `sighting_${sightingId}` : null

    // Get stored timestamps from localStorage
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const data = JSON.parse(stored)
        actionTimestampsRef.current = (data.timestamps || []).filter(
          (ts: number) => now - ts < RATE_LIMIT_WINDOW
        )
        if (data.sightingActions) {
          sightingActionsRef.current = new Map<string, number>(
            (Object.entries(data.sightingActions) as [string, number][]).filter(
              ([, timestamp]) => now - timestamp < RATE_LIMIT_WINDOW
            )
          )
        }
      }
    } catch {
      actionTimestampsRef.current = []
      sightingActionsRef.current = new Map()
    }

    // Check per-sighting limit
    if (sightingKey && sightingActionsRef.current.has(sightingKey)) {
      const lastAction = sightingActionsRef.current.get(sightingKey)!
      if (now - lastAction < RATE_LIMIT_WINDOW) {
        return false
      }
    }

    // Check total actions limit
    if (actionTimestampsRef.current.length >= MAX_TOTAL_ACTIONS) {
      return false
    }

    // Add current timestamp
    actionTimestampsRef.current.push(now)
    if (sightingKey) {
      sightingActionsRef.current.set(sightingKey, now)
    }

    // Store back to localStorage
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          timestamps: actionTimestampsRef.current,
          sightingActions: Object.fromEntries(sightingActionsRef.current),
        })
      )
    } catch {
      // Ignore localStorage errors
    }

    return true
  }

  return { canPerformAction }
}
