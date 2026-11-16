package com.movienight.backend.repository;

import com.movienight.backend.model.User;

import java.util.Optional;

/**
 * The one way to resolve an authenticated name to an account. Static over the repository so
 * services keep their existing repository mocks; callers choose their own not-found error.
 */
public final class UserLookup {

    private UserLookup() {}

    /** A token subject: exact username first, then a case-insensitive match. Never an email. */
    public static Optional<User> byUsername(UserRepository users, String username) {
        String clean = username != null ? username.trim() : "";
        return users.findByUsername(clean).or(() -> users.findByUsernameIgnoreCase(clean));
    }

    /** An authenticated principal name, which may be a username or (for legacy accounts) an email. */
    public static Optional<User> byAccountName(UserRepository users, String name) {
        String clean = name != null ? name.trim() : "";
        return byUsername(users, clean).or(() -> users.findByEmailIgnoreCase(clean));
    }
}
