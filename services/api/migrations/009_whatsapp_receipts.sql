-- Diagnostic metadata only: no message bodies, participant JIDs, keys or raw IDs.
CREATE TABLE whatsapp_receipts (
 id bigserial PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 message_hash text NOT NULL CHECK(message_hash ~ '^[a-f0-9]{64}$'),
 first_reason text NOT NULL,
 last_reason text NOT NULL,
 first_flags smallint NOT NULL CHECK(first_flags BETWEEN 0 AND 255),
 last_flags smallint NOT NULL CHECK(last_flags BETWEEN 0 AND 255),
 observations integer NOT NULL DEFAULT 1 CHECK(observations BETWEEN 1 AND 1000000),
 first_seen timestamptz NOT NULL DEFAULT now(),
 last_seen timestamptz NOT NULL DEFAULT now(),
 accepted_at timestamptz,
 UNIQUE(session_id,group_id,message_hash),
 CHECK(first_reason IN ('ACCEPTED_TEXT','INVALID_KEY','FROM_SELF','NO_CONTENT','STALE_TIMESTAMP','UNSUPPORTED_CONTENT','EXPIRING_CONTENT','INVALID_TEXT','HISTORY_EVENT','OTHER_EVENT')),
 CHECK(last_reason IN ('ACCEPTED_TEXT','INVALID_KEY','FROM_SELF','NO_CONTENT','STALE_TIMESTAMP','UNSUPPORTED_CONTENT','EXPIRING_CONTENT','INVALID_TEXT','HISTORY_EVENT','OTHER_EVENT'))
);
CREATE INDEX whatsapp_receipts_recent ON whatsapp_receipts(last_seen DESC,id DESC);
CREATE INDEX whatsapp_receipts_session ON whatsapp_receipts(session_id,last_seen DESC);
