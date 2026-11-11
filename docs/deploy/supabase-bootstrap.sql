-- One-time Supabase setup for MovieNight (run as the `postgres` owner via psql).
-- Mirrors the roles/schema the PostgreSQL runtime expects (docs/features/009-durable-storage).
-- Pass passwords as psql variables; never commit them:
--   psql "$ADMIN_URL" -v migrate_pw="$MN_MIGRATION_PASSWORD" -v runtime_pw="$MN_DB_PASSWORD" -f docs/deploy/supabase-bootstrap.sql
CREATE ROLE mn_migrate LOGIN PASSWORD :'migrate_pw';
CREATE ROLE mn_runtime LOGIN PASSWORD :'runtime_pw';
GRANT mn_migrate, mn_runtime TO postgres;   -- lets the owner create objects on their behalf
CREATE SCHEMA movienight AUTHORIZATION mn_migrate;
GRANT USAGE ON SCHEMA movienight TO mn_runtime;
GRANT CONNECT ON DATABASE postgres TO mn_migrate, mn_runtime;
