-- Ticket #20: personal ratings accept one decimal place (0.1 steps) instead of half points.
-- Transactional; every existing half-point rating already satisfies the wider rule.
ALTER TABLE user_movie_entries DROP CONSTRAINT valid_personal_rating;
ALTER TABLE user_movie_entries ADD CONSTRAINT valid_personal_rating
 CHECK (personal_rating IS NULL OR
        (personal_rating BETWEEN 0 AND 10 AND personal_rating * 10 = trunc(personal_rating * 10)));
