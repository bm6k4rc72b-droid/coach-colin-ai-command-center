/**
 * Geocoding utility using OpenStreetMap Nominatim API
 * Free, no API key required, but has usage limits
 */

export interface GeocodeResult {
  lat: number
  lng: number
  display_name: string
}

export async function geocodeAddress(
  query: string,
  cityBounds?: { sw: [number, number]; ne: [number, number] }
): Promise<GeocodeResult[]> {
  try {
    // Build Nominatim API URL
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '5',
      addressdetails: '1',
    })

    // Add city bounds if provided (viewbox parameter)
    if (cityBounds) {
      const { sw, ne } = cityBounds
      params.append('viewbox', `${sw[1]},${sw[0]},${ne[1]},${ne[0]}`)
      params.append('bounded', '1')
    }

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'Rocksalt/1.0', // Required by Nominatim
      },
    })

    if (!response.ok) {
      throw new Error('Geocoding failed')
    }

    const data = await response.json()

    return data.map((item: any) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      display_name: item.display_name,
    }))
  } catch (error) {
    console.error('Geocoding error:', error)
    throw error
  }
}

/**
 * Reverse geocoding: Get address from coordinates
 * Uses Nominatim reverse geocoding API
 * Intelligently parses structured address data to return meaningful location names
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lng.toString(),
      format: 'json',
      addressdetails: '1',
      zoom: '18', // More detailed address
    })

    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: {
        'User-Agent': 'Rocksalt/1.0', // Required by Nominatim
      },
    })

    if (!response.ok) {
      throw new Error('Reverse geocoding failed')
    }

    const data = await response.json()
    
    if (!data) {
      return null
    }

    const address = data.address || {}
    
    // Helper function to truncate at word boundary
    const truncate = (str: string, maxLength: number = 30): string => {
      if (str.length <= maxLength) return str
      const truncated = str.substring(0, maxLength)
      const lastSpace = truncated.lastIndexOf(' ')
      return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...'
    }
    
    // Priority 1: Named place (POI, business, landmark) - truncate if needed
    if (data.name && data.name !== data.display_name?.split(',')[0]) {
      return truncate(data.name, 30)
    }
    
    // Priority 2: Street address (house_number + road) - usually short enough
    if (address.house_number && address.road) {
      const streetAddr = `${address.house_number} ${address.road}`
      return truncate(streetAddr, 30)
    }
    
    // Priority 3: Just road name - truncate if needed
    if (address.road) {
      return truncate(address.road, 30)
    }
    
    // Priority 4: Neighborhood
    if (address.neighbourhood) {
      return truncate(address.neighbourhood, 30)
    }
    
    // Priority 5: City/Town/Village - usually short
    if (address.city) {
      return address.city
    }
    if (address.town) {
      return address.town
    }
    if (address.village) {
      return address.village
    }
    
    // Priority 6: Suburb
    if (address.suburb) {
      return truncate(address.suburb, 30)
    }
    
    // Fallback: First part of display_name (before first comma) - truncate
    if (data.display_name) {
      return truncate(data.display_name.split(',')[0].trim(), 30)
    }
    
    return null
  } catch (error) {
    console.error('Reverse geocoding error:', error)
    return null
  }
}

