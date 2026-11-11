CREATE TABLE client_sessions (
 id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 reauth_hash text, reauth_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_sessions_expiry_idx ON client_sessions(expires_at);
