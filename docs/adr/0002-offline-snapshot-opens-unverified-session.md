# The offline snapshot may open an unverified session

Status: proposed for #34 (pending review checkpoint approval).

## Context

Until #34, a session the server could not verify showed no private data: the app
displayed "Session unavailable" and a Retry button. #34 asks for a read-only
library without a connection, which by definition cannot be verified.

## Decision

- When the browser reports no connection, or the session check gets no answer
  from the server, the app may open the signed-in user's **offline snapshot**
  (see the glossary) read-only. No answer means a network error, a timeout or a
  502/503/504 gateway status. Any other error is an answer: the app shows
  "Session unavailable" with Retry, as before.
- The snapshot opens only when a sign-in token is still stored and it was saved
  under that same sign-in (a token fingerprint, not the token, is stored with it).
  Another account, or a later sign-in, never sees it.
- A 401/403 answer still signs the user out and deletes the snapshot. Sign-out
  and every new sign-in delete it too.
- While the snapshot is open and the browser is online, the session is re-checked
  immediately and every 30 seconds; any answer from the server, an error
  included, leaves snapshot mode.
- Nothing is written while offline and nothing is queued.

## Consequences

Anyone with this device's browser profile and a stored sign-in can read that
user's last library offline, exactly as they could while online. A timed-out or
sleeping server (gateway error) now shows the read-only library instead of
"Session unavailable"; a server that answers with an error still does not.
