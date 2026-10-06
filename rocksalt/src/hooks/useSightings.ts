import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isWithinCityBounds } from '@/lib/geo'
import type { Sighting } from '@/types'

export function useSightings(
  lat: number | null,
  lng: number | null,
  radiusMiles = 10,
  hoursAgo = 4
) {
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (lat === null || lng === null) {
      setLoading(false)
      return
    }

    async function fetch() {
      setLoading(true)
      setError(null)

      const { data, error: rpcError } = await supabase.rpc('get_nearby_sightings', {
        lat,
        lng,
        radius_miles: radiusMiles,
        hours_ago: hoursAgo,
      })

      if (rpcError) {
        setError(new Error(rpcError.message))
        setSightings([])
      } else {
        // Filter sightings to only include those within configured bounds
        const filteredSightings = (data || []).filter((sighting: Sighting) =>
          isWithinCityBounds(sighting.lat, sighting.lng)
        )
        setSightings(filteredSightings)
      }

      setLoading(false)
    }

    fetch()
  }, [lat, lng, radiusMiles, hoursAgo])

  return { sightings, setSightings, loading, error }
}

