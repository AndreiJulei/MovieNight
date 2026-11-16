package com.movienight.backend.dto;

/** Choose an unlocked avatar by ID; null restores the default initial avatar. */
public record SetAvatarRequest(String avatar) {}
