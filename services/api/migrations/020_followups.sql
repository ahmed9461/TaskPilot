ALTER TABLE assignments ADD COLUMN activity_key text NOT NULL DEFAULT '';
ALTER TABLE assignments ADD COLUMN activity_label text;
ALTER TABLE assignments DROP CONSTRAINT assignments_account_id_task_type_id_period_key_key;
ALTER TABLE assignments ADD UNIQUE (account_id,task_type_id,period_key,activity_key);

CREATE TABLE account_followups (
  account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id,group_id)
);
