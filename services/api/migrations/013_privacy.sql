ALTER TABLE whatsapp_sessions ADD COLUMN forgotten_at timestamptz;
ALTER TABLE whatsapp_sessions ADD CONSTRAINT forgotten_session_stopped CHECK(forgotten_at IS NULL OR (provider='baileys' AND NOT connect_requested AND status='FORGOTTEN'));
CREATE TABLE retention_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 review_days integer NOT NULL DEFAULT 30 CHECK(review_days BETWEEN 1 AND 365),
 failed_ingress_days integer NOT NULL DEFAULT 14 CHECK(failed_ingress_days BETWEEN 1 AND 90),
 expired_access_days integer NOT NULL DEFAULT 1 CHECK(expired_access_days BETWEEN 1 AND 30),
 read_notification_days integer NOT NULL DEFAULT 90 CHECK(read_notification_days BETWEEN 7 AND 365),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO retention_policy(id) VALUES(true);
CREATE TABLE privacy_runs (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('RETENTION','FORGET_SESSION')),
 session_id uuid REFERENCES whatsapp_sessions(id), counts jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retention_review_age ON source_messages(received_at,id) WHERE state='REVIEW' AND encrypted_payload IS NOT NULL;
CREATE INDEX retention_ingress_age ON whatsapp_ingress(received_at,id) WHERE state='ERROR' AND encrypted_payload IS NOT NULL;
