package com.movienight.backend.dto.external;

/** A TMDB person, identified by their TMDB person id: here, a director found in a title's credits. */
public record TmdbPerson(long id, String name) {}
