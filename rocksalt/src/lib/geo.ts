import { cityConfig } from '@/config/city'

/**
 * Checks if a point is within state/city bounds
 */
export function isWithinCityBounds(lat: number, lng: number): boolean {
  const { bounds } = cityConfig
  
  // For negative longitudes (west of prime meridian), sw[1] is more negative than ne[1]
  // So we need: lng >= sw[1] (more west) AND lng <= ne[1] (more east)
  const isWithinLat = lat >= bounds.sw[0] && lat <= bounds.ne[0]
  const isWithinLng = lng >= bounds.sw[1] && lng <= bounds.ne[1]
  
  return isWithinLat && isWithinLng
}

/**
 * Checks if a point is within given bounds
 */
export function isWithinBounds(
  lat: number,
  lng: number,
  bounds: { sw: [number, number]; ne: [number, number] }
): boolean {
  const isWithinLat = lat >= bounds.sw[0] && lat <= bounds.ne[0]
  const isWithinLng = lng >= bounds.sw[1] && lng <= bounds.ne[1]
  return isWithinLat && isWithinLng
}

/**
 * Calculates distance between two points in miles
 */
export function distanceInMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959 // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Formats time ago string
 */
export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (seconds < 60) {
    return `${seconds}s`
  } else if (minutes < 60) {
    return `${minutes}m`
  } else if (hours < 24) {
    return `${hours}h`
  } else {
    const days = Math.floor(hours / 24)
    return `${days}d`
  }
}

