import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet'
import { useState, useEffect, useMemo } from 'react'
import { cityConfig } from '@/config/city'
import { useSightings } from '@/hooks/useSightings'
import { useRealtimeSightings } from '@/hooks/useRealtimeSightings'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useRateLimit } from '@/hooks/useRateLimit'
import { supabase } from '@/lib/supabase'
import { isWithinBounds } from '@/lib/geo'
import { SightingMarker } from './SightingMarker'
import type { Sighting } from '@/types'

interface MapProps {
  center?: [number, number]
  zoom?: number
  hoursAgo?: number
  onConfirm?: (id: string) => Promise<void>
  onDispute?: (id: string) => Promise<void>
  onSightingsChange?: (sightings: Sighting[]) => void
}

// Component to track map bounds changes
function MapBoundsTracker({ onBoundsChange }: { onBoundsChange: (bounds: { sw: [number, number]; ne: [number, number] }) => void }) {
  const map = useMap()

  useMapEvents({
    moveend: () => {
      try {
        const bounds = map.getBounds()
        onBoundsChange({
          sw: [bounds.getSouth(), bounds.getWest()],
          ne: [bounds.getNorth(), bounds.getEast()],
        })
      } catch {
        // Map not ready, ignore
      }
    },
    zoomend: () => {
      try {
        const bounds = map.getBounds()
        onBoundsChange({
          sw: [bounds.getSouth(), bounds.getWest()],
          ne: [bounds.getNorth(), bounds.getEast()],
        })
      } catch {
        // Map not ready, ignore
      }
    },
  })

  // Initial bounds - wait for map to be ready
  useEffect(() => {
    if (!map || !map.getBounds) return
    
    const updateBounds = () => {
      try {
        const bounds = map.getBounds()
        onBoundsChange({
          sw: [bounds.getSouth(), bounds.getWest()],
          ne: [bounds.getNorth(), bounds.getEast()],
        })
      } catch {
        // Map not ready yet, ignore
      }
    }
    
    // Small delay to ensure map is fully initialized
    const timer = setTimeout(updateBounds, 100)
    return () => clearTimeout(timer)
  }, [map, onBoundsChange])

  return null
}

export function Map({ center, zoom, hoursAgo = 4, onConfirm, onDispute, onSightingsChange }: MapProps) {
  const geolocation = useGeolocation()
  const mapCenter = center || cityConfig.defaultCenter
  const mapZoom = zoom || cityConfig.defaultZoom
  const [mapBounds, setMapBounds] = useState<{ sw: [number, number]; ne: [number, number] } | null>(null)

  // Use geolocation if available, otherwise use city center
  const currentLat = geolocation.lat ?? mapCenter[0]
  const currentLng = geolocation.lng ?? mapCenter[1]

  // Use state-wide radius (250 miles covers entire Oklahoma state)
  const { sightings, setSightings, loading } = useSightings(
    currentLat,
    currentLng,
    250, // Increased from 10 to cover entire state
    hoursAgo
  )

  // Subscribe to realtime updates
  useRealtimeSightings(setSightings)

  // Filter sightings based on visible map bounds
  const visibleSightings = useMemo(() => {
    if (!mapBounds) return sightings
    return sightings.filter((sighting) =>
      isWithinBounds(sighting.lat, sighting.lng, mapBounds)
    )
  }, [sightings, mapBounds])

  // Notify parent of filtered sightings
  useEffect(() => {
    onSightingsChange?.(visibleSightings)
  }, [visibleSightings, onSightingsChange])

  const confirmLimit = useRateLimit('confirm')
  const disputeLimit = useRateLimit('dispute')

  const handleConfirm = async (id: string) => {
    if (onConfirm) {
      await onConfirm(id)
    } else {
      // Fallback if no handler provided
      if (!confirmLimit.canPerformAction(id)) {
        alert('Rate limit exceeded. Please wait a moment.')
        return
      }

      const { error } = await supabase.rpc('confirm_sighting', {
        sighting_id: id,
      })

      if (error) {
        console.error('Error confirming sighting:', error)
      }
    }
  }

  const handleDispute = async (id: string) => {
    if (onDispute) {
      await onDispute(id)
    } else {
      // Fallback if no handler provided
      if (!disputeLimit.canPerformAction(id)) {
        alert('Rate limit exceeded. Please wait a moment.')
        return
      }

      const { error } = await supabase.rpc('dispute_sighting', {
        sighting_id: id,
      })

      if (error) {
        console.error('Error disputing sighting:', error)
      }
    }
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        className="h-full w-full z-0"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBoundsTracker onBoundsChange={setMapBounds} />
        {visibleSightings.map((sighting) => (
          <SightingMarker
            key={sighting.id}
            sighting={sighting}
            onConfirm={handleConfirm}
            onDispute={handleDispute}
          />
        ))}
      </MapContainer>
      {loading && (
        <div className="absolute top-4 left-4 z-40 bg-card/95 backdrop-blur-sm px-3 py-2 rounded-md text-sm border shadow-sm">
          Loading sightings...
        </div>
      )}
    </div>
  )
}
