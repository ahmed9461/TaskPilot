ALTER TABLE reply_jobs ADD COLUMN image_count smallint NOT NULL DEFAULT 0 CHECK (image_count BETWEEN 0 AND 4);
ALTER TABLE reply_jobs ADD COLUMN image_manifest_hash text;

CREATE TABLE reply_job_images (
  job_id uuid PRIMARY KEY REFERENCES reply_jobs(id) ON DELETE CASCADE,
  ciphertext text NOT NULL
);

CREATE FUNCTION clear_finished_reply_images() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM reply_job_images WHERE job_id=NEW.id;
  RETURN NEW;
END
$$;

CREATE TRIGGER clear_finished_reply_images
AFTER UPDATE OF status ON reply_jobs
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status NOT IN ('APPROVED','SENDING'))
EXECUTE FUNCTION clear_finished_reply_images();
