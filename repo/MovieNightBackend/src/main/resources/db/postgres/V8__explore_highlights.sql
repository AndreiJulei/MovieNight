-- Ticket #26 (PD-10): Explore spotlight hero and "Top 10 today" row.
-- New list types TRENDING_WEEK / TRENDING_DAY reuse cached_movie_list (list_type has no CHECK).
-- Spotlight rows carry their artwork and genres so serving them needs no provider call.
ALTER TABLE cached_movie_list ADD COLUMN backdrop_path varchar(255);
ALTER TABLE cached_movie_list ADD COLUMN logo_url varchar(512);
ALTER TABLE cached_movie_list ADD COLUMN genres varchar(255);
