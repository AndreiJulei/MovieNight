-- Ticket 7 added Movie.logoUrl to the entity without a PostgreSQL migration.
ALTER TABLE movies ADD COLUMN logo_url VARCHAR(1000);
