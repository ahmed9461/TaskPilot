ALTER TABLE whatsapp_sessions DROP CONSTRAINT whatsapp_sessions_provider_check;
ALTER TABLE whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_provider_check CHECK(provider IN ('mock','baileys'));
ALTER TABLE whatsapp_sessions ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE whatsapp_sessions ADD COLUMN connect_requested boolean NOT NULL DEFAULT false;
ALTER TABLE whatsapp_sessions ADD COLUMN auth_epoch uuid;
ALTER TABLE whatsapp_sessions ADD COLUMN receiving_since timestamptz;
ALTER TABLE whatsapp_sessions ADD COLUMN connected_at timestamptz;
ALTER TABLE whatsapp_sessions ADD COLUMN last_error_code text;
CREATE UNIQUE INDEX one_requested_live_session_idx ON whatsapp_sessions((true)) WHERE provider='baileys' AND connect_requested=true;
CREATE TABLE whatsapp_auth (
 session_id uuid NOT NULL REFERENCES whatsapp_sessions ON DELETE CASCADE,
 category text NOT NULL, id_hash text NOT NULL, encrypted_payload text NOT NULL,
 key_version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,category,id_hash)
);
ALTER TABLE source_messages ADD COLUMN encrypted_transport_key text;
CREATE TABLE whatsapp_ingress (
 id bigserial PRIMARY KEY, session_id uuid NOT NULL REFERENCES whatsapp_sessions,
 group_id uuid NOT NULL REFERENCES groups, external_message_id text NOT NULL,
 encrypted_payload text, state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','DONE','DROPPED','ERROR')),
 attempts integer NOT NULL DEFAULT 0, last_error_code text,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,group_id,external_message_id)
);
CREATE INDEX whatsapp_ingress_pending_idx ON whatsapp_ingress(id) WHERE state='PENDING';
