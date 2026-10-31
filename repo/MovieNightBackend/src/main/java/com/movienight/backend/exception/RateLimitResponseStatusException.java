package com.movienight.backend.exception;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Specialized ResponseStatusException for HTTP 429 Too Many Requests
 * that retains provider cooldown guidance via Retry-After headers.
 */
public class RateLimitResponseStatusException extends ResponseStatusException {

    private final HttpHeaders responseHeaders = new HttpHeaders();

    public RateLimitResponseStatusException(String reason, String retryAfter) {
        super(HttpStatus.TOO_MANY_REQUESTS, reason);
        if (retryAfter != null && !retryAfter.isBlank()) {
            this.responseHeaders.set(HttpHeaders.RETRY_AFTER, retryAfter.trim());
        }
    }

    @Override
    public HttpHeaders getHeaders() {
        return this.responseHeaders;
    }
}

