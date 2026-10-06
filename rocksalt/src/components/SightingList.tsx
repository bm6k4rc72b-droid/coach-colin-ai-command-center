import { useTranslation } from 'react-i18next'
import { SightingCard } from './SightingCard'
import { TimeFilter } from './TimeFilter'
import type { Sighting } from '@/types'

interface SightingListProps {
  sightings: Sighting[]
  hoursAgo: number
  onHoursChange: (hours: number) => void
  userLocation?: { lat: number; lng: number }
  onConfirm: (id: string) => Promise<void>
  onDispute: (id: string) => Promise<void>
}

export function SightingList({
  sightings,
  hoursAgo,
  onHoursChange,
  userLocation,
  onConfirm,
  onDispute,
}: SightingListProps) {
  const { t } = useTranslation()

  return (
    <div className="h-full flex flex-col bg-white dark:bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-200 dark:border-border bg-white dark:bg-background">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-foreground">{t('map.nearbySightings')}</h2>
            <p className="text-sm text-gray-600 dark:text-muted-foreground">{t('map.lastHours')} {hoursAgo} {t('map.hours')}</p>
          </div>
        </div>
        <TimeFilter hoursAgo={hoursAgo} onChange={onHoursChange} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {sightings.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>{t('map.noSightings')} {hoursAgo} {t('map.hours')}</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {sightings.map((sighting) => (
              <SightingCard
                key={sighting.id}
                sighting={sighting}
                userLocation={userLocation}
                onConfirm={onConfirm}
                onDispute={onDispute}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

