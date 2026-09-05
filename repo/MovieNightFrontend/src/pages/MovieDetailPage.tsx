import { useEffect, useRef, useState } from "react";
import { matchPath, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { usePosterTransition } from "../components/PosterTransitionContext";
import { moviesApi, type ApiMovieResponse } from "../api/movies";
import type { Movie, CastMember } from "../store/data";
import AppShell from "../components/AppShell";
import PixelPoster from "../components/PixelPoster";

interface FriendReview {
  userId: string | number;
  displayName: string;
  rating: number;
  notes?: string | null;
  status?: string;
  watchedAt?: string | null;
}

export default function MovieDetailPage() {
  const store = useStore();
  const { path, navigate } = useRouter();
  const { transitionData, clearTransition } = usePosterTransition();
  const params = matchPath("/movies/:id", path);
  const user = store.currentUser!;

  const initialMovie = params ? store.movieById(params.id) : undefined;
  const [movie, setMovie] = useState<Movie | undefined>(initialMovie);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [friendReviews, setFriendReviews] = useState<FriendReview[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);

  const destPosterRef = useRef<HTMLDivElement>(null);

  // Content tab toggle: "overview" vs "cast"
  const [activeTab, setActiveTab] = useState<"overview" | "cast">("overview");
  // Trailer active playback state
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);

  // Synchronize when store movies or params change
  useEffect(() => {
    if (params?.id) {
      const found = store.movieById(params.id);
      if (found) {
        setMovie(found);
      }
    }
  }, [params?.id, store]);

  // Fetch or enrich movie details and friend ratings from backend
  useEffect(() => {
    const movieIdParam = params?.id;
    if (!movieIdParam) return;

    let active = true;

    // 1. Fetch movie details from TMDB / local backend if needed
    const tmdbIdToFetch = movie?.tmdbId || (!isNaN(Number(movieIdParam)) ? Number(movieIdParam) : undefined);
    
    if (tmdbIdToFetch && (!movie || !movie.trailerKey || !movie.genres || movie.genres.length === 0)) {
      setIsLoadingDetails(true);
      moviesApi.getByTmdbId(tmdbIdToFetch).then((res: ApiMovieResponse | null) => {
        if (!active || !res) return;
        
        let parsedCast: CastMember[] | undefined = undefined;
        if (res.castMembers) {
          parsedCast = res.castMembers.split(",").map((name) => ({
            name: name.trim(),
            role: "Cast",
          }));
        }

        const enriched: Movie = {
          id: String(res.id ?? res.tmdbId ?? movieIdParam),
          tmdbId: res.tmdbId,
          title: res.title,
          year: res.releaseYear ?? (movie?.year || 2020),
          posterSeed: movie?.posterSeed ?? null,
          posterUrl: res.posterUrl || movie?.posterUrl || null,
          imdb: res.imdbRating ?? movie?.imdb ?? null,
          rt: res.rottenTomatoesRating ?? movie?.rt ?? null,
          overview: res.overview || movie?.overview || "",
          genres: res.genres ? res.genres.split(",").map((g) => g.trim()) : movie?.genres,
          director: res.director || movie?.director,
          trailerKey: res.trailerKey || movie?.trailerKey,
          cast: movie?.cast && movie.cast.length > 0 ? movie.cast : parsedCast,
        };

        setMovie((prev) => (prev ? { ...prev, ...enriched } : enriched));
      }).finally(() => {
        if (active) setIsLoadingDetails(false);
      });
    }

    // 2. Load friend reviews & ratings
    if (user) {
      const friends = store.friendsOf(user.id);
      const friendIds = friends.map((f) => f.id);

      // Seed with local store data first
      const currentMovieId = movie?.id || movieIdParam;
      const localReviews = store.friendRatings(currentMovieId).map((r) => ({
        userId: r.user.id,
        displayName: r.user.displayName,
        rating: r.rating,
        notes: store.entryFor(r.user.id, currentMovieId)?.description || null,
        status: "watched",
      }));
      setFriendReviews(localReviews);

      // Query live backend for friends' ratings
      if (friendIds.length > 0) {
        setIsLoadingFriends(true);
        moviesApi
          .getFriendsRatings(currentMovieId, friendIds)
          .then((backendRatings) => {
            if (!active) return;
            if (backendRatings && backendRatings.length > 0) {
              const liveRatings: FriendReview[] = backendRatings.map((br) => ({
                userId: br.userId,
                displayName: br.displayName,
                rating: br.personalRating ?? 0,
                notes: br.notes,
                status: br.status ? br.status.toLowerCase() : "watched",
                watchedAt: br.watchedAt,
              }));
              setFriendReviews(liveRatings);
            }
          })
          .catch((err) => console.warn("Failed to load friend reviews:", err))
          .finally(() => {
            if (active) setIsLoadingFriends(false);
          });
      }
    }

    return () => {
      active = false;
    };
  }, [params?.id, movie?.id, movie?.tmdbId, user, store]);

  const isTransitioningFromGrid = !!(
    transitionData &&
    movie &&
    transitionData.movieId === movie.id
  );

  // Synchronously initialize hero position
  const [animating, setAnimating] = useState(() => isTransitioningFromGrid);
  const [isReverse, setIsReverse] = useState(false);
  const [showContent, setShowContent] = useState(() => !isTransitioningFromGrid);
  const [heroStyle, setHeroStyle] = useState<React.CSSProperties | null>(() => {
    if (isTransitioningFromGrid && transitionData) {
      const { top, left, width, height } = transitionData.startRect;
      return {
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        height: `${height}px`,
        zIndex: 100,
        pointerEvents: "none",
        transition: "none",
        boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
      };
    }
    return null;
  });

  // Entrance Transition
  useEffect(() => {
    if (!isTransitioningFromGrid || isReverse) return;

    const startTimer = window.setTimeout(() => {
      if (destPosterRef.current) {
        const dest = destPosterRef.current.getBoundingClientRect();
        setHeroStyle({
          position: "fixed",
          top: `${dest.top}px`,
          left: `${dest.left}px`,
          width: `${dest.width}px`,
          height: `${dest.height}px`,
          zIndex: 100,
          pointerEvents: "none",
          transition: "all 0.52s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "0 15px 35px rgba(0,0,0,0.7)",
        });
      }
    }, 70);

    const contentTimer = window.setTimeout(() => {
      setShowContent(true);
    }, 380);

    const settleTimer = window.setTimeout(() => {
      setAnimating(false);
    }, 620);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(contentTimer);
      clearTimeout(settleTimer);
    };
  }, [isTransitioningFromGrid, isReverse]);

  // Back-navigation destination
  const backDest = transitionData?.referrer || "/movies";
  const backLabel = backDest.startsWith("/friends/")
    ? "Back to Friend"
    : backDest.startsWith("/suggestions")
      ? "Back to Suggestions"
      : "Back to Movies";

  // Reverse Transition
  const handleBack = () => {
    if (transitionData && destPosterRef.current) {
      setIsReverse(true);
      setShowContent(false);

      const destRect = destPosterRef.current.getBoundingClientRect();
      const { top, left, width, height } = transitionData.startRect;

      setHeroStyle({
        position: "fixed",
        top: `${destRect.top}px`,
        left: `${destRect.left}px`,
        width: `${destRect.width}px`,
        height: `${destRect.height}px`,
        zIndex: 100,
        pointerEvents: "none",
        transition: "none",
        boxShadow: "0 15px 35px rgba(0,0,0,0.7)",
      });
      setAnimating(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeroStyle({
            position: "fixed",
            top: `${top}px`,
            left: `${left}px`,
            width: `${width}px`,
            height: `${height}px`,
            zIndex: 100,
            pointerEvents: "none",
            transition: "all 0.44s cubic-bezier(0.16, 1, 0.3, 1)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          });
        });
      });

      window.setTimeout(() => {
        clearTransition();
        navigate(backDest);
      }, 460);
    } else {
      navigate(backDest);
    }
  };

  if (!movie) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[1240px]">
          <BackLink onClick={() => navigate(backDest)} label={backLabel} />
          {isLoadingDetails ? (
            <div className="mt-12 flex flex-col items-center justify-center text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="mt-4 text-sm text-text-muted">Loading movie details...</p>
            </div>
          ) : (
            <p className="mt-8 text-text-muted">That movie couldn&apos;t be found.</p>
          )}
        </div>
      </AppShell>
    );
  }

  const entry = store.entryFor(user.id, movie.id);
  const friendAvg =
    friendReviews.length > 0
      ? friendReviews.reduce((s, r) => s + r.rating, 0) / friendReviews.length
      : null;

  return (
    <AppShell>
      {/* Centered Movie Detail Container */}
      <div className="mx-auto max-w-[1240px]">
        {/* Floating Hero Poster Clone */}
        {animating && heroStyle && (
          <div
            style={heroStyle}
            className="overflow-hidden rounded-xl border border-white/20 bg-surface"
          >
            <div className="aspect-[2/3] w-full h-full">
              {movie.posterUrl ? (
                <img
                  src={movie.posterUrl}
                  alt=""
                  className="h-full w-full bg-surface object-cover"
                />
              ) : movie.posterSeed == null ? (
                <div className="flex h-full items-center justify-center p-6">
                  <span className="text-center text-lg font-medium text-text-muted">
                    {movie.title}
                  </span>
                </div>
              ) : (
                <PixelPoster seed={movie.posterSeed} />
              )}
            </div>
          </div>
        )}

        <div>
          {/* Back Link */}
          <div
            className={`transition-all duration-300 ease-out ${
              showContent ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
            }`}
          >
            <BackLink onClick={handleBack} label={backLabel} />
          </div>

          {/* 1. Header Area (Title, Year, Ratings above Media) */}
          <div
            className={`mt-4 transition-all duration-400 ease-out ${
              showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {movie.title}
              </h1>
              <span className="nums text-lg font-medium text-text-muted">
                ({movie.year})
              </span>
              {movie.director && (
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                  Directed by {movie.director}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {entry?.status === "watched" && entry.rating != null && (
                <div className="nums inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                  <span className="text-accent">★</span> {entry.rating.toFixed(1)}/10{" "}
                  <span className="text-text-muted">(your rating)</span>
                </div>
              )}

              {entry?.status === "watchlist" && (
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
                  <span>⏱ In Watchlist</span>
                </div>
              )}

              <ExternalRatings imdb={movie.imdb} rt={movie.rt} />
            </div>
          </div>

          {/* 2. Side-by-Side Media Block: Poster + Large Widescreen Trailer */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[330px_1fr] lg:gap-8 items-start">
            {/* Left: Poster Card */}
            <div className="w-full max-w-[320px] sm:max-w-[330px] mx-auto lg:mx-0">
              <div
                ref={destPosterRef}
                className={`overflow-hidden rounded-xl border border-white/10 bg-surface shadow-xl transition-opacity duration-150 ${
                  animating ? "opacity-0" : "opacity-100"
                }`}
              >
                <div className="aspect-[2/3] w-full">
                  {movie.posterUrl ? (
                    <img
                      src={movie.posterUrl}
                      alt={movie.title}
                      className="h-full w-full bg-surface object-cover"
                    />
                  ) : movie.posterSeed == null ? (
                    <div className="flex h-full items-center justify-center p-6">
                      <span className="text-center text-lg font-medium text-text-muted">
                        {movie.title}
                      </span>
                    </div>
                  ) : (
                    <PixelPoster seed={movie.posterSeed} />
                  )}
                </div>
              </div>
            </div>

            {/* Right: Expansive 16:9 Trailer Box */}
            <div
              className={`w-full transition-all duration-400 ease-out ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[#080c16] shadow-2xl">
                {movie.trailerKey ? (
                  isPlayingTrailer ? (
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${movie.trailerKey}?autoplay=1&rel=0`}
                      title={`${movie.title} Trailer`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setIsPlayingTrailer(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setIsPlayingTrailer(true);
                        }
                      }}
                      className="group/trailer relative h-full w-full cursor-pointer bg-black/40"
                    >
                      {/* Background Backdrop */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-[#05070d] via-[#090e1c] to-[#12192e] opacity-90 transition-transform duration-300 group-hover/trailer:scale-[1.02]" />

                      {/* Subtle atmospheric center glow */}
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(79,70,229,0.18)_0%,transparent_70%)]" />

                      {/* Trailer Label */}
                      <div className="absolute top-4 left-5 z-10">
                        <span className="rounded-md border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 backdrop-blur-md">
                          Official Trailer
                        </span>
                      </div>

                      {/* Left Corner Play Button */}
                      <div className="absolute bottom-5 left-5 z-10 flex items-center gap-3 rounded-full border border-white/20 bg-black/70 px-4 py-2.5 text-white backdrop-blur-md transition-all duration-200 group-hover/trailer:border-accent group-hover/trailer:bg-accent group-hover/trailer:scale-105 shadow-2xl">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black transition-colors group-hover/trailer:bg-white">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </span>
                        <span className="text-xs font-bold tracking-wide">
                          Play Trailer
                        </span>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-text-muted">
                    <span className="text-sm font-medium">No video trailer available for this title</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Below Media: Tactile Connected Genre Badges */}
          {movie.genres && movie.genres.length > 0 && (
            <div
              className={`mt-5 transition-all duration-400 ease-out ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
            >
              <div className="inline-flex items-stretch rounded-md border border-white/15 bg-black/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
                {movie.genres.map((genre, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === movie.genres!.length - 1;
                  return (
                    <div
                      key={genre}
                      className={`flex h-7 items-center justify-center px-3 text-[11px] font-bold text-zinc-300 transition-colors ${
                        isFirst ? "rounded-l-md" : ""
                      } ${isLast ? "rounded-r-md" : ""} ${
                        !isLast ? "border-r border-white/10" : ""
                      }`}
                      style={{
                        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
                      }}
                    >
                      <span>{genre}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Interactive Tactile Toggle (Overview vs Cast) */}
          <div
            className={`mt-6 transition-all duration-400 ease-out ${
              showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <div className="inline-flex items-stretch rounded-md border border-white/15 bg-black/40 p-0.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`flex h-8 items-center justify-center rounded-[4px] px-4 text-xs font-bold transition-all duration-200 ${
                  activeTab === "overview"
                    ? "bg-accent text-white shadow-[inset_0_-2px_1px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.4)]"
                    : "text-text-muted hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("cast")}
                className={`flex h-8 items-center justify-center rounded-[4px] px-4 text-xs font-bold transition-all duration-200 ${
                  activeTab === "cast"
                    ? "bg-accent text-white shadow-[inset_0_-2px_1px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.4)]"
                    : "text-text-muted hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                Cast &amp; Crew
              </button>
            </div>

            {/* Tab Content Display */}
            <div className="mt-4">
              {activeTab === "overview" && (
                <div className="max-w-4xl">
                  {movie.overview ? (
                    <p className="leading-relaxed text-text-primary text-sm sm:text-base">
                      {movie.overview}
                    </p>
                  ) : (
                    <p className="text-sm text-text-muted">No synopsis available for this title.</p>
                  )}
                </div>
              )}

              {activeTab === "cast" && (
                <div className="max-w-4xl">
                  {movie.cast && movie.cast.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {movie.cast.map((c) => (
                        <div
                          key={c.name}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs transition-colors hover:border-white/20"
                        >
                          <span className="font-semibold text-white">{c.name}</span>
                          <span className="text-text-muted">{c.role}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">Cast information unavailable.</p>
                  )}
                </div>
              )}
            </div>

            {/* 5. User Description / Notes Box */}
            {entry && (
              <div className="mt-6 max-w-4xl">
                <DescriptionBox
                  key={entry.id}
                  initial={entry.description}
                  onSave={(v) => store.updateDescription(entry.id, v)}
                />
              </div>
            )}

            {/* 6. Context-dependent action buttons */}
            <div className="mt-6">
              <ActionArea movie={movie} onBack={handleBack} />
            </div>

            {/* 7. Friends' Ratings & Reviews Section */}
            <div className="mt-10 max-w-4xl">
              <div className="my-6 h-px bg-white/10" />
              <section className="rounded-xl border border-white/10 bg-surface/60 p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-sm font-semibold text-white">
                      Friends&apos; Reviews &amp; Ratings
                    </h2>
                    {friendAvg != null && (
                      <span className="nums inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">
                        ★ {friendAvg.toFixed(1)} avg
                      </span>
                    )}
                  </div>
                  {isLoadingFriends && (
                    <span className="text-xs text-text-muted">Updating...</span>
                  )}
                </div>

                {friendReviews.length > 0 ? (
                  <ul className="mt-4 space-y-3">
                    {friendReviews.map((r) => (
                      <li
                        key={String(r.userId)}
                        className="rounded-lg border border-white/5 bg-white/[0.02] p-3.5 transition-colors hover:border-white/10"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                              {r.displayName.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-text-primary text-sm">
                              {r.displayName}
                            </span>
                            {r.status && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted bg-white/5">
                                {r.status}
                              </span>
                            )}
                          </div>
                          {r.rating > 0 ? (
                            <span className="nums font-bold text-accent text-sm">
                              ★ {r.rating.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">No score</span>
                          )}
                        </div>
                        {r.notes && (
                          <p className="mt-2 text-xs leading-relaxed text-zinc-300 italic">
                            &ldquo;{r.notes}&rdquo;
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-text-muted">
                    None of your friends have reviewed this movie yet.
                  </p>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ActionArea({
  movie,
  onBack,
}: {
  movie: Movie;
  onBack: () => void;
}) {
  const store = useStore();
  const user = store.currentUser!;
  const entry = store.entryFor(user.id, movie.id);
  const [rating, setRating] = useState(7.5);
  const [desc, setDesc] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // No entry → Add to Watchlist or Mark as Watched
  if (!entry) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => store.addToWatchlist(movie.id)}
          className="rounded-lg bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent/90 active:scale-95"
        >
          + Add to Watchlist
        </button>

        {!panelOpen ? (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500 hover:text-black active:scale-95"
          >
            ✓ Mark as Watched
          </button>
        ) : (
          <div className="mt-2 w-full rounded-xl border border-white/15 bg-[#0e1320] p-5 shadow-xl max-w-xl">
            <label className="block">
              <div className="nums mb-2 flex items-center justify-between text-sm font-semibold text-text-primary">
                <span>Rate this movie</span>
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
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Add your review or notes (optional)"
              rows={3}
              className="mt-3.5 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  store.addMovie({
                    existingMovieId: movie.id,
                    tmdbId: movie.tmdbId,
                    title: movie.title,
                    year: movie.year,
                    posterUrl: movie.posterUrl,
                    overview: movie.overview,
                    imdb: movie.imdb,
                    rt: movie.rt,
                    status: "watched",
                    rating,
                    description: desc,
                  });
                  setPanelOpen(false);
                }}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-black transition-all hover:bg-emerald-400"
              >
                Confirm Watched
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-lg border border-white/10 bg-[#141824] px-4 py-2 text-xs text-text-muted hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Own watchlist item → Mark as Watched
  if (entry.status === "watchlist") {
    return (
      <div>
        {!panelOpen ? (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500 hover:text-black active:scale-95"
          >
            ✓ Mark as Watched
          </button>
        ) : (
          <div className="rounded-xl border border-white/15 bg-[#0e1320] p-5 shadow-xl max-w-xl">
            <label className="block">
              <div className="nums mb-2 flex items-center justify-between text-sm font-semibold text-text-primary">
                <span>Rate this movie</span>
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
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Add your review or notes (optional)"
              rows={3}
              className="mt-3.5 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => store.markWatched(entry.id, rating, desc)}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-black transition-all hover:bg-emerald-400"
              >
                Confirm Watched
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-lg border border-white/10 bg-[#141824] px-4 py-2 text-xs text-text-muted hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <RemoveLink
          confirm={confirmRemove}
          setConfirm={setConfirmRemove}
          title={movie.title}
          onRemove={() => {
            store.removeEntry(entry.id);
            onBack();
          }}
        />
      </div>
    );
  }

  // Own watched item
  return (
    <RemoveLink
      confirm={confirmRemove}
      setConfirm={setConfirmRemove}
      title={movie.title}
      onRemove={() => {
        store.removeEntry(entry.id);
        onBack();
      }}
    />
  );
}

function RemoveLink({
  confirm,
  setConfirm,
  title,
  onRemove,
}: {
  confirm: boolean;
  setConfirm: (v: boolean) => void;
  title: string;
  onRemove: () => void;
}) {
  if (confirm) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs">
        <span className="text-text-muted">Remove {title} from your list?</span>
        <button
          type="button"
          onClick={onRemove}
          className="font-bold text-red-400 hover:underline"
        >
          Yes, remove
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="text-text-muted hover:text-white"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className="mt-4 block text-xs text-text-muted transition-colors hover:text-red-400 hover:underline"
    >
      Remove from list
    </button>
  );
}

function DescriptionBox({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Your Notes &amp; Review
        </span>
        {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={() => {
          if (value !== initial) {
            onSave(value);
            setSaved(true);
          }
        }}
        rows={3}
        placeholder="What did you think of this movie? Write your thoughts..."
        className="w-full resize-none rounded-xl border border-white/10 bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none transition-all"
      />
    </div>
  );
}

function ExternalRatings({ imdb, rt }: { imdb: number | null; rt: number | null }) {
  const hasImdb = imdb != null;
  const hasRt = rt != null;

  if (!hasImdb && !hasRt) return null;

  return (
    <div className="flex items-center gap-2">
      {hasImdb && (
        <span className="nums inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-300 shadow-sm">
          <span className="rounded bg-amber-400 px-1 py-0.2 text-[10px] font-black text-black">
            IMDb
          </span>
          {imdb.toFixed(1)}
        </span>
      )}
      {hasRt && (
        <span className="nums inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-bold text-rose-300 shadow-sm">
          <span className="text-xs">🍅</span>
          {rt}%
        </span>
      )}
    </div>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-white"
    >
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}
