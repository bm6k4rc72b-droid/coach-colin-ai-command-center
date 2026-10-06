import { Marker, Popup, useMap } from 'react-leaflet'
import { Icon } from 'leaflet'
import { useTranslation } from 'react-i18next'
import type { Sighting } from '@/types'
import { getConfidenceLevel } from '@/lib/confidence'
import { formatTimeAgo } from '@/lib/geo'
import { ConfidenceBadge } from './ConfidenceBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Create confidence-colored markers
function createConfidenceIcon(level: 'low' | 'medium' | 'high'): Icon {
  const colors = {
    low: '#6b7280', // gray
    medium: '#eab308', // yellow
    high: '#ef4444', // red
  }

  const svgIcon = `
    <svg width="25" height="41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 8.5 12.5 28.5 12.5 28.5S25 21 25 12.5C25 5.596 19.404 0 12.5 0z" fill="${colors[level]}"/>
      <circle cx="12.5" cy="12.5" r="6" fill="white"/>
    </svg>
  `

  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svgIcon)}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  })
}

interface SightingMarkerProps {
  sighting: Sighting
  onConfirm: (id: string) => Promise<void>
  onDispute: (id: string) => Promise<void>
}

function PopupContent({
  sighting,
  onConfirm,
  onDispute,
}: {
  sighting: Sighting
  onConfirm: (id: string) => Promise<void>
  onDispute: (id: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const map = useMap()

  const handleAction = async (action: () => Promise<void>) => {
    try {
      await action()
      // Close the popup after successful action
      // Use a small delay to ensure the action completes
      setTimeout(() => {
        map.closePopup()
      }, 200)
    } catch (error) {
      // Rate limit errors are expected and already shown to user via alert
      // Only log unexpected errors
      if (error instanceof Error && !error.message.includes('Rate limit exceeded')) {
        console.error('Action error:', error)
      }
      // Don't close on error so user can see what happened
    }
  }

  return (
    <Card className="w-64 border bg-white dark:bg-card shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold capitalize text-gray-900 dark:text-foreground">
            {t(`activity.${sighting.activity_type}`)}
          </CardTitle>
          <ConfidenceBadge score={sighting.confidence_score} />
        </div>
        <p className="text-xs text-gray-600 dark:text-muted-foreground">
          {t('map.reported')} {formatTimeAgo(new Date(sighting.created_at))}{' '}
          {t('map.ago')}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {(sighting.vehicle_count !== null ||
          sighting.agent_count !== null) && (
          <div className="text-xs text-gray-600 dark:text-muted-foreground">
            {sighting.vehicle_count !== null && (
              <div>{t('report.vehicleCount')}: {sighting.vehicle_count}</div>
            )}
            {sighting.agent_count !== null && (
              <div>{t('report.agentCount')}: {sighting.agent_count}</div>
            )}
          </div>
        )}
        {sighting.description && (
          <p className="text-sm text-gray-900 dark:text-foreground">{sighting.description}</p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction(() => onConfirm(sighting.id))}
            className="flex-1"
          >
            {t('map.stillThere')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction(() => onDispute(sighting.id))}
            className="flex-1"
          >
            {t('map.gone')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SightingMarker({
  sighting,
  onConfirm,
  onDispute,
}: SightingMarkerProps) {
  const level = getConfidenceLevel(sighting.confidence_score)
  const markerIcon = createConfidenceIcon(level)

  return (
    <Marker
      position={[sighting.lat, sighting.lng]}
      icon={markerIcon}
    >
      <Popup className="sighting-popup" closeButton={true}>
        <PopupContent
          sighting={sighting}
          onConfirm={onConfirm}
          onDispute={onDispute}
        />
      </Popup>
    </Marker>
  )
}
