import { AlertCard } from './AlertCard'
import { useSightings } from '@/hooks/useSightings'
import { useRealtimeSightings } from '@/hooks/useRealtimeSightings'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useRateLimit } from '@/hooks/useRateLimit'
import { cityConfig } from '@/config/city'
import { getConfidenceLevel } from '@/lib/confidence'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

export function AlertsView() {
  const { t } = useTranslation()
  const geolocation = useGeolocation()
  const mapCenter = cityConfig.defaultCenter

  const currentLat = geolocation.lat ?? mapCenter[0]
  const currentLng = geolocation.lng ?? mapCenter[1]

  // Use state-wide radius (250 miles covers entire Oklahoma state)
  const { sightings, setSightings, loading } = useSightings(currentLat, currentLng, 250, 24)

  // Subscribe to realtime updates
  useRealtimeSightings(setSightings)

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

  // Transform sightings into alerts
  const now = Date.now()
  const alerts = sightings.slice(0, 10).map((sighting) => {
    const confidenceLevel = getConfidenceLevel(sighting.confidence_score)
    const createdDate = new Date(sighting.created_at)
    const hoursAgo = (now - createdDate.getTime()) / (1000 * 60 * 60)

    // Determine alert type and message
    let type: 'new' | 'confirmed' | 'expired' = 'new'
    let message = ''

    if (hoursAgo > 8) {
      type = 'expired'
      message = t('alerts.expired')
    } else if (sighting.confirmations > 0) {
      type = 'confirmed'
      message = `${t(`activity.${sighting.activity_type}`)} ${t('alerts.confirmedByCommunity')}`
    } else {
      type = 'new'
      message = `${t('alerts.newSightingReported')} ${t(`activity.${sighting.activity_type}`)} ${t('alerts.sightingReported')}`
    }

    return {
      id: sighting.id,
      message,
      lat: sighting.lat,
      lng: sighting.lng,
      timeAgo: createdDate,
      type,
      confidenceLevel,
      photoPath: sighting.photo_path,
    }
  })

  return (
    <div className="h-full flex flex-col bg-white dark:bg-background overflow-y-auto pb-16">
      {/* Header */}
      <div className="px-4 pt-4 pb-6 border-b border-gray-200 dark:border-border">
        <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-foreground">{t('alerts.recentAlerts')}</h1>
        <p className="text-gray-600 dark:text-muted-foreground">{t('alerts.subtitle')}</p>
      </div>

      {/* Alerts List */}
      <div className="flex-1 px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">{t('alerts.loading')}</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">{t('alerts.noAlerts')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                sightingId={alert.id}
                message={alert.message}
                lat={alert.lat}
                lng={alert.lng}
                timeAgo={alert.timeAgo}
                type={alert.type}
                confidenceLevel={alert.confidenceLevel}
                photoPath={alert.photoPath}
                onConfirm={handleConfirm}
                onDispute={handleDispute}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

