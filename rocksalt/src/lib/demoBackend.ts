import type { SupabaseClient } from '@supabase/supabase-js'

// Browser-only stand-in for the Supabase backend, mirroring the SQL in
// supabase/migrations/003_create_functions.sql. Nothing leaves the device.

interface StoredSighting {
  id: string
  created_at: string
  expires_at: string
  lat: number
  lng: number
  activity_type: string
  vehicle_count: number | null
  agent_count: number | null
  description: string | null
  photo_path: string | null
  confidence_score: number
  confirmations: number
  disputes: number
  archived: boolean
}

type Listener = (payload: { new: Record<string, unknown> }) => void

const STORE_KEY = 'rocksalt-demo-sightings'
const TTL_MS = 4 * 60 * 60 * 1000
const listeners = new Set<{ event: string; cb: Listener }>()

function load(): StoredSighting[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]')
  } catch {
    return []
  }
}

function save(rows: StoredSighting[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(rows))
  } catch {
    // Storage unavailable (private mode): keep working in memory for this page.
  }
}

function emit(event: 'INSERT' | 'UPDATE', row: StoredSighting) {
  const payload = {
    new: { ...row, location: { coordinates: [row.lng, row.lat] } },
  }
  listeners.forEach((l) => {
    if (l.event === event || l.event === '*') l.cb(payload)
  })
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(a))
}

function parsePoint(wkt: string): { lat: number; lng: number } {
  const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(wkt)
  return m ? { lng: Number(m[1]), lat: Number(m[2]) } : { lat: 0, lng: 0 }
}

function isLive(s: StoredSighting) {
  return !s.archived && new Date(s.expires_at).getTime() > Date.now()
}

const rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {
  get_nearby_sightings({ lat, lng, radius_miles = 10, hours_ago = 4 }) {
    const since = Date.now() - Number(hours_ago) * 3600_000
    return load()
      .filter((s) => isLive(s) && new Date(s.created_at).getTime() > since)
      .filter((s) => s.confidence_score >= 10)
      .map((s) => ({
        ...s,
        distance_miles: milesBetween(Number(lat), Number(lng), s.lat, s.lng),
      }))
      .filter((s) => s.distance_miles <= Number(radius_miles))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  confirm_sighting({ sighting_id }) {
    const rows = load()
    const s = rows.find((r) => r.id === sighting_id)
    if (s && isLive(s) && s.confirmations < 3) {
      s.confirmations += 1
      s.confidence_score = Math.min(100, s.confidence_score + 10)
      save(rows)
      emit('UPDATE', s)
    }
    return null
  },
  dispute_sighting({ sighting_id }) {
    const rows = load()
    const s = rows.find((r) => r.id === sighting_id)
    if (s && isLive(s)) {
      s.disputes += 1
      s.archived = s.confidence_score - 15 < 10
      s.confidence_score = Math.max(0, s.confidence_score - 15)
      save(rows)
      emit('UPDATE', s)
    }
    return null
  },
}

export function createDemoClient(): SupabaseClient {
  const client = {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const fn = rpcs[name]
      if (!fn) return { data: null, error: { message: `Unknown RPC ${name}` } }
      return { data: fn(args), error: null }
    },
    from() {
      return {
        async insert(values: Record<string, unknown>) {
          const { lat, lng } = parsePoint(String(values.location))
          const now = new Date()
          const row: StoredSighting = {
            id: crypto.randomUUID(),
            created_at: now.toISOString(),
            expires_at: new Date(now.getTime() + TTL_MS).toISOString(),
            lat,
            lng,
            activity_type: String(values.activity_type),
            vehicle_count: (values.vehicle_count as number) ?? null,
            agent_count: (values.agent_count as number) ?? null,
            description: (values.description as string) ?? null,
            photo_path: (values.photo_path as string) ?? null,
            confidence_score: Number(values.confidence_score) || 50,
            confirmations: 0,
            disputes: 0,
            archived: false,
          }
          const rows = load().filter(isLive)
          rows.unshift(row)
          save(rows)
          emit('INSERT', row)
          return { data: null, error: null }
        },
      }
    },
    storage: {
      from() {
        return {
          // Demo photos are kept as data URLs; the EXIF has already been stripped.
          async upload(...[, blob]: [string, Blob]) {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result))
              reader.onerror = reject
              reader.readAsDataURL(blob)
            })
            return { data: { path: dataUrl }, error: null }
          },
        }
      },
    },
    channel() {
      const mine: { event: string; cb: Listener }[] = []
      const ch = {
        on(_type: string, filter: { event: string }, cb: Listener) {
          mine.push({ event: filter.event, cb })
          return ch
        },
        subscribe() {
          mine.forEach((l) => listeners.add(l))
          return ch
        },
        _mine: mine,
      }
      return ch
    },
    removeChannel(ch: { _mine?: { event: string; cb: Listener }[] }) {
      ch._mine?.forEach((l) => listeners.delete(l))
      return Promise.resolve('ok')
    },
  }
  return client as unknown as SupabaseClient
}
