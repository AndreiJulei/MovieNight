package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.MovieResponse;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.AniListMapping;
import com.movienight.backend.model.CachedMovieList;
import com.movienight.backend.model.MovieListType;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieSimilarity;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.CachedMovieListRepository;
import com.movienight.backend.repository.MovieRepository;
import com.movienight.backend.repository.MovieSimilarityRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/** You May Also Like stays within the source title's resource type (#17, YML02/YML03). */
@ExtendWith(MockitoExtension.class)
class MovieSimilarityServiceTest {

    private static final long SHARED_ID = 30984L; // a TV id that is also a MovieLens movie id

    @Mock private MovieSimilarityRepository similarityRepository;
    @Mock private MovieRepository movieRepository;
    @Mock private CachedMovieListRepository cachedMovieListRepository;
    @Mock private MovieCatalogLookupService lookupService;
    @Mock private TmdbClient tmdbClient;
    @Mock private AnimeEnrichmentService animeEnrichment;

    private MovieSimilarityService service;

    @BeforeEach
    void setUp() {
        service = new MovieSimilarityService(similarityRepository, movieRepository, cachedMovieListRepository,
                lookupService, tmdbClient, animeEnrichment);
        // The colliding MovieLens movie neighbours must never leak into TV or anime suggestions.
        lenient().when(similarityRepository.findByTmdbIdOrderByScoreDesc(eq(SHARED_ID), any()))
                .thenReturn(List.of(MovieSimilarity.builder().tmdbId(SHARED_ID).neighborTmdbId(1891L).score(0.9).build()));
        lenient().when(movieRepository.findByResourceTypeAndTmdbIdIn(eq(ResourceType.MOVIE), anyList()))
                .thenReturn(List.of(Movie.builder().id(7L).tmdbId(1891L).title("The Empire Strikes Back").mediaType("MOVIE").build()));
        lenient().when(lookupService.mapToResponse(any(Movie.class))).thenAnswer(call -> {
            Movie movie = call.getArgument(0);
            return MovieResponse.builder().id(movie.getId()).tmdbId(movie.getTmdbId())
                    .title(movie.getTitle()).mediaType(movie.getMediaType()).build();
        });
    }

    @Test
    void animeTitleListsOnlyAnimeTvSuggestions() {
        when(tmdbClient.getTvRecommendations(SHARED_ID, 1)).thenReturn(List.of(
                tv(101L, "Bleach", List.of(16, 10759), "ja"),
                tv(102L, "Breaking Bad", List.of(18), "en"),
                tv(103L, "Pokemon", List.of(16, 10762), "ja"),
                tv(104L, "Adult anime", List.of(16), "ja")));
        lenient().when(animeEnrichment.findStored(104L)).thenReturn(AniListMapping.builder().matched(true).adult(true).build());

        List<MovieResponse> similar = service.getSimilarMovies(SHARED_ID, 10, "ANIME");

        assertEquals(List.of(101L), similar.stream().map(MovieResponse::getTmdbId).toList());
        assertEquals("ANIME", similar.get(0).getMediaType());
    }

    @Test
    void animeTitleWithNoQualifyingSuggestionsReturnsEmpty() {
        when(tmdbClient.getTvRecommendations(SHARED_ID, 1)).thenReturn(List.of(tv(102L, "Breaking Bad", List.of(18), "en")));

        assertEquals(List.of(), service.getSimilarMovies(SHARED_ID, 10, "ANIME"));
    }

    @Test
    void tvTitleListsOnlyTvSuggestions() {
        TmdbMovieSummary movie = tv(105L, "A film", List.of(18), "en");
        movie.setMediaType("movie");
        movie.setTitle("A film");
        when(tmdbClient.getTvRecommendations(SHARED_ID, 1)).thenReturn(List.of(tv(102L, "Breaking Bad", List.of(18), "en"), movie));

        List<MovieResponse> similar = service.getSimilarMovies(SHARED_ID, 10, "TV");

        assertEquals(List.of(102L), similar.stream().map(MovieResponse::getTmdbId).toList());
        assertEquals("TV", similar.get(0).getMediaType());
    }

    @Test
    void movieTitleNeverListsCachedTvTitleWithTheSameNumericId() {
        long source = 11L;
        when(similarityRepository.findByTmdbIdOrderByScoreDesc(eq(source), any())).thenReturn(List.of(
                MovieSimilarity.builder().tmdbId(source).neighborTmdbId(201L).score(0.9).build(),
                MovieSimilarity.builder().tmdbId(source).neighborTmdbId(202L).score(0.8).build()));
        when(movieRepository.findByResourceTypeAndTmdbIdIn(eq(ResourceType.MOVIE), anyList())).thenReturn(List.of());
        when(cachedMovieListRepository.findByTmdbIdIn(anyList())).thenReturn(List.of(
                CachedMovieList.builder().tmdbId(201L).title("A TV series").mediaType("TV").listType(MovieListType.POPULAR).build(),
                CachedMovieList.builder().tmdbId(202L).title("A movie").mediaType("MOVIE").listType(MovieListType.POPULAR).build()));

        List<MovieResponse> similar = service.getSimilarMovies(source, 10, "MOVIE");

        assertEquals(List.of(202L), similar.stream().map(MovieResponse::getTmdbId).toList());
        assertEquals("MOVIE", similar.get(0).getMediaType());
    }

    private static TmdbMovieSummary tv(long id, String name, List<Integer> genres, String language) {
        TmdbMovieSummary summary = new TmdbMovieSummary();
        summary.setId(id);
        summary.setName(name);
        summary.setMediaType("tv");
        summary.setGenreIds(genres);
        summary.setOriginalLanguage(language);
        return summary;
    }
}
