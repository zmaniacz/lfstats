-- Read-only role for the query API's analytics pool (docs/Query_API_Spec.md).
--
-- Not a migration: it needs a password, and drizzle migrations run as the app owner on
-- every environment. Run once per database as a superuser, then set
--   QUERY_DATABASE_URL=postgresql://lfstats_query:<password>@<host>:5432/<db>
-- in the web app's environment. Without it the pool falls back to DATABASE_URL, still
-- forcing read-only transactions and a statement timeout per session.

CREATE ROLE lfstats_query LOGIN PASSWORD 'change-me';

GRANT CONNECT ON DATABASE lfstats_modern TO lfstats_query;
GRANT USAGE ON SCHEMA public TO lfstats_query;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO lfstats_query;

-- Credentials and auth state are never needed by analytics queries.
REVOKE SELECT ON api_key, api_request_log, auth_account, auth_session, auth_verification_token
  FROM lfstats_query;

-- Tables created by future migrations (run as the owner role, here `lfstats`).
ALTER DEFAULT PRIVILEGES FOR ROLE lfstats IN SCHEMA public
  GRANT SELECT ON TABLES TO lfstats_query;

ALTER ROLE lfstats_query SET default_transaction_read_only = on;
ALTER ROLE lfstats_query SET statement_timeout = '5s';
