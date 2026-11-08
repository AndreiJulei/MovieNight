package com.movienight.backend.client;

/** AniList could not answer (rate limited, failed, or malformed); callers must keep published data and retry. */
public class AniListUnavailableException extends RuntimeException {
    private final long retryAfterSeconds;

    public AniListUnavailableException(String message, long retryAfterSeconds, Throwable cause) {
        super(message, cause);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    /** Seconds AniList asked clients to wait, or 0 when it gave no instruction. */
    public long getRetryAfterSeconds() { return retryAfterSeconds; }
}
