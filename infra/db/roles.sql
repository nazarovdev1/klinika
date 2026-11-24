-- Production roles (run once as a superuser / the database owner). Replace the passwords.
--
--   shifo_owner : owns the schema, runs migrations, used by system() (DATABASE_SYSTEM_URL). Exempt from RLS.
--   shifo_app   : used by the API for tenant queries (DATABASE_URL). NOT the owner, so RLS policies apply.
--
-- Then:  psql -f infra/db/rls.sql   (as shifo_owner)   and run the API with DB_RLS=on.

CREATE ROLE shifo_owner LOGIN PASSWORD 'CHANGE_ME_OWNER';
CREATE ROLE shifo_app LOGIN PASSWORD 'CHANGE_ME_APP' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

ALTER DATABASE shifo OWNER TO shifo_owner;
GRANT CONNECT ON DATABASE shifo TO shifo_app;

-- After migrations have been applied by shifo_owner:
GRANT USAGE ON SCHEMA public TO shifo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO shifo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO shifo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE shifo_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shifo_app;

-- The app role must never be able to rewrite history.
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM shifo_app;
