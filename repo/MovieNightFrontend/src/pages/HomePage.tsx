import usePersonalRecommendations, { mapPersonalMovie } from "../hooks/usePersonalRecommendations";
import PersonalRecommendationStatus from "../components/PersonalRecommendationStatus";
import useFriendSuggestions from "../hooks/useFriendSuggestions";
import { mapApiMovie } from "../hooks/useSuggestions";
import useWatchlistSave from "../hooks/useWatchlistSave";
import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "../router";
import AppShell from "../components/AppShell";
import { useStore } from "../store/MovieStore";
import { useEscapeKey, useBodyScrollLock } from "../hooks/useOverlay";
import type { Movie } from "../store/data";

export default function HomePage() {
  const store = useStore();
  const { saveWatchlist } = useWatchlistSave();
  const { navigate } = useRouter();
  const currentUser = store.currentUser;

  // Selected trailer modal state
  const [activeTrailer, setActiveTrailer] = useState<{ key: string; title: string } | null>(null);

  const personalSuggestions = usePersonalRecommendations();
  const personalizedMovies = personalSuggestions.category?.movies.map(mapPersonalMovie) ?? [];
  const topPersonalized = personalizedMovies[0] ?? null;
  const samplePersonalized = personalizedMovies.slice(1, 7);

  // Friend choices come only from the accepted-friend API, in its source order.
  const friendSuggestions = useFriendSuggestions();
  const friendItems = friendSuggestions.data?.categories.flatMap((category) => category.movies) ?? [];
  const friendsMovies = friendItems.map((item) => mapApiMovie(item, store));
  const topFriendMovie = friendsMovies[0] ?? null;
  const sampleFriends = friendsMovies.slice(1, 7);

  const handleWatchlistToggle = (movie: Movie) => {
    if (!currentUser || isMovieInWatchlist(movie)) return;
    void saveWatchlist(movie.id, movie);
  };

  const isMovieInWatchlist = (movie: Movie) => {
    if (!currentUser) return false;
    return store.entryFor(currentUser.id, movie.id)?.status === "watchlist";
  };

  if (!currentUser) return null;

  return (
    <AppShell fullBleed>
      {/* ── 1. The Hero: ~75vh Brand Moment (No buttons, no cards, transparent cropped asset) ── */}
      <section className="relative w-full h-[75vh] min-h-[440px] max-h-[820px] flex items-end justify-center overflow-hidden bg-transparent">
        {/* Transparent cropped character & logo asset: only character & text visible */}
        <div className="relative z-10 w-full h-full flex items-end justify-center pointer-events-none px-4 pt-4 sm:px-6 sm:pt-6 pb-0">
          <img
            src="/heroes/joker_marvel_anton_cropped.png"
            alt="Movie Night"
            className="h-full w-auto max-w-full object-contain object-bottom pointer-events-none select-none filter drop-shadow-[0_20px_45px_rgba(0,0,0,0.85)]"
            loading="eager"
          />
        </div>
      </section>

      {/* ── 2. Editorial Narrative / App Description ── */}
      <section className="relative mx-auto max-w-4xl px-6 pt-2 pb-14 sm:pt-3 sm:pb-20 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
          A single, deliberate space for everything you watch.
        </h2>
        <p className="mt-10 sm:mt-12 text-base sm:text-lg leading-relaxed text-text-muted max-w-2xl mx-auto">
          Here you can track almost anything — from contemporary cinema and prestige television to anime and classic gems. Never run out of great stories with recommendations tuned to what you actually love, rather than an algorithm's guess. Check what your friends have been watching, compare ratings, and browse their personal watchlists to discover what's worth your evening.
        </p>

        {/* Three quiet editorial pillars */}
        <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3 text-left border-t border-white/[0.08] pt-10">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Track without boundaries</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
              Log watched titles, assign 10-point ratings, and maintain a unified watchlist across Movies, TV Series, and Anime.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Curated by your circle</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
              Explore what your friends have been enjoying, tap into their consensus picks, and filter out titles you've already seen.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Group your way</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
              Build private lists for weekend marathons, ongoing seasonals, or comfort rewatches without cluttering your watchlist.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. Recommendations (Wide, Distilled, No Redundant Tags/Boxes) ── */}
      <div
        id="recommendations"
        className="mx-auto max-w-[1400px] px-4 sm:px-8 lg:px-12 pb-28 space-y-16 sm:space-y-24"
      >
        {/* ── Section 1: Personalized Recommendations ── */}
        <PersonalRecommendationStatus suggestions={personalSuggestions} />
        {topPersonalized && (
          <section className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#0b1019] overflow-hidden shadow-2xl">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                {/* Left Column: Top 1 Highlight in IMDb style (7 cols) */}
                <div className="relative aspect-video lg:aspect-auto lg:min-h-[440px] w-full overflow-hidden bg-black/70 lg:col-span-7 group">
                  {topPersonalized.posterUrl ? (
                    <img
                      src={topPersonalized.posterUrl}
                      alt={topPersonalized.title}
                      className="absolute inset-0 h-full w-full object-cover object-center filter contrast-110 brightness-85 transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[#111726]" />
                  )}

                  {/* Dark gradients */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent hidden sm:block" />

                  {/* Overlaid small poster on bottom-left */}
                  <div className="absolute bottom-5 left-5 z-20 w-24 sm:w-32 aspect-[2/3] overflow-hidden rounded-md border border-white/25 shadow-2xl bg-[#080c14]">
                    {topPersonalized.posterUrl && (
                      <img
                        src={topPersonalized.posterUrl}
                        alt={topPersonalized.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {/* Top-left Watchlist Bookmark button on small poster */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWatchlistToggle(topPersonalized);
                      }}
                      disabled={store.isWatchlistSaving(topPersonalized.id) || isMovieInWatchlist(topPersonalized)}
                      aria-busy={store.isWatchlistSaving(topPersonalized.id)}
                      title={isMovieInWatchlist(topPersonalized) ? "In Watchlist" : "Add to Watchlist"}
                      aria-label={store.isWatchlistSaving(topPersonalized.id) ? "Saving to Watchlist" : isMovieInWatchlist(topPersonalized) ? "In Watchlist" : "Add to Watchlist"}
                      className={`absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold shadow-md transition-colors ${
                        isMovieInWatchlist(topPersonalized)
                          ? "bg-accent text-white"
                          : "bg-black/80 text-white hover:bg-accent"
                      }`}
                    >
                      {isMovieInWatchlist(topPersonalized) ? "✓" : "+"}
                    </button>
                  </div>

                  {/* Overlaid Play Trailer Button + Title & Metadata */}
                  <div className="absolute bottom-5 left-32 sm:left-40 right-5 z-20 flex items-center gap-3 sm:gap-4">
                    {topPersonalized.trailerKey && (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTrailer({
                            key: topPersonalized.trailerKey!,
                            title: topPersonalized.title,
                          })
                        }
                        aria-label={`Play trailer for ${topPersonalized.title}`}
                        className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full bg-white/95 text-black shadow-2xl backdrop-blur-md transition-all hover:scale-110 hover:bg-white active:scale-95"
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="ml-1 text-black"
                        >
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/movies/${topPersonalized.id}${topPersonalized.mediaType ? `?type=${encodeURIComponent(topPersonalized.mediaType)}` : ""}`}
                        onClick={() => {
                          store.upsertMovie(topPersonalized);
                          try {
                            sessionStorage.setItem("last_selected_movie", JSON.stringify(topPersonalized));
                          } catch {
                            /* ignore */
                          }
                        }}
                        className="block text-base sm:text-xl font-bold text-white tracking-tight hover:text-accent transition-colors truncate"
                      >
                        {topPersonalized.title}
                      </Link>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/80">
                        {topPersonalized.imdb != null && (
                          <span className="nums flex items-center gap-1 font-semibold text-amber-400">
                            ★ {topPersonalized.imdb.toFixed(1)}
                          </span>
                        )}
                        <span>·</span>
                        <span>{topPersonalized.year}</span>
                        <span>·</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase font-medium">
                          {topPersonalized.mediaType}
                        </span>
                        {topPersonalized.trailerKey && (
                          <>
                            <span>·</span>
                            <span className="text-text-muted hover:text-white transition-colors">
                              Watch Trailer
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Title, Description, and Large Unboxed Poster Preview (5 cols) */}
                <div className="p-6 sm:p-8 flex flex-col justify-between bg-[#0b1019] border-t lg:border-t-0 lg:border-l border-white/[0.08] lg:col-span-5">
                  <div>
                    {/* Clean Heading without redundant kicker tags */}
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                      Personalized Recommendations
                    </h3>

                    {/* Richer descriptive text */}
                    <p className="mt-3 text-sm text-text-muted leading-relaxed">
                      These movie picks come from your watched movies. Your ratings influence their order, and unrated watched movies also contribute.
                    </p>

                    {/* Thin hairline divider separating description from preview */}
                    <div className="my-6 h-px w-full bg-white/[0.08]" />

                    {/* Context info and View All text link above preview */}
                    <div className="flex items-baseline justify-between mb-3.5">
                      <span className="nums text-xs text-text-muted">
                        {personalizedMovies.length} personal movie picks
                      </span>
                      <Link
                        to="/suggestions/for-you"
                        className="group/link flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                      >
                        <span>View all</span>
                        <span className="transition-transform group-hover/link:translate-x-0.5">→</span>
                      </Link>
                    </div>

                    {/* Larger, unboxed overlapping poster collage (custom list style) */}
                    <div
                      onClick={() => navigate("/suggestions/for-you")}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate("/suggestions/for-you")}
                      className="group/preview cursor-pointer pt-1"
                    >
                      <div className="flex -space-x-5 sm:-space-x-6 overflow-hidden py-2">
                        {samplePersonalized.map((movie, idx) => (
                          <div
                            key={movie.id}
                            className="relative h-32 w-22 sm:h-36 sm:w-24 shrink-0 overflow-hidden rounded-lg border border-[#0b1019] bg-surface shadow-xl transition-all duration-300 group-hover/preview:translate-x-1 group-hover/preview:border-white/20"
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

                        {personalizedMovies.length > 7 && (
                          <div
                            className="relative flex h-32 w-22 sm:h-36 sm:w-24 shrink-0 items-center justify-center rounded-lg border border-[#0b1019] bg-[#141b2b] text-xs font-bold text-white shadow-xl"
                            style={{ zIndex: 3 }}
                          >
                            +{personalizedMovies.length - 7}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Section 2: Friends Recommendations ── */}
        {!topFriendMovie && (
          <section aria-label="Friend suggestions" className="rounded-xl border border-white/[0.08] bg-surface p-6">
            <h2 className="text-xl font-semibold text-text-primary">Friend suggestions</h2>
            {friendSuggestions.loading ? <p role="status" className="mt-2 text-sm text-text-muted">Loading friend suggestions…</p> :
              friendSuggestions.error ? <p role="alert" className="mt-2 text-sm text-danger">{friendSuggestions.error}</p> :
              <p className="mt-2 text-sm text-text-muted">No eligible movies from accepted friends yet. Accept a friendship or return after friends add ratings or watchlist plans.</p>}
            <Link to="/suggestions/friends" className="mt-4 inline-block text-sm text-accent hover:underline">View friend suggestions</Link>
          </section>
        )}
        {topFriendMovie && (
          <section className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#0b1019] overflow-hidden shadow-2xl">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                {/* Left Column: Top 1 Highlight in IMDb style (7 cols) */}
                <div className="relative aspect-video lg:aspect-auto lg:min-h-[440px] w-full overflow-hidden bg-black/70 lg:col-span-7 group">
                  {topFriendMovie.posterUrl ? (
                    <img
                      src={topFriendMovie.posterUrl}
                      alt={topFriendMovie.title}
                      className="absolute inset-0 h-full w-full object-cover object-center filter contrast-110 brightness-85 transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[#111726]" />
                  )}

                  {/* Dark gradients */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent hidden sm:block" />

                  {/* Overlaid small poster on bottom-left */}
                  <div className="absolute bottom-5 left-5 z-20 w-24 sm:w-32 aspect-[2/3] overflow-hidden rounded-md border border-white/25 shadow-2xl bg-[#080c14]">
                    {topFriendMovie.posterUrl && (
                      <img
                        src={topFriendMovie.posterUrl}
                        alt={topFriendMovie.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {/* Top-left Watchlist Bookmark button on small poster */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWatchlistToggle(topFriendMovie);
                      }}
                      disabled={store.isWatchlistSaving(topFriendMovie.id) || isMovieInWatchlist(topFriendMovie)}
                      aria-busy={store.isWatchlistSaving(topFriendMovie.id)}
                      title={isMovieInWatchlist(topFriendMovie) ? "In Watchlist" : "Add to Watchlist"}
                      aria-label={store.isWatchlistSaving(topFriendMovie.id) ? "Saving to Watchlist" : isMovieInWatchlist(topFriendMovie) ? "In Watchlist" : "Add to Watchlist"}
                      className={`absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold shadow-md transition-colors ${
                        isMovieInWatchlist(topFriendMovie)
                          ? "bg-accent text-white"
                          : "bg-black/80 text-white hover:bg-accent"
                      }`}
                    >
                      {isMovieInWatchlist(topFriendMovie) ? "✓" : "+"}
                    </button>
                  </div>

                  {/* Overlaid Play Trailer Button + Title & Metadata */}
                  <div className="absolute bottom-5 left-32 sm:left-40 right-5 z-20 flex items-center gap-3 sm:gap-4">
                    {topFriendMovie.trailerKey && (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTrailer({
                            key: topFriendMovie.trailerKey!,
                            title: topFriendMovie.title,
                          })
                        }
                        aria-label={`Play trailer for ${topFriendMovie.title}`}
                        className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full bg-white/95 text-black shadow-2xl backdrop-blur-md transition-all hover:scale-110 hover:bg-white active:scale-95"
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="ml-1 text-black"
                        >
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/movies/${topFriendMovie.id}${topFriendMovie.mediaType ? `?type=${encodeURIComponent(topFriendMovie.mediaType)}` : ""}`}
                        onClick={() => {
                          store.upsertMovie(topFriendMovie);
                          try {
                            sessionStorage.setItem("last_selected_movie", JSON.stringify(topFriendMovie));
                          } catch {
                            /* ignore */
                          }
                        }}
                        className="block text-base sm:text-xl font-bold text-white tracking-tight hover:text-accent transition-colors truncate"
                      >
                        {topFriendMovie.title}
                      </Link>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/80">
                        {topFriendMovie.imdb != null && (
                          <span className="nums flex items-center gap-1 font-semibold text-amber-400">
                            ★ {topFriendMovie.imdb.toFixed(1)}
                          </span>
                        )}
                        <span>·</span>
                        <span>{topFriendMovie.year}</span>
                        <span>·</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase font-medium">
                          {topFriendMovie.mediaType}
                        </span>
                        {topFriendMovie.trailerKey && (
                          <>
                            <span>·</span>
                            <span className="text-text-muted hover:text-white transition-colors">
                              Watch Trailer
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Title, Description, and Large Unboxed Poster Preview (5 cols) */}
                <div className="p-6 sm:p-8 flex flex-col justify-between bg-[#0b1019] border-t lg:border-t-0 lg:border-l border-white/[0.08] lg:col-span-5">
                  <div>
                    {/* Clean Heading without redundant kicker tags */}
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                      Friend suggestions
                    </h3>

                    {/* Richer descriptive text */}
                    <p className="mt-3 text-sm text-text-muted leading-relaxed">
                      Movies from accepted friends, ranked by supplied watched ratings, with watchlist plans presented separately on the suggestions page.
                    </p>

                    <p className="nums mt-3 text-sm text-text-primary">
                      {friendItems[0]?.reason}{friendItems[0]?.score != null ? ` · Score ${friendItems[0].score}` : ""}
                    </p>

                    {/* Thin hairline divider separating description from preview */}
                    <div className="my-6 h-px w-full bg-white/[0.08]" />

                    {/* Context info and View All text link above preview */}
                    <div className="flex items-baseline justify-between mb-3.5">
                      <span className="nums text-xs text-text-muted">
                        {friendsMovies.length} titles active across your network
                      </span>
                      <Link
                        to="/suggestions/friends"
                        className="group/link flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                      >
                        <span>View all</span>
                        <span className="transition-transform group-hover/link:translate-x-0.5">→</span>
                      </Link>
                    </div>

                    {/* Larger, unboxed overlapping poster collage (custom list style) */}
                    <div
                      onClick={() => navigate("/suggestions/friends")}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate("/suggestions/friends")}
                      className="group/preview cursor-pointer pt-1"
                    >
                      <div className="flex -space-x-5 sm:-space-x-6 overflow-hidden py-2">
                        {sampleFriends.map((movie, idx) => (
                          <div
                            key={movie.id}
                            className="relative h-32 w-22 sm:h-36 sm:w-24 shrink-0 overflow-hidden rounded-lg border border-[#0b1019] bg-surface shadow-xl transition-all duration-300 group-hover/preview:translate-x-1 group-hover/preview:border-white/20"
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

                        {friendsMovies.length > 7 && (
                          <div
                            className="relative flex h-32 w-22 sm:h-36 sm:w-24 shrink-0 items-center justify-center rounded-lg border border-[#0b1019] bg-[#141b2b] text-xs font-bold text-white shadow-xl"
                            style={{ zIndex: 3 }}
                          >
                            +{friendsMovies.length - 7}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Trailer Modal */}
      {activeTrailer && (
        <TrailerModal
          open={Boolean(activeTrailer)}
          trailerKey={activeTrailer.key}
          title={activeTrailer.title}
          onClose={() => setActiveTrailer(null)}
        />
      )}
    </AppShell>
  );
}

function TrailerModal({
  open,
  trailerKey,
  title,
  onClose,
}: {
  open: boolean;
  trailerKey?: string;
  title: string;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  useEscapeKey(open, onClose);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length > 0) {
      focusable[0]?.focus();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open || !trailerKey) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Trailer: ${title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-[#080c14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            {title} — Official Trailer
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trailer"
            className="flex h-7 w-7 items-center justify-center rounded-[4px] text-text-muted hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
          </button>
        </div>
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
            title={`${title} Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
