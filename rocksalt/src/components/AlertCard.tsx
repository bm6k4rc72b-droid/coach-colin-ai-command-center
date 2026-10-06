import { useState, useRef } from 'react'
import { photoUrl } from '@/lib/supabase'
import { Clock, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatTimeAgo } from '@/lib/geo'
import { useAddress } from '@/hooks/useAddress'

interface AlertCardProps {
  sightingId: string
  message: string
  lat: number
  lng: number
  timeAgo: Date
  type: 'new' | 'confirmed' | 'expired'
  confidenceLevel?: 'low' | 'medium' | 'high'
  photoPath?: string | null
  onConfirm: (id: string) => Promise<void>
  onDispute: (id: string) => Promise<void>
}

const alertColors = {
  new: 'bg-orange-50 border-orange-200',
  confirmed: 'bg-green-50 border-green-200',
  expired: 'bg-gray-50 border-gray-200',
}

const confidenceDots = {
  low: 'bg-gray-500',
  medium: 'bg-orange-500',
  high: 'bg-red-500',
}

export function AlertCard({ 
  sightingId, 
  message, 
  lat,
  lng,
  timeAgo, 
  type, 
  confidenceLevel,
  photoPath,
  onConfirm,
  onDispute 
}: AlertCardProps) {
  const { t } = useTranslation()
  const colorClass = alertColors[type]
  const dotColor = confidenceLevel ? confidenceDots[confidenceLevel] : undefined
  const location = useAddress(lat, lng) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  
  const [confirming, setConfirming] = useState(false)
  const [disputing, setDisputing] = useState(false)
  const [showUpdateMessage, setShowUpdateMessage] = useState(false)
  const processingRef = useRef(false) // Prevent multiple simultaneous clicks

  return (
    <div className={cn('rounded-lg border p-4 space-y-3', colorClass)}>
      {photoPath && (
        <img
          src={photoUrl(photoPath)}
          alt="Sighting"
          className="w-full h-48 object-cover rounded-md mb-2"
        />
      )}
      <p className="font-medium text-sm">{message}</p>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <MapPin className="h-4 w-4" />
          <span className="truncate">{location}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{formatTimeAgo(timeAgo)} ago</span>
          </div>
          {dotColor && <div className={cn('w-2 h-2 rounded-full', dotColor)} />}
        </div>
      </div>
      
      {/* Action Buttons - only show for non-expired alerts */}
      {type !== 'expired' && (
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
                    await onConfirm(sightingId)
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
                    await onDispute(sightingId)
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
      )}
    </div>
  )
}

