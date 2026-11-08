package com.movienight.backend.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.movienight.backend.dto.SimilarityReloadResult;
import com.movienight.backend.repository.MovieSimilarityRepository;
import com.movienight.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Validated batch loader and sync activator for precomputed MovieLens item-item cosine similarity vectors.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class MovieSimilarityDataLoader implements ApplicationRunner {

    private final MovieSimilarityRepository movieSimilarityRepository;
    private final UserRepository userRepository;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final org.springframework.transaction.PlatformTransactionManager transactionManager;

    private final ReentrantLock reloadLock = new ReentrantLock();

    @org.springframework.beans.factory.annotation.Value("${app.similarity.auto-load-on-startup:false}")
    private boolean autoLoadOnStartup;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!autoLoadOnStartup) {
            log.info("MovieLens similarity startup loading disabled by configuration (app.similarity.auto-load-on-startup=false).");
            return;
        }

        if (movieSimilarityRepository.count() > 0) {
            log.info("MovieLens similarity backbone already initialized in database. Preserving existing model.");
            return;
        }

        Resource csvResource = new ClassPathResource("data/movie_similarity.csv");
        Resource manifestResource = new ClassPathResource("data/movie_similarity.manifest.json");

        if (!csvResource.exists()) {
            log.warn("movie_similarity.csv not found in classpath resources. Skipping fresh similarity loading.");
            return;
        }

        log.info("Fresh database detected. Validating and loading MovieLens similarity dataset...");
        try {
            loadAndActivateInternal(csvResource, manifestResource);
        } catch (Exception e) {
            log.error("Fresh database similarity initialization failed: {}", e.getMessage(), e);
            throw new IllegalStateException("Failed to initialize movie similarity dataset on fresh startup: " + e.getMessage(), e);
        }
    }

    /**
     * Reload similarity matrix data from default classpath resources on incoming webhook trigger.
     */
    public SimilarityReloadResult reloadSimilarityData() {
        return reloadSimilarityData(
                new ClassPathResource("data/movie_similarity.csv"),
                new ClassPathResource("data/movie_similarity.manifest.json")
        );
    }

    /**
     * Reload similarity matrix data from specified resources.
     */
    public SimilarityReloadResult reloadSimilarityData(Resource csvResource, Resource manifestResource) {
        if (!reloadLock.tryLock()) {
            throw new IllegalStateException("A movie similarity data reload is already in progress.");
        }
        try {
            return new org.springframework.transaction.support.TransactionTemplate(transactionManager)
                    .execute(status -> {
                        log.info("Starting MovieLens similarity dataset reload and cache invalidation...");
                        return loadAndActivateInternal(csvResource, manifestResource);
                    });
        } finally {
            reloadLock.unlock();
        }
    }

    private SimilarityReloadResult loadAndActivateInternal(Resource csvResource, Resource manifestResource) {
        // Step 1: Pre-validate candidate CSV and manifest before touching database
        ValidatedArtifactMeta meta = validateArtifact(csvResource, manifestResource);

        // Step 2: Clear old model
        movieSimilarityRepository.deleteAllInBatch();

        // Step 3: Batch insert validated records
        String sql = "INSERT INTO movie_similarity (tmdb_id, neighbor_tmdb_id, score) VALUES (?, ?, ?)";
        List<Object[]> batch = new ArrayList<>(10000);
        long count = 0;

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(csvResource.getInputStream(), StandardCharsets.UTF_8))) {
            reader.readLine(); // skip header
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                String[] parts = line.split(",");
                Long tmdbId = Long.parseLong(parts[0].trim());
                Long neighborTmdbId = Long.parseLong(parts[1].trim());
                Double score = Double.parseDouble(parts[2].trim());

                batch.add(new Object[]{tmdbId, neighborTmdbId, score});
                count++;

                if (batch.size() >= 10000) {
                    jdbcTemplate.batchUpdate(sql, batch);
                    batch.clear();
                }
            }
            if (!batch.isEmpty()) {
                jdbcTemplate.batchUpdate(sql, batch);
                batch.clear();
            }
        } catch (Exception e) {
            log.error("Failed while inserting similarity dataset into database: {}", e.getMessage(), e);
            throw new IllegalStateException("Database batch update failed during similarity insertion: " + e.getMessage(), e);
        }

        // Step 4: Atomically invalidate personal recommendation caches for all users
        int invalidatedUsers = userRepository.invalidateAllPersonalRecommendationCaches();
        log.info("Successfully loaded {} movie similarity neighbor pairs and invalidated {} recommendation caches.", count, invalidatedUsers);

        return SimilarityReloadResult.builder()
                .pairsCount(count)
                .modelIdentity(meta.modelIdentity())
                .invalidatedUsersCount(invalidatedUsers)
                .build();
    }

    public ValidatedArtifactMeta validateArtifact(Resource csvResource, Resource manifestResource) {
        if (csvResource == null || !csvResource.exists()) {
            throw new IllegalArgumentException("Similarity CSV resource does not exist");
        }

        // 1. Calculate SHA-256 of candidate CSV
        String computedSha256;
        try (InputStream is = csvResource.getInputStream()) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = is.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
            computedSha256 = HexFormat.of().formatHex(digest.digest());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to calculate SHA-256 for CSV resource: " + e.getMessage(), e);
        }

        // 2. Validate against manifest if present
        String modelIdentity = computedSha256;
        if (manifestResource != null && manifestResource.exists()) {
            try (InputStream is = manifestResource.getInputStream()) {
                JsonNode manifest = objectMapper.readTree(is);
                JsonNode outputStats = manifest.get("output_statistics");
                if (outputStats != null && outputStats.has("output_sha256")) {
                    String expectedSha256 = outputStats.get("output_sha256").asText();
                    if (!computedSha256.equalsIgnoreCase(expectedSha256)) {
                        throw new IllegalStateException(
                                String.format("Candidate CSV hash mismatch: expected %s from manifest, computed %s", expectedSha256, computedSha256)
                        );
                    }
                }
                if (manifest.has("dataset_snapshot_date")) {
                    modelIdentity = manifest.get("dataset_snapshot_date").asText() + ":" + computedSha256.substring(0, 12);
                }
            } catch (IllegalStateException e) {
                throw e;
            } catch (Exception e) {
                throw new IllegalStateException("Failed to parse manifest: " + e.getMessage(), e);
            }
        }

        // 3. Validate CSV structure, boundaries, and ordering
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(csvResource.getInputStream(), StandardCharsets.UTF_8))) {
            String header = reader.readLine();
            if (header == null || !header.trim().equals("tmdb_id,neighbor_tmdb_id,score")) {
                throw new IllegalArgumentException("Invalid CSV header: expected 'tmdb_id,neighbor_tmdb_id,score', got '" + header + "'");
            }

            long lineNum = 1;
            long rowCount = 0;
            Map<Long, Integer> sourceNeighborCounts = new HashMap<>();
            Set<Long> seenPairs = new HashSet<>();
            String line;

            while ((line = reader.readLine()) != null) {
                lineNum++;
                if (line.isBlank()) continue;

                String[] parts = line.split(",");
                if (parts.length != 3) {
                    throw new IllegalArgumentException("Malformed row at line " + lineNum + ": " + line);
                }

                long tmdbId;
                long neighborTmdbId;
                double score;
                try {
                    tmdbId = Long.parseLong(parts[0].trim());
                    neighborTmdbId = Long.parseLong(parts[1].trim());
                    score = Double.parseDouble(parts[2].trim());
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("Non-numeric field at line " + lineNum + ": " + line, e);
                }

                if (tmdbId <= 0 || neighborTmdbId <= 0) {
                    throw new IllegalArgumentException("Non-positive TMDB ID at line " + lineNum + ": tmdbId=" + tmdbId + ", neighbor=" + neighborTmdbId);
                }
                if (tmdbId == neighborTmdbId) {
                    throw new IllegalArgumentException("Self-similarity rejected at line " + lineNum + ": tmdbId=" + tmdbId);
                }
                if (score < 0.10 || score > 1.0001 || !Double.isFinite(score)) {
                    throw new IllegalArgumentException("Score out of bounds [0.10, 1.00] at line " + lineNum + ": " + score);
                }

                int currentCount = sourceNeighborCounts.merge(tmdbId, 1, Integer::sum);
                if (currentCount > 30) {
                    throw new IllegalArgumentException("Exceeded maximum 30 neighbors for source TMDB ID " + tmdbId + " at line " + lineNum);
                }

                long pairKey = (tmdbId << 32) | (neighborTmdbId & 0xFFFFFFFFL);
                if (!seenPairs.add(pairKey)) {
                    throw new IllegalArgumentException("Duplicate pair (" + tmdbId + ", " + neighborTmdbId + ") at line " + lineNum);
                }

                rowCount++;
            }

            if (rowCount == 0) {
                throw new IllegalArgumentException("Candidate similarity artifact contains 0 data rows (empty)");
            }
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Failed during candidate CSV validation: " + e.getMessage(), e);
        }

        return new ValidatedArtifactMeta(modelIdentity, computedSha256);
    }

    public record ValidatedArtifactMeta(String modelIdentity, String sha256) {}
}
