ALTER TABLE reply_jobs ADD COLUMN batch_id uuid;
CREATE INDEX reply_jobs_batch_idx ON reply_jobs(batch_id) WHERE batch_id IS NOT NULL;
