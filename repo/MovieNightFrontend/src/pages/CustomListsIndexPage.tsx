import { useState, type FormEvent, type MouseEvent } from "react";
import { Link, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { useToast } from "../components/Toast";
import AppShell from "../components/AppShell";
import type { CustomList, Movie } from "../store/data";

export default function CustomListsIndexPage() {
  const { currentUser, listsFor, movieById, createList, deleteList } = useStore();
  const { navigate } = useRouter();
  const { toast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!currentUser) return null;

  const lists = listsFor(currentUser.id);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    const created = createList(title);
    setNewTitle("");
    setIsCreating(false);
    toast({
      message: `Created list "${created.title}"`,
      type: "success",
    });
  };

  const handleDelete = (list: CustomList, e: MouseEvent) => {
    e.stopPropagation();
    deleteList(list.id);
    setConfirmDeleteId(null);
    toast({
      message: `Deleted list "${list.title}"`,
      type: "info",
    });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-16">
        {/* Top Header / Action Bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Lists
            </h1>
            <span className="nums rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-text-muted">
              {lists.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsCreating((v) => !v);
              setNewTitle("");
            }}
            className="flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-accent/90 active:scale-95"
          >
            {isCreating ? "Cancel" : "+ New List"}
          </button>
        </div>

        {/* Page-top description: constrained reading measure, centered, with accent divider line */}
        <div className="my-8 text-center">
          <p className="mx-auto max-w-md text-xs leading-relaxed text-text-muted sm:text-sm">
            Create your own private lists — ongoing shows, currently watching,
            comfort rewatches, whatever you want to group together.
          </p>
          <div className="mx-auto mt-5 h-[1px] w-12 bg-accent/40" />
        </div>

        {/* Inline Create Form */}
        {isCreating && (
          <form
            onSubmit={handleCreate}
            className="mb-6 rounded-xl border border-accent/30 bg-[#0e1320] p-4 shadow-xl transition-all animate-fadeIn"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="List title (e.g. Comfort Rewatches, Anime to finish...)"
                className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3.5 py-2 text-sm text-white placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent/90 disabled:opacity-40"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="rounded-lg border border-white/10 bg-[#141824] px-3 py-2 text-xs font-medium text-text-muted hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {/* List of Cards */}
        {lists.length > 0 ? (
          <div className="space-y-3.5">
            {lists.map((list) => {
              const sampleMovies = list.movieIds
                .slice(0, 4)
                .map((id) => movieById(id))
                .filter((m): m is Movie => m != null);

              const isConfirming = confirmDeleteId === list.id;

              return (
                <div
                  key={list.id}
                  onClick={() => navigate(`/lists/${list.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/lists/${list.id}`)}
                  className="group relative flex flex-col justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0b1019] p-4 sm:flex-row sm:items-center sm:p-5 transition-all duration-200 hover:border-white/20 hover:bg-[#0e1320] cursor-pointer shadow-sm"
                >
                  {/* Left: Overlapping poster collage + List details */}
                  <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                    {/* Poster collage */}
                    <div className="shrink-0">
                      {sampleMovies.length > 0 ? (
                        <div className="flex -space-x-3.5 overflow-hidden py-1">
                          {sampleMovies.map((movie, idx) => (
                            <div
                              key={movie.id}
                              className="relative h-20 w-14 overflow-hidden rounded-md border border-[#0b1019] bg-surface shadow-md transition-transform duration-200 group-hover:translate-x-0.5"
                              style={{ zIndex: 10 - idx }}
                            >
                              {movie.posterUrl ? (
                                <img
                                  src={movie.posterUrl}
                                  alt={movie.title}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-surface-raised p-1 text-[10px] text-text-muted text-center">
                                  {movie.title}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* Established flat placeholder-surface treatment for empty list */
                        <div className="flex h-20 w-14 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-text-muted/40 shadow-inner">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect width="18" height="18" x="3" y="3" rx="2" />
                            <path d="M7 3v18" />
                            <path d="M3 7.5h4" />
                            <path d="M3 12h18" />
                            <path d="M3 16.5h4" />
                            <path d="M17 3v18" />
                            <path d="M17 7.5h4" />
                            <path d="M17 16.5h4" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Title & metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-base font-bold text-white transition-colors group-hover:text-accent sm:text-lg">
                          {list.title}
                        </h2>
                      </div>
                      <div className="mt-1 flex items-center gap-2.5 text-xs text-text-muted">
                        <span className="nums font-medium text-text-primary">
                          {list.movieIds.length}{" "}
                          {list.movieIds.length === 1 ? "title" : "titles"}
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(list.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div
                    className="flex shrink-0 items-center justify-end sm:pl-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isConfirming ? (
                      /* Lightweight inline-confirm pattern (not a modal) */
                      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs">
                        <span className="text-text-muted">Delete this list?</span>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(list, e)}
                          className="font-bold text-red-400 hover:underline"
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="text-text-muted hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      /* Single quiet trash icon, no 3-dot menu */
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(list.id);
                        }}
                        title="Delete list"
                        aria-label={`Delete list ${list.title}`}
                        className="rounded-lg p-2 text-text-muted/50 transition-colors hover:bg-white/[0.06] hover:text-red-400"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty state: exactly one plain line pointing at the existing create action */
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <p className="text-sm text-text-muted">
              Nothing here yet. Create a list to get started.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
