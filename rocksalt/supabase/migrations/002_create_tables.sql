-- Sightings table
create table sightings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '8 hours'),
  location geography(point, 4326) not null,
  activity_type text not null check (activity_type in ('vehicle', 'on_foot', 'checkpoint', 'raid', 'unknown')),
  vehicle_count int,
  agent_count int,
  description text check (char_length(description) <= 280),
  photo_path text,
  confidence_score int default 50,
  confirmations int default 0,
  disputes int default 0,
  archived boolean default false
);

-- Spatial index for fast geo queries
create index sightings_location_idx on sightings using gist (location);

-- Index for active sightings
create index sightings_active_idx on sightings (created_at) 
  where archived = false;

-- Alert subscribers table
create table subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  phone_hash text not null,
  location geography(point, 4326) not null,
  radius_miles int not null default 5,
  active boolean default true
);

-- Spatial index for subscriber matching
create index subscribers_location_idx on subscribers using gist (location);

