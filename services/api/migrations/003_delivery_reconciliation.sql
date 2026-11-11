ALTER TABLE reply_jobs ADD COLUMN reconciled_at timestamptz;
ALTER TABLE reply_jobs ADD COLUMN reconciliation_evidence text CHECK(reconciliation_evidence IN ('MANUAL','PROVIDER_RECEIPT'));
