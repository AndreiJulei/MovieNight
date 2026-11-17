import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { matchPath, useRouter, useQuery, safeInternalUrl } from "../router";
import BackLink from "../components/BackLink";
import { useStore } from "../store/MovieStore";
import { usePosterTransition } from "../components/PosterTransitionContext";
import { playFlipEntrance } from "../components/posterTransition";
import { moviesApi, isAbortError } from "../api/movies";
import { toSimilarTitle } from "../api/similarMovies";
import type { Movie, MediaType } from "../store/data";
import { titleId, parseTitleId, resourceType } from "../store/titleIdentity";
import AppShell from "../components/AppShell";
import AddToListPopover from "../components/AddToListPopover";
import CompactTitleHero from "../components/CompactTitleHero";
import TrailerEmbed from "../components/TrailerEmbed";
import { usePhoneLayout } from "../hooks/useCompactLayout";
import MovieGrid from "../components/MovieGrid";
import ShelfReloadButton from "../components/ShelfReloadButton";
import ShelfSection from "../components/ShelfSection";
import {
  COMPACT_ACTION_CLASS,
  SHELF_SPACING_CLASS,
  SHELF_TRACK_CLASS,
  WIDE_CONTENT_CLASS,
} from "../components/layout";
import PersonalRatingInput from "../components/PersonalRatingInput";
import useWatchlistSave from "../hooks/useWatchlistSave";
import { useToast } from "../components/Toast";
import {
  formatRuntime,
  getInitials,
  parseCastMembers,
  providerRatingNotice,
  resolveDetailTitleDisplay,
  shouldSyncProviderRatings,
  RATING_SYNC_INTERVAL_MS,
} from "../components/movieDetailLogic";

interface FriendReview {
  userId: string | number;
  displayName: string;
  rating: number | null;
  status?: string;
  watchedAt?: string | null;
}

export default function MovieDetailPage() {
  const store = useStore();
  const { path, previousUrl } = useRouter();
  const query = useQuery();
  const typeParam = query.get("type");
  const { transitionData, clearTransition } = usePosterTransition();
  const params = matchPath("/movies/:id", path);
  const user = store.currentUser!;

  const requestedId = useMemo(() => {
    const id = params?.id ?? "";
    if (/^\d+$/.test(id) && typeParam) {
      try {
        return titleId(Number(id), typeParam.toUpperCase());
      } catch {
        return id;
      }
    }
    return id;
  }, [params?.id, typeParam]);

  const initialMovie = store.movieById(requestedId);
  const [resolvedMovie, setMovie] = useState<{ key: string; movie: Movie } | null>(null);
  const movie = resolvedMovie?.key === requestedId ? resolvedMovie.movie : initialMovie;

  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsRetry, setDetailsRetry] = useState(0);

  // Inline hero trailer state
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false);
  // #28: the poster title page is for phones; tablets keep the wide hero.
  const compact = usePhoneLayout();
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});
  const [ratingSyncAttempt, setRatingSyncAttempt] = useState(0);

  // Similar titles state
  const [similarMovies, setSimilarMovies] = useState<Movie[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [similarReload, setSimilarReload] = useState(0);

  // Friends reviews state
  const [friendReviews, setFriendReviews] = useState<FriendReview[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [friendRetry, setFriendRetry] = useState(0);

  // Load movie details
  useEffect(() => {
    const controller = new AbortController();
    setDetailsError(null);
    setIsLoadingDetails(true);
    void (async () => {
      try {
        const identity = parseTitleId(requestedId);
        if (typeParam && identity.category && resourceType(typeParam.toUpperCase()) !== identity.category) {
          throw new Error("Title link has conflicting resource types. Reopen the title from discovery.");
        }
        const res = identity.providerId != null
          ? await moviesApi.getByTmdbId(identity.providerId, identity.category!, {
              signal: controller.signal,
              userScope: user?.id,
            })
          : await moviesApi.getById(identity.catalogId!, {
              signal: controller.signal,
              userScope: user?.id,
            });
        if (controller.signal.aborted) return;
        if (!res || !res.title || !res.mediaType) throw new Error("Could not confirm title details. Retry.");

        const parsedCast = parseCastMembers(res.castMembers, res.cast);

        const enriched: Movie = {
          id: titleId(res.tmdbId, res.mediaType, res.id),
          catalogMovieId: res.id,
          tmdbId: res.tmdbId,
          title: res.title,
          mediaType: res.mediaType as MediaType,
          year: res.releaseYear ?? null,
          posterUrl: res.posterUrl ?? null,
          backdropUrl: res.backdropUrl ?? null,
          logoUrl: res.logoUrl ?? null,
          runtimeMinutes: res.runtimeMinutes ?? null,
          posterSeed: null,
          imdb: res.imdbRating ?? null,
          tmdbRating: res.tmdbVoteAverage ?? null,
          tmdbVotes: res.tmdbVoteCount ?? null,
          rt: res.rottenTomatoesRating ?? null,
          overview: res.overview ?? "",
          genres: res.genres?.split(",").map((g) => g.trim()).filter(Boolean) ?? [],
          director: res.director,
          trailerKey: res.trailerKey,
          cast: parsedCast,
          seasonsCount: res.seasonsCount,
          episodesCount: res.episodesCount,
        };

        if (identity.providerId != null ? enriched.id !== requestedId : res.id !== identity.catalogId) {
          throw new Error("Provider returned a different title identity. Retry.");
        }
        setMovie({ key: requestedId, movie: enriched });
        store.upsertMovie(enriched);
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setDetailsError(error instanceof Error ? error.message : "Could not load details. Retry.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingDetails(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [requestedId, typeParam, user?.id, detailsRetry, store.upsertMovie]);

  // Background OMDb enrichment sync: re-fetch ratings a bounded number of times
  // for released titles that still lack IMDb / Rotten Tomatoes data.
  useEffect(() => {
    if (!movie || movie.id !== requestedId || isLoadingDetails) return;
    if (!shouldSyncProviderRatings(movie, ratingSyncAttempt)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const identity = parseTitleId(requestedId);
          const res = identity.providerId != null
            ? await moviesApi.getByTmdbId(identity.providerId, identity.category!, {
                signal: controller.signal,
                userScope: user?.id,
                fresh: true,
              })
            : await moviesApi.getById(identity.catalogId!, {
                signal: controller.signal,
                userScope: user?.id,
              });
          if (controller.signal.aborted || !res) return;
          setMovie((prev) => {
            if (!prev || prev.key !== requestedId) return prev;
            const updated = {
              ...prev.movie,
              imdb: res.imdbRating ?? prev.movie.imdb ?? null,
              rt: res.rottenTomatoesRating ?? prev.movie.rt ?? null,
              tmdbRating: res.tmdbVoteAverage ?? prev.movie.tmdbRating ?? null,
              tmdbVotes: res.tmdbVoteCount ?? prev.movie.tmdbVotes ?? null,
            };
            store.upsertMovie(updated);
            return { key: prev.key, movie: updated };
          });
        } catch {
          // Best-effort refresh; the page keeps showing current data.
        } finally {
          if (!controller.signal.aborted) setRatingSyncAttempt((n) => n + 1);
        }
      })();
    }, RATING_SYNC_INTERVAL_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [movie, requestedId, isLoadingDetails, ratingSyncAttempt, user?.id, store]);

  // Asynchronous credit photo enrichment
  useEffect(() => {
    if (!movie?.tmdbId) return;
    const hasPhotos = movie.cast && movie.cast.some((c) => Boolean(c.profileUrl));
    if (hasPhotos) return;

    let active = true;
    moviesApi.getCredits(movie.tmdbId, movie.mediaType).then((credits) => {
      if (!active || !credits || credits.length === 0) return;
      setMovie((prev) => {
        if (!prev || prev.movie.id !== movie.id) return prev;
        const updated = { ...prev.movie, cast: credits };
        store.upsertMovie(updated);
        return { key: prev.key, movie: updated };
      });
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [movie?.id, movie?.tmdbId, movie?.mediaType, store]);

  // Load similar titles (Ticket 5 integration / DP06)
  useEffect(() => {
    if (!movie?.tmdbId) {
      setSimilarMovies([]);
      return;
    }
    const controller = new AbortController();
    setIsLoadingSimilar(true);
    moviesApi
      .getSimilarTitles(movie.tmdbId, movie.mediaType, 10)
      .then((items) => {
        if (controller.signal.aborted) return;
        const sourceType = movie.mediaType;
        const mapped = items
          .map((item) => toSimilarTitle(item, sourceType))
          .filter((item): item is Movie => item !== null);
        setSimilarMovies(mapped);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingSimilar(false);
      });

    return () => controller.abort();
  }, [movie?.tmdbId, movie?.mediaType, similarReload]);

  // Load friends' reviews
  useEffect(() => {
    const currentMovieId = movie?.catalogMovieId;
    if (!user || currentMovieId == null) return;
    const controller = new AbortController();

    const friends = store.friendsOf(user.id);
    const friendIds = friends.map((f) => f.id);
    setFriendReviews([]);
    setIsLoadingFriends(false);
    setFriendError(null);

    if (friendIds.length > 0) {
      setIsLoadingFriends(true);
      moviesApi
        .getFriendsRatings(currentMovieId, friendIds, {
          signal: controller.signal,
          userScope: user.id,
        })
        .then((backendRatings) => {
          if (controller.signal.aborted) return;
          if (backendRatings) {
            const liveRatings: FriendReview[] = backendRatings.map((br) => ({
              userId: br.userId,
              displayName: br.displayName,
              rating: br.personalRating ?? null,
              status: br.status ? br.status.toLowerCase() : "watched",
              watchedAt: br.watchedAt,
            }));
            setFriendReviews(liveRatings);
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted && !isAbortError(err)) {
            setFriendError(err instanceof Error ? err.message : "Could not load ratings. Retry.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoadingFriends(false);
        });
    }

    return () => controller.abort();
  }, [movie?.catalogMovieId, user, store.friendsOf, friendRetry]);

  // Back-navigation destination
  const backDest = useMemo(() => {
    const safePrevious = safeInternalUrl(previousUrl);
    if (safePrevious) return safePrevious;
    const currentMediaType = (typeParam || movie?.mediaType || "").toUpperCase();
    if (currentMediaType === "TV") return "/explore/tv";
    if (currentMediaType === "ANIME") return "/explore/anime";
    return "/explore/movies";
  }, [previousUrl, typeParam, movie?.mediaType]);

  const backLabel = useMemo(() => {
    if (backDest.startsWith("/friends/")) return "Back to Friend";
    if (backDest.startsWith("/suggestions")) return "Back to Suggestions";
    if (backDest.startsWith("/explore")) {
      if (backDest.includes("/tv")) return "Back to TV Series";
      if (backDest.includes("/anime")) return "Back to Anime";
      return "Back to Explore";
    }
    if (backDest.startsWith("/movies")) return "Back to Library";
    return "Back";
  }, [backDest]);


  // Stop inline trailer and reset rating sync when navigating to another title
  useEffect(() => {
    setIsTrailerPlaying(false);
    setRatingSyncAttempt(0);
  }, [requestedId]);

  // Stop inline trailer on Escape key
  useEffect(() => {
    if (!isTrailerPlaying) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsTrailerPlaying(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTrailerPlaying]);

  // #29: FLIP entrance from the clicked poster where View Transitions are unavailable.
  const hasMovie = Boolean(movie);
  useLayoutEffect(() => {
    if (!hasMovie || !transitionData || transitionData.movieId !== requestedId) return;
    const target = document.querySelector<HTMLElement>(".poster-hero-target");
    if (target) playFlipEntrance(target, transitionData.startRect);
    clearTransition();
  }, [hasMovie, requestedId, transitionData, clearTransition]);

  if (!movie) {
    return (
      <AppShell fullBleed>
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12 pt-6">
          <BackLink fallback={previousUrl ? undefined : backDest} onBeforeBack={clearTransition} label={backLabel} />
          {isLoadingDetails ? (
            <div className="mt-16 flex flex-col items-center justify-center text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="mt-4 text-sm text-text-muted">Loading title details...</p>
            </div>
          ) : (
            <div role="alert" className="mt-12 flex items-center gap-3 text-text-muted">
              <span>{detailsError ?? "That title could not be found."}</span>
              <button
                type="button"
                className="quiet-action inline-flex min-h-8 items-center text-sm text-link focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => setDetailsRetry((r) => r + 1)}
              >
                Retry details
              </button>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  const entry = store.entryFor(user.id, movie.id);
  const suppliedRatings = friendReviews.flatMap((r) => (r.rating == null ? [] : [r.rating]));
  const friendAvg = suppliedRatings.length
    ? suppliedRatings.reduce((sum, rating) => sum + rating, 0) / suppliedRatings.length
    : null;

  const backdropUrl = movie.backdropUrl || movie.posterUrl;
  const runtimeFormatted = formatRuntime(movie.runtimeMinutes);
  const castList = movie.cast && movie.cast.length > 0 ? movie.cast : parseCastMembers("", []);

  // #29 TX03: critic scores arrive after the page; hold their place instead of delaying it.
  const awaitingScores = !providerRatingNotice(movie) &&
    (isLoadingDetails || shouldSyncProviderRatings(movie, ratingSyncAttempt));
  const scoreSkeleton = (label: string) => (
    <span
      role="status"
      aria-label={`Loading ${label} score`}
      className="inline-block h-[22px] w-16 animate-pulse rounded-md border border-white/10 bg-white/[0.08]"
    />
  );

  const heroDetails = (
    <>
      {/* Title Typography */}
      {(() => {
        const display = resolveDetailTitleDisplay(movie, failedLogos);
        if (display.mode === "logo") {
          return (
            <h1 className="m-0">
              <img
                src={display.logoUrl}
                alt={display.title}
                onError={() => setFailedLogos((f) => ({ ...f, [movie.id]: true }))}
                className="max-h-20 sm:max-h-28 max-w-full object-contain object-left drop-shadow-lg"
              />
            </h1>
          );
        }
        return (
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight drop-shadow-md">
            {display.title}
          </h1>
        );
      })()}

      <div>
      {/* Metadata Line: Ratings, Year, Runtime, 4K, Media Type */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {/* IMDb Rating Badge */}
        {movie.imdb != null && (
          <span className="nums inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-400">
            <span className="rounded bg-amber-400 px-1 py-0.2 text-[10px] font-black text-black">
              IMDb
            </span>
            {movie.imdb.toFixed(1)}
          </span>
        )}
        {movie.imdb == null && awaitingScores && scoreSkeleton("IMDb")}

        {/* TMDb Rating Badge */}
        {movie.tmdbRating != null && (
          <span className="nums inline-flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-bold text-indigo-400">
            ★ {movie.tmdbRating.toFixed(1)} TMDb
          </span>
        )}

        {/* Rotten Tomatoes Badge */}
        {movie.rt != null && (
          <span className="nums inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-300">
            <span>🍅</span>
            {movie.rt}%
          </span>
        )}
        {movie.rt == null && awaitingScores && scoreSkeleton("Rotten Tomatoes")}

        {providerRatingNotice(movie) && (
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-text-muted">
            {providerRatingNotice(movie)}
          </span>
        )}

        {/* Personal Rating Badge */}
        {entry?.status === "watched" && entry.rating != null && (
          <span className="nums inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/25 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            <span className="text-accent">★</span> {entry.rating.toFixed(1)}{" "}
            <span className="text-text-muted text-[11px] font-normal">(Yours)</span>
          </span>
        )}

        {movie.year && (
          <>
            <span className="text-white/30">·</span>
            <span className="nums font-semibold text-text-primary">{movie.year}</span>
          </>
        )}

        {runtimeFormatted && (
          <>
            <span className="text-white/30">·</span>
            <span className="nums font-medium text-text-primary">{runtimeFormatted}</span>
          </>
        )}

        {/* Sleek Quality Tag */}
        {movie.mediaType !== "TV" && movie.mediaType !== "ANIME" && (
          <>
            <span className="text-white/30">·</span>
            <span className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-text-primary">
              4K
            </span>
          </>
        )}

        {movie.mediaType === "TV" && (
          <span className="rounded-md border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-400">
            TV Series{movie.seasonsCount ? <> • <span className="nums">{movie.seasonsCount}</span> Season{movie.seasonsCount > 1 ? "s" : ""}</> : ""}
          </span>
        )}

        {movie.mediaType === "ANIME" && (
          <span className="rounded-md border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-xs font-semibold text-purple-400">
            Anime{movie.episodesCount ? <> • <span className="nums">{movie.episodesCount}</span> Eps</> : ""}
          </span>
        )}
      </div>

      {/* Genres row */}
      {movie.genres && movie.genres.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {movie.genres.map((genre) => (
            <span
              key={genre}
              className="rounded-full border border-white/10 bg-black/40 px-3 py-0.5 text-xs font-medium text-text-primary backdrop-blur-sm"
            >
              {genre}
            </span>
          ))}
          {movie.director && (
            <span className="text-xs text-text-muted ml-1.5">
              Dir. <span className="text-text-primary font-medium">{movie.director}</span>
            </span>
          )}
        </div>
      )}

      {/* Clamped overview synopsis (2-3 lines) */}
      {movie.overview && (
        <p className="mt-3 line-clamp-2 sm:line-clamp-3 text-sm leading-relaxed text-text-primary/90 max-w-2xl drop-shadow-sm">
          {movie.overview}
        </p>
      )}
      </div>
    </>
  );

  return (
    <AppShell fullBleed>
      {/* ── 1. Full-Bleed Cinematic Hero Header (DP01) ── */}
      {compact ? (
        <CompactTitleHero
          title={movie.title}
          posterUrl={movie.posterUrl}
          backdropUrl={movie.backdropUrl}
          trailerKey={movie.trailerKey}
          isTrailerPlaying={isTrailerPlaying}
          onToggleTrailer={() => setIsTrailerPlaying((v) => !v)}
          backLink={<BackLink fallback={previousUrl ? undefined : backDest} onBeforeBack={clearTransition} label={backLabel} />}
        >
          {heroDetails}
        </CompactTitleHero>
      ) : (
        <section
          role="region"
          aria-label={`${movie.title} hero banner`}
          className="relative w-full min-h-[560px] sm:min-h-[640px] lg:min-h-[720px] overflow-hidden bg-[#05070d] select-none"
        >
          {/* Backdrop artwork */}
          <div className="absolute inset-0">
            {isTrailerPlaying ? (
              <div className="h-full w-full bg-black">
                <TrailerEmbed title={movie.title} trailerKey={movie.trailerKey} />
              </div>
            ) : backdropUrl ? (
              <img
                src={backdropUrl}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover object-center lg:object-top"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-tr from-[#05070d] via-[#090e1c] to-[#12192e]" />
            )}
          </div>

          {/* Cinematic Vignettes: dark bottom ground and side text vignettes */}
          <div
            aria-hidden="true"
            className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${isTrailerPlaying ? "opacity-0" : "opacity-100"}`}
          >
            <div className="absolute inset-x-0 bottom-0 h-48 sm:h-56 bg-gradient-to-t from-[#05070d] via-[#05070d]/60 to-transparent" />
            <div className="absolute inset-y-0 left-0 w-full sm:w-1/2 bg-gradient-to-r from-[#05070d]/85 via-[#05070d]/40 to-transparent" />
          </div>

          {/* Hero Overlay Content */}
          <div className={`relative z-20 mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12 pt-16 sm:pt-20 lg:pt-8 pb-6 sm:pb-8 flex flex-col justify-between min-h-[560px] sm:min-h-[640px] lg:min-h-[720px] ${isTrailerPlaying ? "pointer-events-none" : ""}`}>
            {/* Top Bar with Back Link */}
            <div className="pointer-events-auto flex items-center justify-between gap-3">
              <BackLink fallback={previousUrl ? undefined : backDest} onBeforeBack={clearTransition} label={backLabel} />
            </div>

            {/* Bottom aligned logo and details; fade out while the trailer plays */}
            <div
              aria-hidden={isTrailerPlaying}
              className={`flex items-end gap-6 lg:gap-8 transition-opacity duration-500 ${isTrailerPlaying ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            >
              {/* #29: the poster a card morphs into (and back out of) */}
              <div
                data-testid="hero-poster"
                className="poster-hero-target relative aspect-[2/3] w-[150px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-surface shadow-2xl lg:w-[220px]"
              >
                {movie.posterUrl ? (
                  <img src={movie.posterUrl} alt={`${movie.title} poster`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm font-semibold text-text-muted">
                    {movie.title}
                  </div>
                )}
              </div>
              <div data-testid="hero-details" className="min-w-0 max-w-3xl text-left">
                {heroDetails}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 2. Action Button Row & Inline Rating Slider, below the hero (DP01, DP02, DP03) ── */}
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12 pt-5">
        <ActionArea
          movie={movie}
          compact={compact}
          isTrailerPlaying={isTrailerPlaying}
          onToggleTrailer={() => setIsTrailerPlaying((v) => !v)}
        />
      </div>

      {/* Main Container below Hero */}
      <div className={`${WIDE_CONTENT_CLASS} pt-10 pb-16 ${SHELF_SPACING_CLASS}`}>
        {/* ── 3. Actor Cast Photo Gallery (DP04) ── */}
        {castList.length > 0 && (
          <ShelfSection ariaLabel="Key cast members" title="Key Cast">
            <div
              className={`flex items-start gap-4 sm:gap-6 overflow-x-auto ${SHELF_TRACK_CLASS}`}
              style={{ scrollbarWidth: "none" }}
            >
              {castList.map((member) => (
                <div
                  key={member.name}
                  data-shelf-item
                  className="flex w-28 sm:w-32 shrink-0 flex-col text-left group select-none"
                >
                  <div className="relative mb-2.5 aspect-[3/4] w-full overflow-hidden rounded-xl border border-white/10 bg-surface shadow-md transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-accent">
                    {member.profileUrl ? (
                      <img
                        src={member.profileUrl}
                        alt={member.name}
                        loading="lazy"
                        className="h-full w-full object-cover object-top"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          const fallback = e.currentTarget.parentElement?.querySelector(".avatar-fallback");
                          if (fallback) fallback.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div
                      className={`avatar-fallback ${
                        member.profileUrl ? "hidden" : "flex"
                      } h-full w-full items-center justify-center bg-accent/20 text-accent font-bold text-lg`}
                    >
                      {getInitials(member.name)}
                    </div>
                  </div>
                  <span className="w-full truncate text-xs sm:text-sm font-bold text-white">
                    {member.name}
                  </span>
                  <span className="w-full truncate text-[11px] text-text-muted mt-0.5">
                    {member.role || "Cast"}
                  </span>
                </div>
              ))}
            </div>
          </ShelfSection>
        )}

        {/* ── 4. Original MovieNight Features Preservation (DP05) ── */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Private personal notes editor */}
          {entry?.status === "watched" ? (
            <section className="rounded-lg border border-white/10 bg-surface/60 p-5 shadow-lg">
              <DescriptionBox
                key={entry.id}
                initial={entry.description}
                onSave={(v) => store.updateDescription(entry.id, v)}
              />
            </section>
          ) : (
            <div className="self-start rounded-lg border border-dashed border-white/10 px-4 py-3 text-xs text-text-muted">
              <span className="font-semibold text-text-primary">Private notes</span> — mark this title as watched to add your own notes and rating.
            </div>
          )}

          {/* Friends' ratings section */}
          <section className={`self-start rounded-lg border border-white/10 bg-surface/60 shadow-lg ${friendReviews.length > 0 || friendError || store.friendsError ? "p-5" : "px-4 py-3"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-white">Friends&apos; Ratings</h2>
                {friendAvg != null && (
                  <span className="nums inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent">
                    ★ {friendAvg.toFixed(1)} avg
                  </span>
                )}
              </div>
              {(isLoadingFriends || store.friendsLoading) && (
                <span className="text-xs text-text-muted">Updating...</span>
              )}
            </div>

            {(friendError || store.friendsError) && (
              <div role="alert" className="mt-3 text-sm text-danger">
                {friendError || store.friendsError}
                <button
                  type="button"
                  className="quiet-action ml-3 min-h-8 text-xs text-link"
                  onClick={() => {
                    void store.refreshFriends();
                    setFriendRetry((r) => r + 1);
                  }}
                >
                  Retry ratings
                </button>
              </div>
            )}

            {friendReviews.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {friendReviews.map((r) => (
                  <li
                    key={String(r.userId)}
                    className="rounded-lg border border-white/5 bg-white/[0.02] p-3.5 transition-colors hover:border-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
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
                      {r.rating != null ? (
                        <span className="nums font-bold text-accent text-sm">
                          ★ {r.rating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">Unrated</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : !friendError && !store.friendsError && !store.friendsLoading && !isLoadingFriends ? (
              <p className="mt-2 text-xs text-text-muted">
                No friends have rated this title yet.
              </p>
            ) : null}
          </section>
        </div>

        {/* ── 5. 'You may like' Similarity Shelf (DP06) ── */}
        {(similarMovies.length > 0 || isLoadingSimilar) && (
          <section role="region" aria-label="Similar movie recommendations" className="relative">
            <div className="mb-3 flex items-start justify-between px-1">
              <div>
                <h2 className="text-base font-semibold tracking-wide text-text-primary">
                  You May Also Like
                </h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  Based on community similarity patterns
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <ShelfReloadButton
                  onReload={() => setSimilarReload((n) => n + 1)}
                  disabled={isLoadingSimilar}
                  label="Reload You May Also Like list"
                />
              </div>
            </div>
            {isLoadingSimilar && similarMovies.length === 0 ? (
              <div className="h-44 w-full animate-pulse rounded-lg bg-surface/50" />
            ) : (
              <MovieGrid movies={similarMovies} compact explorePresentation referrerOverride={path} />
            )}
          </section>
        )}
      </div>

    </AppShell>
  );
}

const COMPACT_ACTION_BUTTON_CLASS = `${COMPACT_ACTION_CLASS} transition-colors active:scale-95 disabled:opacity-60`;

function ActionArea({
  movie,
  compact = false,
  isTrailerPlaying,
  onToggleTrailer,
}: {
  movie: Movie;
  compact?: boolean;
  isTrailerPlaying: boolean;
  onToggleTrailer: () => void;
}) {
  const store = useStore();
  const { toggleWatchlist, error: watchlistError } = useWatchlistSave();
  const { toast } = useToast();
  const entry = store.entryFor(store.currentUser!.id, movie.id);

  const [rating, setRating] = useState<number | null>(null);
  const [desc, setDesc] = useState("");
  const [isSliderExpanded, setIsSliderExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saving = submitting || store.isWatchlistSaving(movie.id);
  const watched = entry?.status === "watched";
  const inWatchlist = entry?.status === "watchlist";

  const handleToggleSlider = () => {
    if (!isSliderExpanded) {
      setRating(entry?.rating ?? null);
      setDesc(entry?.description ?? "");
      setError(null);
    }
    setIsSliderExpanded((prev) => !prev);
  };

  const saveWatchedRating = async () => {
    if (saving) return;
    setSubmitting(true);
    setError(null);

    const result = entry
      ? await store.markWatched(entry.id, rating, watched ? undefined : desc)
      : await store.addMovie({
          catalogMovieId: movie.catalogMovieId,
          existingMovieId: movie.id,
          tmdbId: movie.tmdbId,
          title: movie.title,
          year: movie.year ?? undefined,
          posterUrl: movie.posterUrl,
          backdropUrl: movie.backdropUrl,
          runtimeMinutes: movie.runtimeMinutes,
          overview: movie.overview,
          imdb: movie.imdb,
          rt: movie.rt,
          status: "watched",
          rating,
          description: desc,
          mediaType: movie.mediaType,
          seasonsCount: movie.seasonsCount,
          episodesCount: movie.episodesCount,
        });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Could not confirm save. Please try again.");
      return;
    }

    setIsSliderExpanded(false);
    toast({
      message: watched ? "Personal rating saved" : `"${movie.title}" marked as watched`,
      type: "success",
    });
  };

  const watchedLabel = watched
    ? `Edit personal rating: Watched${entry.rating != null ? ` (${entry.rating.toFixed(1)})` : ""}`
    : "Mark as Watched";

  return (
    <div className="space-y-4">
      {compact ? (
        <div data-testid="title-actions" className="grid grid-flow-col auto-cols-fr gap-2">
          {!watched && (
            <button
              type="button"
              disabled={saving}
              aria-busy={saving}
              aria-pressed={inWatchlist}
              aria-label={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              onClick={() => toggleWatchlist(movie.id, movie)}
              className={`${COMPACT_ACTION_BUTTON_CLASS} ${
                inWatchlist ? "border-accent bg-accent/20 text-accent" : "border-white/20 bg-black/40 text-text-primary"
              }`}
            >
              <span aria-hidden="true" className="text-base leading-none">{inWatchlist ? "✓" : "+"}</span>
              <span>{saving ? "Saving" : "Watchlist"}</span>
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            aria-label={watchedLabel}
            onClick={handleToggleSlider}
            className={`${COMPACT_ACTION_BUTTON_CLASS} ${
              watched ? "border-success/40 bg-success/20 text-success" : "border-white/20 bg-black/40 text-text-primary"
            }`}
          >
            <span aria-hidden="true" className="text-base leading-none">{watched ? "★" : "✓"}</span>
            <span className="nums">{watched ? (entry.rating != null ? entry.rating.toFixed(1) : "Rate") : "Watched"}</span>
          </button>

          <AddToListPopover movie={movie} compact />
        </div>
      ) : (
      <div className="flex flex-wrap items-center gap-3">
        {/* Play Trailer CTA */}
        <button
          type="button"
          onClick={onToggleTrailer}
          aria-pressed={isTrailerPlaying}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-bold text-black transition-all hover:bg-white/90 active:scale-95 shadow-xl"
        >
          {isTrailerPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          <span>{isTrailerPlaying ? "Close Trailer" : "Play Trailer"}</span>
        </button>

        {/* Watchlist Toggle Button */}
        {!watched && (
          <button
            type="button"
            disabled={saving}
            aria-busy={saving}
            onClick={() => toggleWatchlist(movie.id, movie)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-all active:scale-95 disabled:opacity-60 ${
              inWatchlist
                ? "border border-accent bg-accent/20 text-accent hover:bg-accent/30"
                : "border border-white/20 bg-black/40 text-text-primary hover:border-white/40 hover:text-white backdrop-blur-md"
            }`}
          >
            {saving ? "Updating…" : inWatchlist ? "✓ In Watchlist" : "+ Add to Watchlist"}
          </button>
        )}

        {/* Watched Button (reveals inline rating slider) */}
        <button
          type="button"
          disabled={saving}
          aria-label={watchedLabel}
          onClick={handleToggleSlider}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-all active:scale-95 disabled:opacity-60 ${
            watched
              ? "border border-success/40 bg-success/20 text-success hover:bg-success hover:text-black"
              : "border border-white/20 bg-black/40 text-text-primary hover:border-success/40 hover:text-success backdrop-blur-md"
          }`}
        >
          {watched ? (
            entry.rating != null ? (
              <>
                ✓ Watched <span className="nums font-bold">({entry.rating.toFixed(1)})</span>
              </>
            ) : (
              "✓ Watched"
            )
          ) : (
            "Mark Watched"
          )}
        </button>

        {/* Add to List Popover */}
        <AddToListPopover movie={movie} />
      </div>
      )}

      {watchlistError && <p role="alert" className="text-sm text-danger">{watchlistError}</p>}
      {!isSliderExpanded && error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {/* ── Inline Rating Slider Panel (DP03) ── */}
      {isSliderExpanded && (
        <div className="w-full max-w-xl rounded-lg border border-white/15 bg-surface-popover p-5 shadow-2xl backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
              {watched ? "Update Personal Rating" : "Mark as Watched"}
            </span>
            <button
              type="button"
              onClick={() => setIsSliderExpanded(false)}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              ✕
            </button>
          </div>

          <PersonalRatingInput value={rating} onChange={setRating} disabled={saving} />

          {!watched && (
            <textarea
              aria-label="Private notes"
              value={desc}
              disabled={saving}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Add your thoughts or notes (optional)"
              rows={2}
              className="mt-3.5 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveWatchedRating}
              disabled={saving}
              aria-busy={saving}
              className="rounded-lg bg-success px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-success/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : watched ? "Save rating" : "Confirm Watched"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setIsSliderExpanded(false)}
              className="rounded-lg border border-white/10 px-4 py-2 text-xs text-text-primary hover:bg-white/10"
            >
              Cancel
            </button>
          </div>

          {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
        </div>
      )}

      {/* Remove from list link */}
      {entry && !saving && (
        <RemoveLink
          confirm={confirmRemove}
          setConfirm={setConfirmRemove}
          title={movie.title}
          onRemove={async () => {
            setSubmitting(true);
            const result = await store.removeEntry(entry.id);
            setSubmitting(false);
            if (!result.ok) {
              setError(result.error ?? "Could not remove title. Retry.");
              return;
            }
            // Stay on the detail page: reset action state in place.
            setIsSliderExpanded(false);
            setConfirmRemove(false);
            setRating(null);
            setDesc("");
            toast({ message: `"${movie.title}" removed from library`, type: "success" });
          }}
        />
      )}
    </div>
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
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs">
        <span className="text-text-muted">Remove {title} from your library?</span>
        <button
          type="button"
          onClick={onRemove}
          className="quiet-action min-h-8 text-danger font-semibold"
        >
          Yes, remove
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="quiet-action min-h-8 text-text-muted"
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
      className="quiet-action mt-3 min-h-8 text-xs text-text-muted transition-colors hover:text-danger"
    >
      Remove from library
    </button>
  );
}

function DescriptionBox({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (v: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveNotes = async () => {
    if (pending || value === initial) return;
    setPending(true);
    setError(null);
    const result = await onSave(value);
    setPending(false);
    setSaved(result.ok);
    if (!result.ok) setError(result.error ?? "Could not save notes. Retry.");
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Your Private Notes
        </span>
        {saved && <span className="text-xs text-success">✓ Saved</span>}
      </div>
      <textarea
        aria-label="Your private note"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        disabled={pending}
        onBlur={saveNotes}
        rows={3}
        placeholder="What did you think of this title? Write your thoughts..."
        className="w-full resize-none rounded-lg border border-white/10 bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none transition-all"
      />
      {pending && <p role="status" className="mt-1 text-xs text-text-muted">Saving notes…</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}{" "}
          <button onClick={saveNotes} disabled={pending} className="quiet-action min-h-8 text-link">
            Retry notes
          </button>
        </p>
      )}
    </div>
  );
}
