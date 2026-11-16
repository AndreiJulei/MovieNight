-- Tickets #32 (PD-16) and #33 (PD-17): avatar choice and friend-visible lists.
-- avatar_key names an entry in the avatar manifest; null shows the default initial avatar.
ALTER TABLE users ADD COLUMN avatar_key varchar(50);

-- Watchlist and watched history are shared with accepted friends by default.
ALTER TABLE users ADD COLUMN shares_watchlist boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN shares_watched boolean NOT NULL DEFAULT true;

-- A list is "shared" with the owner's accepted friends, never public (GLOSSARY: Shared list).
-- Lists were forced private before #33, so no stored true value reflects an owner's sharing
-- decision; start every list unshared.
ALTER TABLE custom_lists RENAME COLUMN is_public TO shared;
ALTER INDEX idx_custom_list_public RENAME TO idx_custom_list_shared;
UPDATE custom_lists SET shared = false WHERE shared;
