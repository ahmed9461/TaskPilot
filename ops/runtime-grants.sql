REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE taskpilot_pilot TO taskpilot_runtime;
GRANT USAGE ON SCHEMA public TO taskpilot_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO taskpilot_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO taskpilot_runtime;
DO $$ BEGIN
 IF to_regclass('public.schema_migrations') IS NOT NULL THEN
  REVOKE ALL ON schema_migrations FROM taskpilot_runtime;
  GRANT SELECT ON schema_migrations TO taskpilot_runtime;
 END IF;
END $$;
