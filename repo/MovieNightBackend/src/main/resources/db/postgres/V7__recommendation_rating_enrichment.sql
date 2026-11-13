-- Ticket #24 (PD-08): bounded OMDb enrichment of personal recommendation candidates.
-- omdb_checked_at records that OMDb was asked, so a title OMDb has no scores for is not re-requested.
ALTER TABLE movies ADD COLUMN omdb_checked_at timestamp(6);

-- Global per-UTC-day count of OMDb requests spent by recommendation recomputation. No user data.
CREATE TABLE omdb_request_budget (
 budget_day date PRIMARY KEY,
 recommendation_requests integer NOT NULL CHECK (recommendation_requests >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON omdb_request_budget TO "${runtimeRole}";
