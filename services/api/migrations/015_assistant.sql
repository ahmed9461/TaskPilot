ALTER TABLE ai_requests ADD COLUMN request_purpose text NOT NULL DEFAULT 'INGEST' CHECK(request_purpose IN ('INGEST','ASSISTANT'));
ALTER TABLE ai_requests ADD COLUMN assistant_plan jsonb CHECK(assistant_plan IS NULL OR jsonb_typeof(assistant_plan)='object');
CREATE TABLE assistant_turns (
 id uuid PRIMARY KEY,
 thread_id uuid NOT NULL,
 parent_id uuid REFERENCES assistant_turns ON DELETE SET NULL,
 request_hash text NOT NULL,
 safe_input jsonb NOT NULL CHECK(jsonb_typeof(safe_input)='object'),
 plan jsonb NOT NULL CHECK(jsonb_typeof(plan)='object'),
 account_ids uuid[] NOT NULL DEFAULT '{}',
 group_id uuid,
 anchor_date date NOT NULL,
 ai_request_id uuid REFERENCES ai_requests ON DELETE SET NULL,
 state text NOT NULL CHECK(state IN ('PLANNING','READY','LOCAL')),
 model_status text NOT NULL DEFAULT 'LOCAL',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(cardinality(account_ids)<=20)
);
CREATE INDEX assistant_turns_thread ON assistant_turns(thread_id,created_at DESC);
CREATE TABLE assistant_action_receipts (
 request_id uuid PRIMARY KEY,
 approval_hash text NOT NULL UNIQUE,
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
