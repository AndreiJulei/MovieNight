import { useEffect, useRef, useState } from "react"
import { Link } from "../router"
import { useStore } from "../store/MovieStore"
import AppShell from "../components/AppShell"

export default function FriendsPage() {
  const store = useStore()
  const userId = store.currentUser!.id
  const [query, setQuery] = useState("")
  const [feedback, setFeedback] = useState("")
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    void store.refreshFriends()
  }, [store.refreshFriends])
  const act = async (
    action: () => Promise<{
      ok: boolean
      error?: string
      warning?: string
    }>,
    message: string,
  ) => {
    setFeedback("")
    const result = await action()
    if (!mounted.current) return
    setFeedback(
      result.ok ? result.warning || message : result.error || "Could not confirm. Retry.",
    )
    if (result.ok) setQuery("")
  }
  const incoming = store.invitations.filter(
    (i) => String(i.recipientId) === userId,
  )
  const outgoing = store.invitations.filter(
    (i) => String(i.senderId) === userId,
  )
  const button =
    "rounded-md border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
  return (
    <AppShell>
      <div className="mx-auto max-w-[620px]">
        <h1 className="text-2xl font-bold text-white">Friends</h1>
        <p className="mt-2 text-sm text-text-muted">
          Share viewing status and ratings after an invitation is accepted. Your
          notes and custom lists stay private.
        </p>
        <form
          className="mt-6 flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim())
              void act(
                () => store.addFriend(query.trim()),
                "Invitation saved. Access begins only after acceptance.",
              )
          }}
        >
          <label className="min-w-0 flex-1 text-sm text-text-primary">
            Username, display name, or email
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={store.friendsSaving}
              required
              className="mt-2 block w-full rounded-md border border-white/15 bg-surface px-3 py-2 text-base text-white focus:outline-accent"
            />
          </label>
          <button
            className={`${button} self-end`}
            disabled={store.friendsSaving || !query.trim()}
          >
            {store.friendsSaving ? "Saving…" : "Send invitation"}
          </button>
        </form>
        {feedback && (
          <p role="status" className="mt-4 text-sm text-text-primary">
            {feedback}
          </p>
        )}
        <button
          className={`${button} mt-5`}
          disabled={store.friendsLoading || store.friendsSaving}
          onClick={() => void store.refreshFriends()}
        >
          Reload friends
        </button>
        {store.friendsLoading && (
          <p role="status" className="mt-4 text-sm text-text-muted">
            Loading friends…
          </p>
        )}
        {store.friendsError && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {store.friendsError} Use Reload friends to retry.
          </p>
        )}
        <section className="mt-8" aria-label="Incoming invitations">
          <h2 className="text-lg font-semibold text-white">
            Incoming invitations
          </h2>
          {!store.friendsLoading && !store.friendsError && incoming.length === 0 && (
            <p className="mt-3 text-sm text-text-muted">
              No incoming invitations.
            </p>
          )}
          <ul className="mt-3 divide-y divide-white/10">
            {incoming.map((i) => (
              <li
                key={i.senderId}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <span className="min-w-0 break-words text-text-primary">
                  {i.senderDisplayName}{" "}
                  <span className="text-sm text-text-muted">
                    @{i.senderUsername}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    className={button}
                    disabled={store.friendsSaving}
                    onClick={() =>
                      void act(
                        () => store.acceptFriend(String(i.senderId)),
                        "Friendship accepted.",
                      )
                    }
                  >
                    Accept
                  </button>
                  <button
                    className={button}
                    disabled={store.friendsSaving}
                    onClick={() =>
                      void act(
                        () => store.removeFriend(String(i.senderId)),
                        "Invitation declined.",
                      )
                    }
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-8" aria-label="Outgoing invitations">
          <h2 className="text-lg font-semibold text-white">
            Outgoing invitations
          </h2>
          {!store.friendsLoading && !store.friendsError && outgoing.length === 0 && (
            <p className="mt-3 text-sm text-text-muted">
              No outgoing invitations.
            </p>
          )}
          <ul className="mt-3 divide-y divide-white/10">
            {outgoing.map((i) => (
              <li
                key={i.recipientId}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <span className="min-w-0 break-words text-text-primary">
                  {i.recipientDisplayName}{" "}
                  <span className="text-sm text-text-muted">
                    Pending acceptance
                  </span>
                </span>
                <button
                  className={button}
                  disabled={store.friendsSaving}
                  onClick={() =>
                    void act(
                      () => store.removeFriend(String(i.recipientId)),
                      "Invitation cancelled.",
                    )
                  }
                >
                  Cancel invitation
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-8" aria-label="Accepted friends">
          <h2 className="text-lg font-semibold text-white">Accepted friends</h2>
          {!store.friendsLoading &&
            !store.friendsError &&
            store.friendProfiles.length === 0 && (
              <p className="mt-3 text-sm text-text-muted">
                No accepted friends yet. Send an invitation to get started.
              </p>
            )}
          <ul className="mt-3 divide-y divide-white/10">
            {store.friendProfiles.map((f) => (
              <li key={f.id}>
                <Link
                  to={`/friends/${f.id}`}
                  className="flex flex-wrap justify-between gap-2 py-4 text-text-primary hover:text-accent"
                >
                  <span className="break-all">
                    {f.displayName}{" "}
                    <span className="text-sm text-text-muted">
                      @{f.username}
                    </span>
                  </span>
                  <span className="nums text-sm text-text-muted">
                    {f.watchedCount} watched · {f.watchlistCount} to watch
                    {f.avgRating != null
                      ? ` · avg ${f.avgRating.toFixed(1)}`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  )
}
