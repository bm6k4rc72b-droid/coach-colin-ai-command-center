import { useState, useEffect } from 'react'
import { reverseGeocode } from '@/lib/geocoding'

// Cache for addresses to avoid repeated API calls
const addressCache = new Map<string, { address: string | null; timestamp: number }>()
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Hook to get address from coordinates with caching
 */
export function useAddress(lat: number | null, lng: number | null): string | null {
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (lat === null || lng === null) {
      setAddress(null)
      setLoading(false)
      return
    }

    // Create stable cache key (round to 4 decimal places to avoid unnecessary re-fetches)
    const roundedLat = Math.round(lat * 10000) / 10000
    const roundedLng = Math.round(lng * 10000) / 10000
    const cacheKey = `${roundedLat},${roundedLng}`
    const cached = addressCache.get(cacheKey)

    // Check cache first
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setAddress(cached.address)
      setLoading(false)
      return
    }

    // Fetch address
    setLoading(true)
    let cancelled = false
    
    reverseGeocode(lat, lng)
      .then((addr) => {
        if (cancelled) return
        setAddress(addr)
        // Cache the result
        addressCache.set(cacheKey, {
          address: addr,
          timestamp: Date.now(),
        })
      })
      .catch(() => {
        if (!cancelled) {
          setAddress(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [lat, lng])

  // Return coordinates as fallback while loading or if address is null
  if (loading || address === null) {
    return lat !== null && lng !== null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : null
  }

  // Address is already intelligently parsed by reverseGeocode function
  return address
}

