CREATE TABLE task_followup_notes (
  assignment_id uuid PRIMARY KEY REFERENCES assignments ON DELETE CASCADE,
  ciphertext text,
  due_at timestamptz,
  fired_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX task_followup_due_idx ON task_followup_notes(due_at) WHERE due_at IS NOT NULL AND fired_at IS NULL;
