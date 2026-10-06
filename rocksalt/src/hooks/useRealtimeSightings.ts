import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { isWithinCityBounds } from '@/lib/geo'
import type { Sighting } from '@/types'

export function useRealtimeSightings(
  setSightings: React.Dispatch<React.SetStateAction<Sighting[]>>
) {
  useEffect(() => {
    const channel = supabase
      .channel('sightings-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sightings',
        },
        (payload) => {
          const newSighting = payload.new as any
          // Transform to match Sighting type
          const lat = parseFloat(newSighting.location?.coordinates?.[1] || 0)
          const lng = parseFloat(newSighting.location?.coordinates?.[0] || 0)
          
          // Only add sighting if it's within configured bounds
          if (!isWithinCityBounds(lat, lng)) {
            return
          }
          
          const sighting: Sighting = {
            id: newSighting.id,
            created_at: newSighting.created_at,
            lat,
            lng,
            activity_type: newSighting.activity_type,
            vehicle_count: newSighting.vehicle_count,
            agent_count: newSighting.agent_count,
            description: newSighting.description,
            photo_path: newSighting.photo_path,
            confidence_score: newSighting.confidence_score,
            confirmations: newSighting.confirmations ?? 0,
            disputes: newSighting.disputes ?? 0,
          }
          setSightings((prev) => [sighting, ...prev])
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sightings',
        },
        (payload) => {
          const updated = payload.new as any
          setSightings((prev) =>
            prev.map((s) => {
              if (s.id === updated.id) {
                return {
                  ...s,
                  confidence_score: updated.confidence_score,
                  confirmations: updated.confirmations,
                  disputes: updated.disputes,
                  archived: updated.archived,
                }
              }
              return s
            })
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [setSightings])
}

