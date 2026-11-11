CREATE TABLE whatsapp_sessions (
 id uuid PRIMARY KEY, label text NOT NULL, provider text NOT NULL CHECK(provider='mock'),
 status text NOT NULL DEFAULT 'MOCK', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE task_types (id uuid PRIMARY KEY, code text UNIQUE NOT NULL, name text NOT NULL);
CREATE TABLE groups (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES whatsapp_sessions, external_group_id text NOT NULL,
 title text NOT NULL, enabled boolean NOT NULL DEFAULT true, task_type_id uuid NOT NULL REFERENCES task_types,
 namespace text NOT NULL, period_key text NOT NULL, version integer NOT NULL DEFAULT 1,
 UNIQUE(session_id,external_group_id), UNIQUE(id,session_id)
);
CREATE TABLE accounts (
 id uuid PRIMARY KEY, namespace text NOT NULL, username_normalized text NOT NULL, display_name text NOT NULL,
 archived_at timestamptz, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(namespace,username_normalized)
);
CREATE TABLE account_credentials (
 account_id uuid PRIMARY KEY REFERENCES accounts ON DELETE CASCADE, ciphertext text NOT NULL,
 key_version integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE source_messages (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES whatsapp_sessions, group_id uuid NOT NULL,
 external_message_id text NOT NULL, encrypted_payload text, state text NOT NULL CHECK(state IN ('REVIEW','PROCESSED','IGNORED')),
 version integer NOT NULL DEFAULT 1, received_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(group_id,session_id) REFERENCES groups(id,session_id),
 UNIQUE(session_id,group_id,external_message_id), UNIQUE(id,session_id)
);
CREATE TABLE assignments (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 task_type_id uuid NOT NULL REFERENCES task_types, period_key text NOT NULL,
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','NEEDS_REVIEW','IN_PROGRESS','COMPLETED','CANCELED')),
 version integer NOT NULL DEFAULT 1, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,task_type_id,period_key)
);
CREATE TABLE assignment_sources (
 assignment_id uuid NOT NULL REFERENCES assignments ON DELETE CASCADE,
 source_message_id uuid NOT NULL REFERENCES source_messages ON DELETE CASCADE,
 PRIMARY KEY(assignment_id,source_message_id)
);
CREATE TABLE issue_flags (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('INVALID_ACCOUNT_PASSWORD','INVALID_ACCOUNT_CODE','UNVERIFIED_CREDENTIALS')),
 verified boolean NOT NULL, evidence_kind text NOT NULL CHECK(evidence_kind IN ('MANUAL','AUTHORIZED_CHECK','UNVERIFIED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reply_templates (id uuid PRIMARY KEY, code text UNIQUE NOT NULL, body text NOT NULL);
CREATE TABLE approvals (
 token_hash text PRIMARY KEY, purpose text NOT NULL, payload jsonb NOT NULL,
 expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE reply_jobs (
 id uuid PRIMARY KEY, assignment_id uuid NOT NULL REFERENCES assignments ON DELETE CASCADE,
 source_message_id uuid NOT NULL, session_id uuid NOT NULL,
 template_id uuid NOT NULL REFERENCES reply_templates, body text NOT NULL,
 status text NOT NULL CHECK(status IN ('APPROVED','SENDING','SENT','FAILED','UNKNOWN_DELIVERY','CANCELED')),
 idempotency_key text UNIQUE NOT NULL, provider_message_id text, approved_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(source_message_id,session_id) REFERENCES source_messages(id,session_id)
);
CREATE TABLE notifications (
 id bigserial PRIMARY KEY, type text NOT NULL, subject_id uuid, read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
 id bigserial PRIMARY KEY, actor_id text NOT NULL DEFAULT 'owner', action text NOT NULL,
 target_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignments_status_idx ON assignments(status);
CREATE INDEX inbox_review_idx ON source_messages(state, received_at);
CREATE INDEX outbox_pending_idx ON reply_jobs(status);
