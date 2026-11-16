import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "../router"
import type { ApiAvatar, ApiProgress, ApiRank } from "../api/profile"
import type { Movie } from "../store/data"
import { GearIcon } from "./NavRail.icons"
import MovieGrid from "./MovieGrid"
import RankBadge from "./RankBadge"
import UserAvatar from "./UserAvatar"
import {
  hiddenTabs,
  rankProgressLabel,
  resolveSelectedTab,
  sharedTabs,
  xpPercent,
  type ProfileSharing,
  type ProfileTab,
  type ProfileTabKey,
} from "./profileLogic"

export type ProfileTabContent = { movies: Movie[]; captionFor?: (movie: Movie) => string }

/**
 * The profile layout shared by the owner (/profile) and friends (/friends/:id) (#33).
 * Only the owner gets the XP bar, the ⚙ Settings button and list sharing controls (PF01).
 */
export default function ProfileView({
  owner,
  displayName,
  username,
  avatar,
  rank,
  progress,
  sharing,
  loadTab,
  onShare,
  onStopSharing,
  sharingBusy = false,
  headerAction,
  gridProps,
  reloadKey = 0,
}: {
  owner: boolean
  displayName: string
  username: string
  avatar: ApiAvatar | null | undefined
  rank: ApiRank | null | undefined
  progress?: ApiProgress | null
  sharing: ProfileSharing
  loadTab: (tab: ProfileTab) => Promise<ProfileTabContent>
  onShare?: (tab: ProfileTab) => void
  onStopSharing?: (tab: ProfileTab) => void
  sharingBusy?: boolean
  headerAction?: ReactNode
  gridProps?: Pick<Parameters<typeof MovieGrid>[0], "referrerOverride" | "showAddToWatchlist" | "onAddToWatchlist" | "userHasMovie">
  reloadKey?: number
}) {
  const tabs = sharedTabs(sharing)
  const hidden = owner ? hiddenTabs(sharing) : []
  const [selected, setSelected] = useState<ProfileTabKey | null>(null)
  const activeKey = resolveSelectedTab(selected, tabs)
  const activeTab = tabs.find((tab) => tab.key === activeKey) ?? null

  const [content, setContent] = useState<ProfileTabContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const loadRef = useRef(loadTab)
  loadRef.current = loadTab

  useEffect(() => {
    if (!activeTab) { setContent(null); setError(null); return }
    let active = true
    setLoading(true)
    setError(null)
    loadRef.current(activeTab)
      .then((next) => { if (active) setContent(next) })
      .catch((err) => {
        if (!active) return
        setContent(null)
        setError(err instanceof Error ? err.message : "Could not load this list. Retry.")
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // The tab key identifies the list; reloadKey refreshes after a library change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.key, reloadKey, retry])

  const name = displayName || username
  return (
    <>
      {/* Header: avatar, rank, username and (owner only) XP bar; ⚙ on the right. */}
      <section aria-label="Profile" className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-surface/60 p-5 sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <UserAvatar avatar={avatar} displayName={displayName} username={username} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {rank && <RankBadge rank={rank} />}
              {owner && progress && (
                <span className="text-xs text-text-muted">{rankProgressLabel(progress.toNextRank, progress.nextRank?.label)}</span>
              )}
            </div>
            {/* The username sits below the rank badge (#33); the display name is secondary. */}
            <h1 className="mt-2 truncate text-2xl font-bold tracking-tight text-white">{username}</h1>
            {displayName && displayName !== username && <p className="truncate text-sm text-text-muted">{displayName}</p>}
            {owner && progress && (
              <div className="mt-3 w-full max-w-xs">
                <div className="flex items-baseline justify-between text-xs text-text-muted">
                  <span className="font-semibold text-text-primary">Level {progress.level}</span>
                  <span className="nums">{progress.xpIntoLevel}/{progress.xpPerLevel} to level {progress.level + 1}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Level ${progress.level} progress`}
                  aria-valuemin={0}
                  aria-valuemax={progress.xpPerLevel}
                  aria-valuenow={progress.xpIntoLevel}
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10"
                >
                  <div className="h-full rounded-full bg-accent" style={{ width: `${xpPercent(progress.xpIntoLevel, progress.xpPerLevel)}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerAction}
          {owner && (
            <Link
              to="/settings"
              aria-label="Settings"
              title="Settings"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <GearIcon className="h-5 w-5" />
            </Link>
          )}
        </div>
      </section>

      {/* Shared lists as tabs ("columns"). */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={owner ? "Lists you share with friends" : `${name}'s shared lists`} className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => (
            <ListTab
              key={tab.key}
              tab={tab}
              selected={tab.key === activeKey}
              onSelect={() => setSelected(tab.key)}
              onStopSharing={owner && onStopSharing ? () => onStopSharing(tab) : undefined}
              busy={sharingBusy}
            />
          ))}
        </div>
        {owner && onShare && hidden.length > 0 && <ShareListMenu hidden={hidden} onShare={onShare} busy={sharingBusy} />}
      </div>
      {owner && (
        <p className="mt-3 text-xs text-text-muted">
          Accepted friends see these lists with your viewing status and ratings. Notes stay private.
        </p>
      )}

      <div role="tabpanel" aria-label={activeTab?.label ?? "Shared lists"} className="mt-6">
        {!activeTab ? (
          <p className="py-16 text-center text-text-muted">
            {owner ? "You aren't sharing any lists. Use + Share a list to show one to friends." : `${name} isn't sharing any lists.`}
          </p>
        ) : error ? (
          <div className="py-10">
            <p role="alert" className="text-danger">{error}</p>
            <button type="button" onClick={() => setRetry((r) => r + 1)} className="mt-4 rounded-md border border-white/15 px-4 py-2 text-white">
              Retry loading
            </button>
          </div>
        ) : loading && !content ? (
          <p role="status" className="py-16 text-center text-text-muted">Loading {activeTab.label}…</p>
        ) : (
          <MovieGrid
            movies={content?.movies ?? []}
            empty={owner ? `Nothing in ${activeTab.label} yet.` : `${name} has nothing in ${activeTab.label} yet.`}
            captionFor={content?.captionFor}
            {...gridProps}
          />
        )}
      </div>
    </>
  )
}

function ListTab({
  tab,
  selected,
  onSelect,
  onStopSharing,
  busy,
}: {
  tab: ProfileTab
  selected: boolean
  onSelect: () => void
  onStopSharing?: () => void
  busy: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useDismiss(menuOpen, menuRef, () => setMenuOpen(false))
  return (
    <div
      ref={menuRef}
      className={`relative inline-flex items-center rounded-full border text-sm transition-colors ${
        selected ? "border-accent bg-accent/20 text-white" : "border-white/10 bg-white/[0.03] text-text-muted hover:text-white"
      }`}
    >
      <button type="button" role="tab" aria-selected={selected} onClick={onSelect} className={`max-w-[14rem] truncate py-1.5 font-medium ${onStopSharing ? "pl-4 pr-1" : "px-4"}`}>
        {tab.label}
      </button>
      {onStopSharing && (
        <>
          <button
            type="button"
            aria-label={`${tab.label} sharing options`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-base leading-none hover:bg-white/10"
          >
            ⋯
          </button>
          {menuOpen && (
            <div role="menu" className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] rounded-lg border border-white/15 bg-surface-raised p-1 shadow-xl">
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => { setMenuOpen(false); onStopSharing() }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-text-primary hover:bg-white/10 disabled:opacity-50"
              >
                Stop sharing
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ShareListMenu({ hidden, onShare, busy }: { hidden: ProfileTab[]; onShare: (tab: ProfileTab) => void; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, ref, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full border border-dashed border-white/20 px-4 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-white/40 hover:text-white"
      >
        + Share a list
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 max-h-72 min-w-[12rem] overflow-y-auto rounded-lg border border-white/15 bg-surface-raised p-1 shadow-xl">
          {hidden.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => { setOpen(false); onShare(tab) }}
              className="block w-full truncate rounded-md px-3 py-2 text-left text-sm text-text-primary hover:bg-white/10 disabled:opacity-50"
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Close a small menu on Escape or an outside pointer press. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current() }
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) closeRef.current()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointer)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointer)
    }
  }, [open, ref])
}
