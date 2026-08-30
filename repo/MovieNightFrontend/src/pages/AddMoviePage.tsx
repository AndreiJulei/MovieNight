import { useState, type ReactNode } from "react";
import { useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import type { Movie, Status } from "../store/data";
import AppShell from "../components/AppShell";
import PixelPoster from "../components/PixelPoster";
import SegmentedRadio from "../components/SegmentedRadio";
import AnimatedSearchInput from "../components/AnimatedSearchInput";

type Mode = "search" | "manual";
type PosterMode = "upload" | "url";

export default function AddMoviePage() {
  const store = useStore();
  const { navigate } = useRouter();

  const [mode, setMode] = useState<Mode>("search");
  const [selected, setSelected] = useState<Movie | null>(null);

  // fields (shared between search prefill and manual)
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [overview, setOverview] = useState("");
  const [target, setTarget] = useState<Status>("watched");
  const [rating, setRating] = useState<number>(7.0);

  // manual poster
  const [posterMode, setPosterMode] = useState<PosterMode>("url");
  const [posterUrl, setPosterUrl] = useState("");

  // search
  const [query, setQuery] = useState("");
  const results = store.searchMovies(query);

  const pick = (m: Movie) => {
    setSelected(m);
    setTitle(m.title);
    setYear(String(m.year));
    setOverview(m.overview ?? "");
  };

  const submit = () => {
    if (!title.trim()) return;

    const parsedYear = Number(year) || new Date().getFullYear();
    store.addMovie({
      title: title.trim(),
      year: parsedYear,
      overview: overview.trim() || undefined,
      posterSeed: selected?.posterSeed,
      posterUrl: posterMode === "url" && posterUrl ? posterUrl : null,
      status: target,
      rating: target === "watched" ? rating : undefined,
      existingMovieId: selected?.id,
    });

    navigate(target === "watched" ? "/movies" : "/movies?status=watchlist");
  };

  const showFields = mode === "manual" || selected != null;
  const canSubmit = title.trim().length > 0;

  return (
    <AppShell>
      <button
        type="button"
        onClick={() => navigate("/movies")}
        className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-white"
      >
        <span aria-hidden="true">←</span> Back
      </button>

      <div className="mx-auto mt-6 max-w-[580px]">
        <h1 className="text-2xl font-bold tracking-tight text-white">Add a movie</h1>

        {/* Mode toggle with Segmented Radio */}
        <div className="mt-5">
          <SegmentedRadio
            name="add_mode"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setSelected(null);
            }}
            options={[
              { value: "search", label: "Search Catalog" },
              { value: "manual", label: "Manual Entry" },
            ]}
          />
        </div>

        {mode === "search" && !selected && (
          <div className="mt-6">
            <AnimatedSearchInput
              label="Search for a movie title…"
              value={query}
              onChange={setQuery}
              autoFocus
            />

            <ul className="mt-4 space-y-2">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => pick(m)}
                    className="flex w-full items-center gap-3.5 rounded-xl border border-white/10 bg-surface/80 p-2.5 text-left transition-all hover:border-white/20 hover:bg-white/[0.04]"
                  >
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded-[6px] border border-white/10 bg-black/40">
                      {m.posterUrl ? (
                        <img
                          src={m.posterUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : m.posterSeed != null ? (
                        <PixelPoster seed={m.posterSeed} />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {m.title}
                      </p>
                      <p className="nums text-xs text-text-muted">
                        {m.year}
                        {m.imdb != null && ` · avg ${m.imdb.toFixed(1)}`}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
              {query.trim() && results.length === 0 && (
                <li className="px-2 py-4 text-center text-sm text-text-muted">
                  No matches found. Switch to Manual Entry to add your custom title.
                </li>
              )}
            </ul>
          </div>
        )}

        {showFields && (
          <div className="mt-8 space-y-6">
            {selected && (
              <div className="flex items-center gap-3.5 rounded-xl border border-accent/30 bg-accent/10 p-3.5">
                <div className="h-16 w-11 shrink-0 overflow-hidden rounded-[6px] border border-white/10">
                  {selected.posterUrl ? (
                    <img
                      src={selected.posterUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : selected.posterSeed != null ? (
                    <PixelPoster seed={selected.posterSeed} />
                  ) : null}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-text-muted">
                    Selected <span className="font-semibold text-white">{selected.title}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="mt-0.5 text-xs font-semibold text-accent hover:underline"
                  >
                    Change selection
                  </button>
                </div>
              </div>
            )}

            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
                placeholder="e.g. Interstellar"
              />
            </Field>

            {mode === "manual" && (
              <>
                <Field label="Year">
                  <input
                    value={year}
                    onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    className={inputCls}
                    placeholder="e.g. 2014"
                  />
                </Field>

                <div>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Poster
                  </span>
                  <div className="mb-3">
                    <SegmentedRadio
                      name="poster_mode"
                      value={posterMode}
                      onChange={setPosterMode}
                      options={[
                        { value: "url", label: "Image URL" },
                        { value: "upload", label: "Upload File" },
                      ]}
                    />
                  </div>
                  {posterMode === "upload" ? (
                    <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/30 px-4 py-8 text-center text-sm text-text-muted transition-colors hover:border-accent">
                      <input type="file" accept="image/*" className="hidden" />
                      Drop poster image here, or click to browse
                    </label>
                  ) : (
                    <input
                      value={posterUrl}
                      onChange={(e) => setPosterUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/…"
                      className={inputCls}
                    />
                  )}
                  <p className="mt-1.5 text-xs text-text-muted">
                    No poster is fine — a clean themed fallback card will be displayed.
                  </p>
                </div>
              </>
            )}

            {/* Target list toggle */}
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Add to List
              </span>
              <SegmentedRadio
                name="target_list"
                value={target}
                onChange={setTarget}
                options={[
                  { value: "watched", label: "Watched" },
                  { value: "watchlist", label: "Watchlist" },
                ]}
              />
            </div>

            {/* Rating — only when Watched */}
            {target === "watched" && (
              <label className="block rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="nums mb-2 flex items-center justify-between text-sm font-semibold text-text-primary">
                  <span>Your rating</span>
                  <span className="rounded-md border border-accent/40 bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                    {rating.toFixed(1)} / 10
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </label>
            )}

            <Field label="Description (optional)">
              <textarea
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                rows={3}
                placeholder="Personal notes, favorite scenes, or review..."
                className={`${inputCls} resize-none`}
              />
            </Field>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-accent/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add movie
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder:text-text-muted focus:border-accent focus:outline-none transition-all";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
