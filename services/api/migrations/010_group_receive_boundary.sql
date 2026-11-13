ALTER TABLE groups ADD COLUMN receive_after timestamptz NOT NULL DEFAULT now();
ALTER TABLE whatsapp_receipts ADD COLUMN first_event_type text NOT NULL DEFAULT 'unknown' CHECK(first_event_type IN ('unknown','notify','append','other'));
ALTER TABLE whatsapp_receipts ADD COLUMN last_event_type text NOT NULL DEFAULT 'unknown' CHECK(last_event_type IN ('unknown','notify','append','other'));
