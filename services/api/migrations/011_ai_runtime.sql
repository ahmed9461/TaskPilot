CREATE TABLE ai_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 provider text NOT NULL DEFAULT 'deepseek' CHECK(provider IN ('deepseek','openrouter')),
 model text NOT NULL DEFAULT 'deepseek-flash', enabled boolean NOT NULL DEFAULT false,
 outbound_approved boolean NOT NULL DEFAULT false,
 daily_request_limit integer NOT NULL DEFAULT 20 CHECK(daily_request_limit BETWEEN 1 AND 100),
 daily_token_limit integer NOT NULL DEFAULT 10000 CHECK(daily_token_limit BETWEEN 1000 AND 100000),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ai_settings(id) VALUES(true);
CREATE TABLE ai_requests (
 id uuid PRIMARY KEY, idempotency_hash text NOT NULL UNIQUE,
 source_id uuid REFERENCES source_messages(id) ON DELETE SET NULL,
 source_version integer NOT NULL, settings_version integer NOT NULL,
 provider text NOT NULL, model text NOT NULL,
 status text NOT NULL CHECK(status IN ('REQUESTED','SUCCEEDED','UNAVAILABLE')),
 candidate_codes jsonb NOT NULL, task_code text, confidence double precision,
 reserved_tokens integer NOT NULL CHECK(reserved_tokens>=0),
 prompt_tokens integer, completion_tokens integer,
 estimated_cost_usd numeric, reported_cost_usd numeric,
 error_code text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX ai_requests_daily ON ai_requests(created_at DESC);
