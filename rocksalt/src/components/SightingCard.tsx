import { useState, useRef } from 'react'
import { photoUrl } from '@/lib/supabase'
import { useTranslation } from 'react-i18next'
import { Clock, MapPin, Car, User, Shield, Home, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getConfidenceLevel } from '@/lib/confidence'
import { formatTimeAgo, distanceInMiles } from '@/lib/geo'
import { useAddress } from '@/hooks/useAddress'
import type { Sighting } from '@/types'
import { cn } from '@/lib/utils'

interface SightingCardProps {
  sighting: Sighting
  userLocation?: { lat: number; lng: number }
  onConfirm: (id: string) => Promise<void>
  onDispute: (id: string) => Promise<void>
}

const activityIcons = {
  vehicle: Car,
  on_foot: User,
  checkpoint: Shield,
  raid: Home,
  unknown: HelpCircle,
}

const confidenceColors = {
  low: 'bg-gray-500',
  medium: 'bg-orange-500',
  high: 'bg-red-500',
}

export function SightingCard({
  sighting,
  userLocation,
  onConfirm,
  onDispute,
}: SightingCardProps) {
  const { t } = useTranslation()
  const Icon = activityIcons[sighting.activity_type]
  const level = getConfidenceLevel(sighting.confidence_score)
  const confidenceColor = confidenceColors[level]
  const [confirming, setConfirming] = useState(false)
  const [disputing, setDisputing] = useState(false)
  const [showUpdateMessage, setShowUpdateMessage] = useState(false)
  const processingRef = useRef(false) // Prevent multiple simultaneous clicks

  // Calculate distance if user location available
  const distance =
    userLocation && sighting.lat && sighting.lng
      ? distanceInMiles(userLocation.lat, userLocation.lng, sighting.lat, sighting.lng)
      : null

  // Get address from coordinates
  const locationText = useAddress(sighting.lat, sighting.lng) || `${sighting.lat.toFixed(4)}, ${sighting.lng.toFixed(4)}`

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg p-4 space-y-3 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Activity Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-muted flex items-center justify-center">
          <Icon className="h-5 w-5 text-gray-700 dark:text-foreground" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-semibold text-base capitalize">
              {t(`activity.${sighting.activity_type}`)}
            </h3>
            {/* Confidence Dot */}
            <div className={cn('w-3 h-3 rounded-full flex-shrink-0', confidenceColor)} />
          </div>

          <div className="space-y-1 text-sm text-gray-600 dark:text-muted-foreground">
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span className="truncate">{locationText}</span>
            </div>
            {distance !== null && (
              <div>
                {distance < 0.1
                  ? `< 0.1 ${t('map.miAway')}`
                  : distance < 1
                    ? `${distance.toFixed(1)} ${t('map.miAway')}`
                    : `${Math.round(distance)} ${t('map.miAway')}`}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>
                {formatTimeAgo(new Date(sighting.created_at))} {t('map.ago')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Photo */}
      {sighting.photo_path && (
        <img
          src={photoUrl(sighting.photo_path)}
          alt="Sighting"
          className="w-full h-48 object-cover rounded-md"
        />
      )}

      {/* Action Buttons */}
      <div className="pt-2 border-t border-gray-200 dark:border-border">
        {showUpdateMessage ? (
          <div className="px-3 py-2 bg-primary/10 border border-primary/20 rounded-md text-sm text-primary text-center animate-in fade-in duration-200">
            {t('map.updatingConfidence')}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={confirming || disputing || processingRef.current}
              onClick={async () => {
                // Prevent spam clicking
                if (processingRef.current) return
                
                processingRef.current = true
                setConfirming(true)
                setShowUpdateMessage(true)
                try {
                  await onConfirm(sighting.id)
                  // Show message briefly, then reset smoothly
                  setTimeout(() => {
                    setShowUpdateMessage(false)
                    setConfirming(false)
                    processingRef.current = false
                  }, 1500)
                } catch {
                  // Error already handled in handler
                  setShowUpdateMessage(false)
                  setConfirming(false)
                  processingRef.current = false
                }
              }}
              className="flex-1 transition-all"
            >
              {t('map.stillThere')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={confirming || disputing || processingRef.current}
              onClick={async () => {
                // Prevent spam clicking
                if (processingRef.current) return
                
                processingRef.current = true
                setDisputing(true)
                setShowUpdateMessage(true)
                try {
                  await onDispute(sighting.id)
                  // Show message briefly, then reset smoothly
                  setTimeout(() => {
                    setShowUpdateMessage(false)
                    setDisputing(false)
                    processingRef.current = false
                  }, 1500)
                } catch {
                  // Error already handled in handler
                  setShowUpdateMessage(false)
                  setDisputing(false)
                  processingRef.current = false
                }
              }}
              className="flex-1 transition-all"
            >
              {t('map.gone')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

