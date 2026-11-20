-- recs-refill-and-acclaimed (SC04, SC07): title pages ask OMDb on the first visit, so they get their own
-- share of the global per-UTC-day OMDb allowance, counted next to the recommendation share. No user data.
ALTER TABLE omdb_request_budget
 ADD COLUMN title_page_requests integer NOT NULL DEFAULT 0 CHECK (title_page_requests >= 0);
