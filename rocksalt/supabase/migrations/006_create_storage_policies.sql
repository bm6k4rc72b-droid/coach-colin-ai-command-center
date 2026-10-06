-- Storage bucket policies for sighting-photos
-- Note: This assumes the bucket 'sighting-photos' already exists
-- Run this after creating the bucket in Supabase Dashboard

-- Allow public read access to photos
create policy "Public read sighting photos"
on storage.objects for select
using (bucket_id = 'sighting-photos');

-- Allow authenticated and anon users to upload photos
create policy "Public insert sighting photos"
on storage.objects for insert
with check (bucket_id = 'sighting-photos');

