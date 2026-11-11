ALTER TABLE assignments ADD COLUMN priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 100);
CREATE TABLE group_rules (
 id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES groups ON DELETE CASCADE,
 task_type_id uuid NOT NULL REFERENCES task_types, keywords text[] NOT NULL,
 priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 100),
 enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(cardinality(keywords) BETWEEN 1 AND 20)
);
CREATE INDEX group_rules_group_idx ON group_rules(group_id,enabled,priority DESC);
ALTER TABLE source_messages ADD COLUMN routing_task_type_id uuid REFERENCES task_types;
ALTER TABLE source_messages ADD COLUMN routing_priority smallint NOT NULL DEFAULT 0;
ALTER TABLE source_messages ADD COLUMN routing_ambiguous boolean NOT NULL DEFAULT false;
