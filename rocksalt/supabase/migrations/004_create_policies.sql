-- Enable Row Level Security
alter table sightings enable row level security;
alter table subscribers enable row level security;

-- Sightings: public read for active, public insert
create policy "Public read active sightings"
  on sightings for select
  using (archived = false and expires_at > now());

create policy "Public insert sightings"
  on sightings for insert
  with check (true);

-- Note: UPDATE operations are handled via RPC functions (confirm_sighting, dispute_sighting)
-- which use SECURITY DEFINER to bypass RLS. This is intentional for controlled updates.

-- Subscribers: insert only, no read (privacy)
create policy "Public insert subscribers"
  on subscribers for insert
  with check (true);

-- Grant execute permissions on public functions to anon role
grant execute on function get_nearby_sightings(double precision, double precision, int, int) to anon, authenticated;
grant execute on function confirm_sighting(uuid) to anon, authenticated;
grant execute on function dispute_sighting(uuid) to anon, authenticated;

