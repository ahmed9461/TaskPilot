CREATE TABLE key_rotation_runs (
 id text PRIMARY KEY CHECK(id ~ '^rotation-[0-9]+$'),
 key_version integer NOT NULL CHECK(key_version>1),
 counts jsonb NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now()
);
