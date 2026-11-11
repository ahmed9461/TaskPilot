ALTER TABLE reply_templates ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE reply_templates ADD COLUMN enabled boolean NOT NULL DEFAULT true;
ALTER TABLE reply_templates ADD COLUMN group_id uuid REFERENCES groups;
ALTER TABLE reply_templates ADD COLUMN task_type_id uuid REFERENCES task_types;
CREATE INDEX reply_templates_scope_idx ON reply_templates(group_id,task_type_id) WHERE enabled=true;
