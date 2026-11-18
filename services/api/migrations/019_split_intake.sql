ALTER TABLE source_messages ADD COLUMN fragment_sender text;
ALTER TABLE source_messages ADD COLUMN fragment_role text CHECK(fragment_role IN ('username','name','credential'));
ALTER TABLE source_messages ADD COLUMN fragment_expires timestamptz;
ALTER TABLE source_messages ADD COLUMN fragment_message_at timestamptz;
ALTER TABLE source_messages ADD COLUMN fragment_count integer NOT NULL DEFAULT 1;

CREATE INDEX source_fragment_candidates_idx ON source_messages(session_id,group_id,fragment_sender,received_at)
WHERE fragment_expires IS NOT NULL;
CREATE INDEX source_fragment_expiry_idx ON source_messages(fragment_expires) WHERE fragment_expires IS NOT NULL;
