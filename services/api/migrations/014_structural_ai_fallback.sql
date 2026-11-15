ALTER TABLE ai_settings ADD COLUMN automatic_fallback boolean NOT NULL DEFAULT false;
ALTER TABLE ai_requests ADD COLUMN field_selection jsonb CHECK(field_selection IS NULL OR jsonb_typeof(field_selection)='object');
ALTER TABLE ai_requests DROP CONSTRAINT ai_requests_status_check;
ALTER TABLE ai_requests ADD CONSTRAINT ai_requests_status_check CHECK(status IN ('REQUESTED','SUCCEEDED','UNAVAILABLE','ABSTAINED'));
CREATE INDEX ai_requests_source_version ON ai_requests(source_id,source_version,settings_version);
