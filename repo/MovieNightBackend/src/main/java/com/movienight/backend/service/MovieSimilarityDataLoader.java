package com.movienight.backend.service;

import com.movienight.backend.repository.MovieSimilarityRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * High-performance batch loader for precomputed item-item cosine similarity dataset into database.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class MovieSimilarityDataLoader implements ApplicationRunner {

    private final MovieSimilarityRepository movieSimilarityRepository;
    private final JdbcTemplate jdbcTemplate;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (movieSimilarityRepository.count() > 0) {
            log.info("MovieLens similarity backbone already initialized in database.");
            return;
        }

        try {
            ClassPathResource resource = new ClassPathResource("data/movie_similarity.csv");
            if (!resource.exists()) {
                log.warn("movie_similarity.csv not found in classpath resources. Skipping similarity loading.");
                return;
            }

            log.info("Loading MovieLens similarity dataset into database via high-speed batch insert...");
            String sql = "INSERT INTO movie_similarity (tmdb_id, neighbor_tmdb_id, score) VALUES (?, ?, ?)";
            List<Object[]> batch = new ArrayList<>(10000);
            long count = 0;

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
                String line = reader.readLine(); // skip header: tmdb_id,neighbor_tmdb_id,score
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) continue;
                    String[] parts = line.split(",");
                    if (parts.length < 3) continue;

                    try {
                        Long tmdbId = Long.parseLong(parts[0].trim());
                        Long neighborTmdbId = Long.parseLong(parts[1].trim());
                        Double score = Double.parseDouble(parts[2].trim());

                        batch.add(new Object[]{tmdbId, neighborTmdbId, score});
                        count++;

                        if (batch.size() >= 10000) {
                            jdbcTemplate.batchUpdate(sql, batch);
                            batch.clear();
                        }
                    } catch (NumberFormatException ignored) {
                    }
                }

                if (!batch.isEmpty()) {
                    jdbcTemplate.batchUpdate(sql, batch);
                    batch.clear();
                }
            }

            log.info("Successfully loaded {} movie similarity neighbor pairs into database in milliseconds.", count);
        } catch (Exception e) {
            log.error("Failed to load MovieLens similarity dataset: {}", e.getMessage(), e);
        }
    }

    /**
     * Reload similarity matrix data from file on incoming webhook trigger.
     */
    @Transactional
    public long reloadSimilarityData() {
        log.info("Reloading MovieLens similarity dataset on webhook trigger...");
        movieSimilarityRepository.deleteAllInBatch();

        long count = 0;
        try {
            ClassPathResource resource = new ClassPathResource("data/movie_similarity.csv");
            if (!resource.exists()) {
                log.warn("movie_similarity.csv not found in classpath resources. Skipping similarity loading.");
                return 0;
            }

            String sql = "INSERT INTO movie_similarity (tmdb_id, neighbor_tmdb_id, score) VALUES (?, ?, ?)";
            List<Object[]> batch = new ArrayList<>(10000);

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
                String line = reader.readLine(); // skip header
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) continue;
                    String[] parts = line.split(",");
                    if (parts.length < 3) continue;

                    try {
                        Long tmdbId = Long.parseLong(parts[0].trim());
                        Long neighborTmdbId = Long.parseLong(parts[1].trim());
                        Double score = Double.parseDouble(parts[2].trim());

                        batch.add(new Object[]{tmdbId, neighborTmdbId, score});
                        count++;

                        if (batch.size() >= 10000) {
                            jdbcTemplate.batchUpdate(sql, batch);
                            batch.clear();
                        }
                    } catch (NumberFormatException ignored) {
                    }
                }

                if (!batch.isEmpty()) {
                    jdbcTemplate.batchUpdate(sql, batch);
                    batch.clear();
                }
            }
            log.info("Successfully reloaded {} movie similarity neighbor pairs into database.", count);
        } catch (Exception e) {
            log.error("Failed to reload MovieLens similarity dataset: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to reload similarity data: " + e.getMessage(), e);
        }
        return count;
    }
}
