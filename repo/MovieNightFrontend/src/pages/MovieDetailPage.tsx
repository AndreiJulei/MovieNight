import { useEffect, useMemo, useRef, useState } from "react";
import { matchPath, useRouter, useQuery, safeInternalUrl } from "../router";
import { useStore } from "../store/MovieStore";
import { usePosterTransition } from "../components/PosterTransitionContext";
import { moviesApi, isAbortError } from "../api/movies";
import type { Movie, MediaType } from "../store/data";
import { titleId, parseTitleId, resourceType } from "../store/titleIdentity";
import AppShell from "../components/AppShell";
import AddToListPopover from "../components/AddToListPopover";
import PosterShelf from "../components/PosterShelf";
import PersonalRatingInput from "../components/PersonalRatingInput";
import useWatchlistSave from "../hooks/useWatchlistSave";
import { useToast } from "../components/Toast";
import {
  formatRuntime,
  getInitials,
  parseCastMembers,
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
  const { path, navigate, previousUrl, back } = useRouter();
  const query = useQuery();
  const typeParam = query.get("type");
  const { clearTransition } = usePosterTransition();
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

  // Trailer modal state
  const [isTrailerModalOpen, setIsTrailerModalOpen] = useState(false);

  // Similar titles state
  const [similarMovies, setSimilarMovies] = useState<Movie[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);

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
        const mapped: Movie[] = items.map((item) => ({
          id: item.id ? String(item.id) : titleId(item.tmdbId ?? 0, item.mediaType ?? "MOVIE"),
          catalogMovieId: item.id,
          tmdbId: item.tmdbId,
          title: item.title,
          year: item.releaseYear ?? null,
          posterUrl: item.posterUrl ?? null,
          backdropUrl: item.backdropUrl ?? null,
          runtimeMinutes: item.runtimeMinutes ?? null,
          imdb: item.imdbRating ?? null,
          rt: item.rottenTomatoesRating ?? null,
          tmdbRating: item.tmdbVoteAverage ?? null,
          tmdbVotes: item.tmdbVoteCount ?? null,
          overview: item.overview ?? "",
          genres: item.genres?.split(",").map((g) => g.trim()).filter(Boolean) ?? [],
          director: item.director,
          trailerKey: item.trailerKey,
          mediaType: (item.mediaType as MediaType) || "MOVIE",
          seasonsCount: item.seasonsCount,
          episodesCount: item.episodesCount,
        }));
        setSimilarMovies(mapped);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingSimilar(false);
      });

    return () => controller.abort();
  }, [movie?.tmdbId, movie?.mediaType]);

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

  const handleBack = () => {
    clearTransition();
    if (previousUrl === backDest) back();
    else navigate(backDest);
  };

  // Close trailer modal on Escape key
  useEffect(() => {
    if (!isTrailerModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsTrailerModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTrailerModalOpen]);

  if (!movie) {
    return (
      <AppShell fullBleed>
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12 pt-6">
          <BackLink onClick={handleBack} label={backLabel} />
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

  return (
    <AppShell fullBleed>
      {/* ── 1. Full-Bleed Cinematic Hero Header (DP01) ── */}
      <section
        role="region"
        aria-label={`${movie.title} hero banner`}
        className="relative w-full min-h-[500px] sm:min-h-[580px] lg:min-h-[640px] overflow-hidden bg-[#05070d] select-none"
      >
        {/* Backdrop artwork */}
        <div className="absolute inset-0">
          {backdropUrl ? (
            <img
              src={backdropUrl}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover object-center lg:object-top filter brightness-[0.85]"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-tr from-[#05070d] via-[#090e1c] to-[#12192e]" />
          )}
        </div>

        {/* Cinematic Vignettes: dark bottom ground and side text vignettes */}
        <div className="absolute inset-x-0 bottom-0 h-64 sm:h-80 bg-gradient-to-t from-[#05070d] via-[#05070d]/90 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 left-0 w-full sm:w-4/5 lg:w-3/5 bg-gradient-to-r from-[#05070d] via-[#05070d]/80 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#05070d]/80 to-transparent pointer-events-none" />

        {/* Hero Overlay Content */}
        <div className="relative z-20 mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12 pt-6 sm:pt-8 pb-10 sm:pb-14 flex flex-col justify-between min-h-[500px] sm:min-h-[580px] lg:min-h-[640px]">
          {/* Top Bar with Back Link */}
          <div>
            <BackLink onClick={handleBack} label={backLabel} />
          </div>

          {/* Bottom aligned metadata and primary actions */}
          <div className="max-w-3xl text-left">
            {/* Title Typography */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight drop-shadow-md">
              {movie.title}
            </h1>

            {/* Metadata Line: Ratings, Year, Runtime, 4K, Media Type */}
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-text-muted">
              {/* IMDb Rating Badge */}
              {movie.imdb != null && (
                <span className="nums inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-400">
                  <span className="rounded bg-amber-400 px-1 py-0.2 text-[10px] font-black text-black">
                    IMDb
                  </span>
                  {movie.imdb.toFixed(1)}
                </span>
              )}

              {/* TMDb Rating Badge */}
              {movie.tmdbRating != null && (
                <span className="nums inline-flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-bold text-indigo-400">
                  ★ {movie.tmdbRating.toFixed(1)} TMDb
                </span>
              )}

              {/* Rotten Tomatoes Badge */}
              {movie.rt != null && (
                <span className="nums inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-300">
                  <span>🍅</span>
                  {movie.rt}%
                </span>
              )}

              {/* Personal Rating Badge */}
              {entry?.status === "watched" && entry.rating != null && (
                <span className="nums inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/25 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
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
              <p className="mt-3 line-clamp-3 text-sm sm:text-base leading-relaxed text-text-primary/90 max-w-2xl drop-shadow-sm">
                {movie.overview}
              </p>
            )}

            {/* ── 2. Action Button Row & Inline Rating Slider (DP01, DP02, DP03) ── */}
            <div className="mt-6">
              <ActionArea
                movie={movie}
                onPlayTrailer={() => setIsTrailerModalOpen(true)}
                onRemoveMovie={handleBack}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Container below Hero */}
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12 py-10 space-y-12">
        {/* ── 3. Actor Cast Photo Gallery (DP04) ── */}
        {castList.length > 0 && (
          <section role="region" aria-label="Key cast members">
            <h2 className="text-base font-semibold tracking-wide text-text-primary mb-4">
              Key Cast
            </h2>
            <div
              className="flex items-start gap-4 sm:gap-6 overflow-x-auto pb-4 pt-1"
              style={{ scrollbarWidth: "none" }}
            >
              {castList.map((member) => (
                <div
                  key={member.name}
                  className="flex flex-col items-center w-24 sm:w-28 shrink-0 text-center group select-none"
                >
                  <div className="relative mb-2.5 h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-full border border-white/10 bg-surface shadow-md transition-all duration-200 group-hover:scale-105 group-hover:border-accent">
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
                      } h-full w-full items-center justify-center bg-accent/20 text-accent font-bold text-sm sm:text-base`}
                    >
                      {getInitials(member.name)}
                    </div>
                  </div>
                  <span className="w-full truncate text-xs sm:text-sm font-semibold text-text-primary group-hover:text-white">
                    {member.name}
                  </span>
                  <span className="w-full truncate text-[11px] text-text-muted mt-0.5">
                    {member.role || "Cast"}
                  </span>
                </div>
              ))}
            </div>
          </section>
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
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-5 flex flex-col justify-center text-text-muted text-sm">
              <p>Mark this title as watched to record your private personal notes and ratings.</p>
            </div>
          )}

          {/* Friends' ratings section */}
          <section className="rounded-lg border border-white/10 bg-surface/60 p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-white">Friends&apos; Ratings</h2>
                {friendAvg != null && (
                  <span className="nums inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">
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
              <p className="mt-3 text-xs text-text-muted">
                No shared friend ratings for this movie yet.
              </p>
            ) : null}
          </section>
        </div>

        {/* ── 5. 'You may like' Similarity Shelf (DP06) ── */}
        {(similarMovies.length > 0 || isLoadingSimilar) && (
          <section role="region" aria-label="Similar movie recommendations" className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold tracking-wide text-text-primary">
                You May Also Like
              </h2>
              <span className="text-xs text-text-muted">
                Based on community similarity patterns
              </span>
            </div>
            {isLoadingSimilar && similarMovies.length === 0 ? (
              <div className="h-44 w-full animate-pulse rounded-lg bg-surface/50" />
            ) : (
              <PosterShelf movies={similarMovies} referrer={path} />
            )}
          </section>
        )}
      </div>

      {/* ── 6. Trailer Modal (DP02) ── */}
      {isTrailerModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${movie.title} Trailer Modal`}
          onClick={() => setIsTrailerModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-lg border border-white/15 bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-surface/90">
              <span className="font-semibold text-sm text-white truncate max-w-md">
                {movie.title} — Official Trailer
              </span>
              <button
                type="button"
                aria-label="Close trailer modal"
                onClick={() => setIsTrailerModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/10 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Video embed */}
            <div className="relative aspect-video w-full bg-black">
              {movie.trailerKey ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${movie.trailerKey}?autoplay=1&rel=0`}
                  title={`${movie.title} Trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-text-muted">
                  <span className="text-sm font-medium">No video trailer available for this title</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ActionArea({
  movie,
  onPlayTrailer,
  onRemoveMovie,
}: {
  movie: Movie;
  onPlayTrailer: () => void;
  onRemoveMovie: () => void;
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

  return (
    <div className="space-y-4">
      {/* Primary Actions Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Play Trailer CTA */}
        <button
          type="button"
          onClick={onPlayTrailer}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs sm:text-sm font-bold text-black transition-all hover:bg-white/90 active:scale-95 shadow-xl"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Play Trailer</span>
        </button>

        {/* Watchlist Toggle Button */}
        {!watched && (
          <button
            type="button"
            disabled={saving}
            aria-busy={saving}
            onClick={() => toggleWatchlist(movie.id, movie)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-bold transition-all active:scale-95 disabled:opacity-60 ${
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
          aria-label={
            watched
              ? `Edit personal rating: Watched${entry.rating != null ? ` (${entry.rating.toFixed(1)})` : ""}`
              : "Mark as Watched"
          }
          onClick={handleToggleSlider}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-bold transition-all active:scale-95 disabled:opacity-60 ${
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
            toast({ message: `"${movie.title}" removed from library`, type: "info" });
            onRemoveMovie();
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

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3.5 py-1.5 text-xs font-semibold text-text-muted backdrop-blur-md transition-colors hover:border-white/30 hover:text-white"
    >
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}
