import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ActivityTypeSelector } from './ActivityTypeSelector'
import { cityConfig } from '@/config/city'
import { isWithinCityBounds } from '@/lib/geo'
import { calculateInitialConfidence } from '@/lib/confidence'

import { stripExifAndUpload } from '@/lib/exif'
import { geocodeAddress, type GeocodeResult } from '@/lib/geocoding'
import { supabase } from '@/lib/supabase'
import { useGeolocation } from '@/hooks/useGeolocation'
import type { ActivityType, SightingInput } from '@/types'
import { Camera, X, MapPin, Search, Navigation } from 'lucide-react'

interface ReportFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

// Component to handle map clicks for location selection
function LocationPicker({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click: (e) => {
      const { lat, lng } = e.latlng
      if (isWithinCityBounds(lat, lng)) {
        onLocationSelect(lat, lng)
      } else {
        alert('Location must be within Oklahoma state bounds')
      }
    },
  })

  return null
}

// Component to update map center and zoom when location changes
function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()

  useEffect(() => {
    map.setView(center, zoom)
  }, [map, center, zoom])

  return null
}

export function ReportForm({ open, onOpenChange, onSuccess }: ReportFormProps) {
  const { t } = useTranslation()
  const geolocation = useGeolocation()
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState<Omit<SightingInput, 'activity_type'> & { activity_type: ActivityType | null }>({
    location: {
      lat: geolocation.lat ?? cityConfig.defaultCenter[0],
      lng: geolocation.lng ?? cityConfig.defaultCenter[1],
    },
    activity_type: null,
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [addressQuery, setAddressQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Update location when geolocation becomes available
  useEffect(() => {
    if (geolocation.lat && geolocation.lng && open) {
      setFormData((prev) => ({
        ...prev,
        location: {
          lat: geolocation.lat!,
          lng: geolocation.lng!,
        },
      }))
    }
  }, [geolocation.lat, geolocation.lng, open])

  // Reset form when opened or closed
  useEffect(() => {
    if (open) {
      // Reset form when opening to ensure clean state
      setFormData({
        location: {
          lat: geolocation.lat ?? cityConfig.defaultCenter[0],
          lng: geolocation.lng ?? cityConfig.defaultCenter[1],
        },
        activity_type: null,
      })
      setPhoto(null)
      setPhotoPreview(null)
      setAddressQuery('')
      setSearchResults([])
      setSubmitting(false)
    }
  }, [open, geolocation.lat, geolocation.lng])

  // Handle address search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (addressQuery.length < 3) {
      setSearchResults([])
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await geocodeAddress(addressQuery, cityConfig.bounds)
        setSearchResults(results)
      } catch (error) {
        console.error('Geocoding error:', error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 500)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [addressQuery])

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchResults([])
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLocationSelect = (lat: number, lng: number) => {
    setFormData((prev) => ({
      ...prev,
      location: { lat, lng },
    }))
    setSearchResults([])
    setAddressQuery('')
  }

  const handleUseMyLocation = () => {
    if (geolocation.lat && geolocation.lng) {
      handleLocationSelect(geolocation.lat, geolocation.lng)
    } else {
      alert(t('report.locationNotAvailable'))
    }
  }

  const handleAddressSelect = (result: GeocodeResult) => {
    if (isWithinCityBounds(result.lat, result.lng)) {
      handleLocationSelect(result.lat, result.lng)
    } else {
      alert(t('report.locationOutOfBounds'))
    }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhoto(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removePhoto = () => {
    setPhoto(null)
    setPhotoPreview(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.activity_type) {
      alert(t('report.selectActivityType'))
      return
    }

    setSubmitting(true)

    try {
      // Validate location is within bounds
      const isWithinBounds = isWithinCityBounds(formData.location.lat, formData.location.lng)
      if (!isWithinBounds) {
        alert(t('report.locationOutOfBounds'))
        setSubmitting(false)
        return
      }

      // Upload photo if provided
      let photoPath: string | null = null
      if (photo) {
        photoPath = await stripExifAndUpload(photo, supabase)
      }

      // Calculate initial confidence
      const confidenceScore = calculateInitialConfidence(!!photo)

      // Insert sighting - Supabase accepts WKT format for geography
      const { error } = await supabase.from('sightings').insert({
        location: `SRID=4326;POINT(${formData.location.lng} ${formData.location.lat})`,
        activity_type: formData.activity_type,
        vehicle_count: formData.vehicle_count || null,
        agent_count: formData.agent_count || null,
        description: formData.description || null,
        photo_path: photoPath,
        confidence_score: confidenceScore,
      })

      if (error) {
        throw error
      }

      // Reset form immediately after successful submission
      setFormData({
        location: {
          lat: geolocation.lat ?? cityConfig.defaultCenter[0],
          lng: geolocation.lng ?? cityConfig.defaultCenter[1],
        },
        activity_type: null,
      })
      setPhoto(null)
      setPhotoPreview(null)
      setAddressQuery('')
      setSearchResults([])

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Error submitting report:', error)
      alert(t('report.error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-background overflow-y-auto pb-16">
      {/* Header */}
      <div className="px-4 pt-4 pb-6 border-b border-gray-200 dark:border-border">
        <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-foreground">{t('report.title')}</h1>
        <p className="text-gray-600 dark:text-muted-foreground">{t('report.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <div className="flex-1 px-4 py-6 space-y-6">
          {/* Activity Type Selection */}
          <div>
            <label className="text-base font-semibold mb-3 block">
              {t('report.whatDidYouSee')} <span className="text-destructive">{t('report.required')}</span>
            </label>
            <ActivityTypeSelector
              value={formData.activity_type}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  activity_type: value,
                }))
              }
              required={true}
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-base font-semibold mb-3 block">
              {t('report.location')} <span className="text-destructive">{t('report.required')}</span>
            </label>
            
            {/* Address Search */}
            <div className="relative mb-3 z-[1000]" ref={searchRef}>
              <div className="relative z-10">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                <Input
                  type="text"
                  value={addressQuery}
                  onChange={(e) => setAddressQuery(e.target.value)}
                  placeholder={t('report.searchAddress')}
                  className="pl-10 pr-10 relative z-10"
                />
                {addressQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddressQuery('')
                      setSearchResults([])
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 z-20"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              
              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute z-[1001] w-full mt-1 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-md shadow-xl max-h-60 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleAddressSelect(result)}
                      className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-gray-100 dark:border-border last:border-b-0"
                    >
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{result.display_name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {isSearching && (
                <div className="absolute z-[1001] w-full mt-1 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-md shadow-xl px-4 py-3">
                  <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                </div>
              )}
            </div>

            {/* Use My Location Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseMyLocation}
              disabled={!geolocation.lat || !geolocation.lng}
              className="mb-3 w-full"
            >
              <Navigation className="h-4 w-4 mr-2" />
              {t('report.useMyLocation')}
            </Button>

            {/* Map */}
            <div className="h-48 w-full rounded-lg overflow-hidden border-2 border-border bg-muted/30 relative z-0">
              <MapContainer
                center={[formData.location.lat, formData.location.lng]}
                zoom={15}
                className="h-full w-full"
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[formData.location.lat, formData.location.lng]} />
                <LocationPicker
                  onLocationSelect={handleLocationSelect}
                />
                <MapUpdater center={[formData.location.lat, formData.location.lng]} zoom={15} />
              </MapContainer>
              <div className="absolute bottom-2 left-2 right-2 bg-background/90 backdrop-blur-sm px-3 py-2 rounded text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 inline mr-1" />
                {t('report.locationHint')}
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div>
            <label className="text-base font-semibold mb-3 block">
              {t('report.additionalDetails')} <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <Textarea
              value={formData.description || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value || undefined,
                }))
              }
              placeholder={t('report.additionalDetailsPlaceholder')}
              maxLength={280}
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="text-base font-semibold mb-3 block">
              {t('report.photo')} <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={removePhoto}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Camera className="w-8 h-8 mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('report.photo')}</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                />
              </label>
            )}
            {photo && (
              <p className="text-xs text-muted-foreground mt-2">
                {t('report.exifNote')}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-4 py-4 border-t border-gray-200 dark:border-border bg-white dark:bg-background space-y-2">
          <Button 
            type="submit" 
            className="w-full" 
            disabled={submitting} 
            size="lg"
          >
            {submitting ? t('common.loading') : t('report.submit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('report.cancel')}
          </Button>
        </div>
      </form>
    </div>
  )
}
