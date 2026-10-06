-- Schedule cron job to archive expired sightings every 15 minutes
-- Note: This requires pg_cron extension to be enabled in Supabase
-- Run this manually in Supabase SQL editor if pg_cron is available

-- select cron.schedule(
--   'archive-expired',
--   '*/15 * * * *',
--   'select archive_expired_sightings();'
-- );

