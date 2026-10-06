-- Get nearby sightings
create or replace function get_nearby_sightings(
  lat double precision,
  lng double precision,
  radius_miles int default 10,
  hours_ago int default 4
)
returns table (
  id uuid,
  created_at timestamptz,
  lat double precision,
  lng double precision,
  activity_type text,
  vehicle_count int,
  agent_count int,
  description text,
  photo_path text,
  confidence_score int,
  distance_miles double precision
)
language sql
as $$
  select
    s.id,
    s.created_at,
    st_y(s.location::geometry) as lat,
    st_x(s.location::geometry) as lng,
    s.activity_type,
    s.vehicle_count,
    s.agent_count,
    s.description,
    s.photo_path,
    s.confidence_score,
    st_distance(s.location, st_point(lng, lat)::geography) / 1609.34 as distance_miles
  from sightings s
  where s.archived = false
    and s.expires_at > now()
    and s.created_at > now() - (hours_ago || ' hours')::interval
    and s.confidence_score >= 10
    and st_dwithin(s.location, st_point(lng, lat)::geography, radius_miles * 1609.34)
  order by s.created_at desc;
$$;

-- Confirm sighting (increases confidence)
-- SECURITY DEFINER allows function to bypass RLS for updates
create or replace function confirm_sighting(sighting_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update sightings
  set 
    confirmations = confirmations + 1,
    confidence_score = least(100, confidence_score + 10)
  where id = sighting_id
    and confirmations < 3
    and archived = false
    and expires_at > now();
end;
$$;

-- Dispute sighting (decreases confidence)
-- SECURITY DEFINER allows function to bypass RLS for updates
create or replace function dispute_sighting(sighting_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update sightings
  set 
    disputes = disputes + 1,
    confidence_score = greatest(0, confidence_score - 15),
    archived = (confidence_score - 15 < 10)
  where id = sighting_id
    and archived = false
    and expires_at > now();
end;
$$;

-- Get subscribers in range of a location
create or replace function get_subscribers_in_range(
  lat double precision,
  lng double precision
)
returns table (
  id uuid,
  phone_hash text,
  distance_miles double precision
)
language sql
as $$
  select
    s.id,
    s.phone_hash,
    st_distance(s.location, st_point(lng, lat)::geography) / 1609.34 as distance_miles
  from subscribers s
  where s.active = true
    and st_dwithin(s.location, st_point(lng, lat)::geography, s.radius_miles * 1609.34);
$$;

-- Archive expired sightings (run via cron)
create or replace function archive_expired_sightings()
returns void
language sql
as $$
  update sightings
  set archived = true
  where expires_at < now() or confidence_score < 10;
$$;

