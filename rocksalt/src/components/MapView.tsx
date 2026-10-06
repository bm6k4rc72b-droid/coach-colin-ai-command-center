import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Map } from './Map'
import { SightingList } from './SightingList'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useRateLimit } from '@/hooks/useRateLimit'
import { supabase } from '@/lib/supabase'
import type { Sighting } from '@/types'

export function MapView() {
  const { t } = useTranslation()
  const [hoursAgo, setHoursAgo] = useState(4)
  const [visibleSightings, setVisibleSightings] = useState<Sighting[]>([])
  const geolocation = useGeolocation()

  const confirmLimit = useRateLimit('confirm')
  const disputeLimit = useRateLimit('dispute')

  const handleConfirm = async (id: string) => {
    if (!confirmLimit.canPerformAction(id)) {
      alert(t('map.rateLimitExceeded'))
      throw new Error('Rate limit exceeded')
    }

    const { error } = await supabase.rpc('confirm_sighting', {
      sighting_id: id,
    })

    if (error) {
      console.error('Error confirming sighting:', error)
      alert(t('map.errorConfirming'))
      throw error
    }
  }

  const handleDispute = async (id: string) => {
    if (!disputeLimit.canPerformAction(id)) {
      alert(t('map.rateLimitExceeded'))
      throw new Error('Rate limit exceeded')
    }

    const { error } = await supabase.rpc('dispute_sighting', {
      sighting_id: id,
    })

    if (error) {
      console.error('Error disputing sighting:', error)
      alert(t('map.errorDisputing'))
      throw error
    }
  }

  const userLocation =
    geolocation.lat && geolocation.lng
      ? { lat: geolocation.lat, lng: geolocation.lng }
      : undefined

  return (
    <div className="h-full flex flex-col">
      {/* Map - takes ~60% of screen */}
      <div className="h-[60%] shrink-0">
        <Map
          hoursAgo={hoursAgo}
          onConfirm={handleConfirm}
          onDispute={handleDispute}
          onSightingsChange={setVisibleSightings}
        />
      </div>

      {/* Sighting List - takes remaining space */}
      <div className="flex-1 min-h-0">
        <SightingList
          sightings={visibleSightings}
          hoursAgo={hoursAgo}
          onHoursChange={setHoursAgo}
          userLocation={userLocation}
          onConfirm={handleConfirm}
          onDispute={handleDispute}
        />
      </div>
    </div>
  )
}

