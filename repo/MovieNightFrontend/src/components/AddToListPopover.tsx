import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStore } from "../store/MovieStore";
import { useToast } from "./Toast";
import { useEscapeKey } from "../hooks/useOverlay";
import type { Movie } from "../store/data";

interface AddToListPopoverProps {
  movie: Movie;
}

export default function AddToListPopover({ movie }: AddToListPopoverProps) {
  const { currentUser, listsFor, createList, toggleMovieInList, isMovieInList, listsContainingMovie, listsLoading, listsError, listsSaving, refreshLists } =
    useStore();
  const { toast } = useToast();

  const [error, setError] = useState<string | null>(null);
  const busy = listsLoading || listsSaving;
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEscapeKey(isOpen, () => {
    setIsOpen(false);
    setIsCreating(false);
  });

  useEffect(() => {
    if (!isOpen) return;

    const onDocumentClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [isOpen]);

  if (!currentUser) return null;

  const userLists = listsFor(currentUser.id);
  const containingLists = listsContainingMovie(currentUser.id, movie);
  const inAnyList = containingLists.length > 0;

  const handleCreateAndAdd = async (e: FormEvent) => {
    e.preventDefault();
    const title = newListTitle.trim();
    if (!title) return;

    if (busy) return;
    setError(null);
    try {
      const created = await createList(title, movie);
      setNewListTitle("");
      setIsCreating(false);
      toast({
        message: `Created "${created.title}" & added "${movie.title}"`,
        type: "success",
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create this list. Please try again.");
    }
  };

  return (
    <div ref={popoverRef} className="relative inline-block">
      {/* Secondary affordance: small, quiet, visually subordinate */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all active:scale-95 ${
          inAnyList
            ? "border-white/20 bg-white/[0.08] text-white hover:border-white/30 hover:bg-white/[0.12]"
            : "border-white/10 bg-[#111726] text-text-muted hover:border-white/20 hover:text-text-primary hover:bg-[#151c2e]"
        }`}
        title="Add to custom list"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        <span>
          {inAnyList
            ? `In Lists (${containingLists.length})`
            : "+ Add to list"}
        </span>
      </button>

      {/* Floating checklist popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Add to custom list"
          className="absolute left-0 top-full mt-2 z-50 w-64 rounded-xl border border-white/15 bg-[#0e1320] p-3 shadow-2xl backdrop-blur-xl animate-fadeIn"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Custom Lists
            </span>
            {userLists.length > 0 && (
              <span className="nums text-[10px] text-text-muted">
                {userLists.length}
              </span>
            )}
          </div>

          {listsLoading && <p role="status" className="p-1 text-sm text-text-muted">Loading your lists…</p>}
          {(error || listsError) && <p role="alert" className="p-1 text-sm text-red-300">{error || listsError}</p>}
          <button type="button" disabled={busy} onClick={() => { setError(null); void refreshLists(); }}
            className="mb-2 px-1 text-sm text-accent underline underline-offset-4 disabled:opacity-40">Reload lists</button>
          {/* Checklist */}
          {userLists.length > 0 ? (
            <div className="max-h-48 space-y-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {userLists.map((list) => {
                const inList = isMovieInList(list.id, movie);
                return (
                  <button
                    key={list.id}
                    type="button"
                    disabled={busy || !!listsError}
                    aria-pressed={inList}
                    onClick={async () => {
                      setError(null);
                      try {
                        await toggleMovieInList(list.id, movie);
                        toast({
                          message: inList
                            ? `Removed "${movie.title}" from ${list.title}`
                            : `Added "${movie.title}" to ${list.title}`,
                          type: "info",
                        });
                      } catch (error) {
                        setError(error instanceof Error ? error.message : "Could not save membership. Please try again.");
                      }
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-text-primary transition-colors hover:bg-white/[0.06] group"
                  >
                    <span className="truncate pr-2">{list.title}</span>
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        inList
                          ? "border-accent bg-accent text-white"
                          : "border-white/20 bg-transparent group-hover:border-white/40"
                      }`}
                    >
                      {inList && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-1 py-1.5 text-xs text-text-muted">
              {listsLoading || listsError ? "" : "No lists created yet."}
            </p>
          )}

          {/* Divider */}
          <div className="my-2 border-t border-white/[0.08]" />

          {/* Inline + Create new list */}
          {!isCreating ? (
            <button
              type="button"
              disabled={busy || !!listsError}
              onClick={() => { setError(null); setIsCreating(true); }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
            >
              <span>+</span>
              <span>Create new list</span>
            </button>
          ) : (
            <form onSubmit={handleCreateAndAdd} className="space-y-2 pt-0.5">
              <input
                type="text"
                autoFocus
                aria-label="New list title"
                maxLength={150}
                required
                disabled={listsSaving}
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder="New list title..."
                className="w-full rounded-md border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  disabled={listsSaving}
                  onClick={() => {
                    setIsCreating(false);
                    setNewListTitle("");
                  }}
                  className="rounded px-2 py-1 text-[11px] text-text-muted hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newListTitle.trim() || busy}
                  className="rounded bg-accent px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-accent/90 disabled:opacity-40"
                >
                  {listsSaving ? "Saving…" : "Create"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
