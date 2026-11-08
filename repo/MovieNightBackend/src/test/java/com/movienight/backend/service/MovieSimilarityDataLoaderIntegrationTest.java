package com.movienight.backend.service;

import com.movienight.backend.dto.SimilarityReloadResult;
import com.movienight.backend.dto.SuggestionCategoryResponse;
import com.movienight.backend.dto.SuggestionsResponse;
import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class MovieSimilarityDataLoaderIntegrationTest {

    @Autowired
    private MovieSimilarityDataLoader movieSimilarityDataLoader;

    @Autowired
    private MovieSimilarityRepository movieSimilarityRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserMovieEntryRepository userMovieEntryRepository;

    @Autowired
    private PersonalizedRecommendationRepository personalizedRecommendationRepository;

    @Autowired
    private MovieRepository movieRepository;

    @Autowired
    private SuggestionService suggestionService;

    @Autowired
    private RecommendationMaintenanceService recommendationMaintenanceService;

    @Autowired
    private SuggestionScheduler suggestionScheduler;

    private User testUser;
    private Movie interstellar;
    private Movie inception;

    @BeforeEach
    void setUp() {
        recommendationMaintenanceService.setMaintenanceMode(false);

        personalizedRecommendationRepository.deleteAllInBatch();
        userMovieEntryRepository.deleteAllInBatch();
        userRepository.deleteAllInBatch();
        movieRepository.deleteAllInBatch();

        testUser = userRepository.save(User.builder()
                .username("testuser@movienight.com")
                .email("testuser@movienight.com")
                .displayName("Test User")
                .password("password123")
                .needsRecommendationRefresh(false) // previously clean account
                .build());

        inception = movieRepository.save(Movie.builder()
                .tmdbId(27205L)
                .title("Inception")
                .mediaType("MOVIE")
                .build());

        interstellar = movieRepository.save(Movie.builder()
                .tmdbId(157336L)
                .title("Interstellar")
                .mediaType("MOVIE")
                .build());
    }

    private String sha256Hex(String content) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] hash = md.digest(content.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(hash);
    }

    @Test
    @DisplayName("Validation rejects manifest hash mismatch without altering database")
    void testManifestHashMismatchRejection() throws Exception {
        long initialCount = movieSimilarityRepository.count();

        String csv = "tmdb_id,neighbor_tmdb_id,score\n27205,157336,0.8500\n";
        String manifest = "{\n  \"output_statistics\": {\n    \"output_sha256\": \"wrong_hash\"\n  }\n}";

        Resource csvRes = new ByteArrayResource(csv.getBytes(StandardCharsets.UTF_8));
        Resource manifestRes = new ByteArrayResource(manifest.getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> movieSimilarityDataLoader.reloadSimilarityData(csvRes, manifestRes))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("hash mismatch");

        assertThat(movieSimilarityRepository.count()).isEqualTo(initialCount);
    }

    @Test
    @DisplayName("Validation rejects self-similarity, duplicate pairs, and empty artifacts")
    void testValidationRejections() {
        String selfSimCsv = "tmdb_id,neighbor_tmdb_id,score\n27205,27205,1.0000\n";
        Resource selfSimRes = new ByteArrayResource(selfSimCsv.getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> movieSimilarityDataLoader.reloadSimilarityData(selfSimRes, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Self-similarity");

        String dupCsv = "tmdb_id,neighbor_tmdb_id,score\n27205,157336,0.8500\n27205,157336,0.8500\n";
        Resource dupRes = new ByteArrayResource(dupCsv.getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> movieSimilarityDataLoader.reloadSimilarityData(dupRes, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate pair");

        String emptyCsv = "tmdb_id,neighbor_tmdb_id,score\n";
        Resource emptyRes = new ByteArrayResource(emptyCsv.getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> movieSimilarityDataLoader.reloadSimilarityData(emptyRes, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("empty");
    }

    @Test
    @DisplayName("Successful reload replaces similarity data and invalidates clean user caches")
    void testSuccessfulReloadAndCacheInvalidation() throws Exception {
        String csv = "tmdb_id,neighbor_tmdb_id,score\n27205,157336,0.8500\n";
        String csvSha = sha256Hex(csv);
        String manifest = String.format("{\n  \"output_statistics\": {\n    \"output_sha256\": \"%s\"\n  }\n}", csvSha);

        Resource csvRes = new ByteArrayResource(csv.getBytes(StandardCharsets.UTF_8));
        Resource manifestRes = new ByteArrayResource(manifest.getBytes(StandardCharsets.UTF_8));

        // Before reload, user was clean
        assertThat(userRepository.findById(testUser.getId()).orElseThrow().isNeedsRecommendationRefresh()).isFalse();

        SimilarityReloadResult result = movieSimilarityDataLoader.reloadSimilarityData(csvRes, manifestRes);

        assertThat(result.getPairsCount()).isEqualTo(1L);
        assertThat(movieSimilarityRepository.count()).isEqualTo(1L);

        // After reload, clean user cache has been invalidated
        User refreshedUser = userRepository.findById(testUser.getId()).orElseThrow();
        assertThat(refreshedUser.isNeedsRecommendationRefresh()).isTrue();
    }

    @Test
    @DisplayName("Authenticated lazy read recomputes recommendations for invalidated account")
    void testLazyRecomputationOnRead() throws Exception {
        // Setup user watched Inception with personal rating 9.0
        userMovieEntryRepository.save(UserMovieEntry.builder()
                .user(testUser)
                .movie(inception)
                .personalRating(9.0)
                .status(MovieStatus.WATCHED)
                .build());

        String csv = "tmdb_id,neighbor_tmdb_id,score\n27205,157336,0.8500\n";
        String csvSha = sha256Hex(csv);
        String manifest = String.format("{\n  \"output_statistics\": {\n    \"output_sha256\": \"%s\"\n  }\n}", csvSha);

        Resource csvRes = new ByteArrayResource(csv.getBytes(StandardCharsets.UTF_8));
        Resource manifestRes = new ByteArrayResource(manifest.getBytes(StandardCharsets.UTF_8));

        movieSimilarityDataLoader.reloadSimilarityData(csvRes, manifestRes);

        // User currently needs refresh
        assertThat(userRepository.findById(testUser.getId()).orElseThrow().isNeedsRecommendationRefresh()).isTrue();

        // Reading recommendations triggers lazy recomputation
        SuggestionsResponse response = suggestionService.getPersonalRecommendations(testUser.getUsername());
        assertThat(response).isNotNull();
        assertThat(response.getCategories()).isNotEmpty();

        SuggestionCategoryResponse moviesCat = response.getCategories().getFirst();
        assertThat(moviesCat.getMovies()).anyMatch(m -> m.getTmdbId().equals(157336L) && "Interstellar".equals(m.getTitle()));

        // User is now marked clean
        assertThat(userRepository.findById(testUser.getId()).orElseThrow().isNeedsRecommendationRefresh()).isFalse();
    }

    @Test
    @DisplayName("Maintenance mode pauses recommendation reads (503) and scheduled recomputation")
    void testMaintenanceModeControls() {
        recommendationMaintenanceService.setMaintenanceMode(true);

        assertThatThrownBy(() -> suggestionService.getPersonalRecommendations(testUser.getUsername()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503 SERVICE_UNAVAILABLE");

        // Scheduled job skips without recomputing
        testUser.setNeedsRecommendationRefresh(true);
        userRepository.save(testUser);

        suggestionScheduler.recalculateDirtyUserRecommendations();

        // Still dirty because maintenance was active
        assertThat(userRepository.findById(testUser.getId()).orElseThrow().isNeedsRecommendationRefresh()).isTrue();

        // Resume maintenance mode
        recommendationMaintenanceService.setMaintenanceMode(false);
        SuggestionsResponse response = suggestionService.getPersonalRecommendations(testUser.getUsername());
        assertThat(response).isNotNull();
    }
}
