export type ActivityType = 'vehicle' | 'on_foot' | 'checkpoint' | 'raid' | 'unknown'

export interface Sighting {
  id: string
  created_at: string
  lat: number
  lng: number
  activity_type: ActivityType
  vehicle_count: number | null
  agent_count: number | null
  description: string | null
  photo_path: string | null
  confidence_score: number
  confirmations: number
  disputes: number
  distance_miles?: number
}

export interface SightingInput {
  location: { lat: number; lng: number }
  activity_type: ActivityType
  vehicle_count?: number
  agent_count?: number
  description?: string
  photo?: File
}

export interface Subscriber {
  phone: string
  location: { lat: number; lng: number }
  radius_miles: number
}

export type ConfidenceLevel = 'low' | 'medium' | 'high'

