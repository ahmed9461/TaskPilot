CREATE INDEX notifications_unread_id_idx ON notifications(id DESC) WHERE read_at IS NULL;
CREATE INDEX audit_action_created_idx ON audit_events(action,created_at DESC,id DESC);
CREATE INDEX audit_target_created_idx ON audit_events(target_id,created_at DESC,id DESC);
