// Pure profile rules (#32, #33): which lists are tabs, rank/XP copy and the default avatar.

export type ProfileTabKey = "watchlist" | "watched" | `list:${number | string}`

export type ProfileTab = {
  key: ProfileTabKey
  label: string
  kind: "watchlist" | "watched" | "custom"
  listId?: number | string
}

export type ProfileSharing = {
  sharesWatchlist: boolean
  sharesWatched: boolean
  lists: { id: number | string; title: string; shared: boolean }[]
}

function allTabs(sharing: ProfileSharing): (ProfileTab & { shared: boolean })[] {
  return [
    { key: "watchlist", label: "Watchlist", kind: "watchlist", shared: sharing.sharesWatchlist },
    { key: "watched", label: "Watched", kind: "watched", shared: sharing.sharesWatched },
    ...sharing.lists.map((list) => ({
      key: `list:${list.id}` as ProfileTabKey,
      label: list.title,
      kind: "custom" as const,
      listId: list.id,
      shared: list.shared,
    })),
  ]
}

const strip = ({ shared: _shared, ...tab }: ProfileTab & { shared: boolean }): ProfileTab => tab

/** Lists visible to accepted friends, in tab order: Watchlist, Watched, then shared custom lists. */
export function sharedTabs(sharing: ProfileSharing): ProfileTab[] {
  return allTabs(sharing).filter((tab) => tab.shared).map(strip)
}

/** Lists the owner can add with "+ Share a list". */
export function hiddenTabs(sharing: ProfileSharing): ProfileTab[] {
  return allTabs(sharing).filter((tab) => !tab.shared).map(strip)
}

/** Keep the selection while it is still a tab; otherwise select the first tab (or none). */
export function resolveSelectedTab(selected: ProfileTabKey | null, tabs: ProfileTab[]): ProfileTabKey | null {
  if (selected && tabs.some((tab) => tab.key === selected)) return selected
  return tabs[0]?.key ?? null
}

export function rankProgressLabel(toNextRank: number, nextRankLabel: string | null | undefined): string {
  if (!nextRankLabel) return "Top rank reached"
  return `${toNextRank} more to ${nextRankLabel}`
}

/** Each rank milestone is a level; the top rank has no further level to work toward. */
export function levelProgressLabel(level: number, xpIntoLevel: number, xpPerLevel: number): string {
  if (!(xpPerLevel > 0)) return "Top level reached"
  return `${xpIntoLevel}/${xpPerLevel} to level ${level + 1}`
}

export function xpPercent(xpIntoLevel: number, xpPerLevel: number): number {
  if (!(xpPerLevel > 0)) return 0
  return Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpPerLevel) * 100)))
}

export function avatarInitial(displayName: string | null | undefined, username: string | null | undefined): string {
  const source = (displayName ?? "").trim() || (username ?? "").trim()
  return source ? source.charAt(0).toUpperCase() : "?"
}
