-- Transactional, forward-only upgrade; no personal data is rebuilt or reseeded.
ALTER TABLE user_movie_entries ALTER COLUMN notes TYPE text;
ALTER TABLE user_movie_entries ADD CONSTRAINT valid_personal_rating
 CHECK (personal_rating IS NULL OR
        (personal_rating BETWEEN 0 AND 10 AND personal_rating * 2 = trunc(personal_rating * 2)));
