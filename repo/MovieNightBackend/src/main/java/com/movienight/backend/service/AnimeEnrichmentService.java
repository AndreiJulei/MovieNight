package com.movienight.backend.service;

import com.movienight.backend.client.AniListClient;
import com.movienight.backend.client.AniListUnavailableException;
import com.movienight.backend.dto.external.AniListMedia;
import com.movienight.backend.model.AniListMapping;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.AniListMappingRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.text.Normalizer;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Resolves TMDB TV titles to at most one AniList entry and persists the outcome (including "no
 * confident match") in the disposable discovery cache. Identity comes from title and year only,
 * never from numeric ids. Lookups are serialized, which also paces AniList traffic.
 */
@Service
@Slf4j
public class AnimeEnrichmentService {
    static final Duration MAPPING_TTL = Duration.ofDays(14);
    private static final Set<String> FORMATS = Set.of("TV", "ONA");

    private final AniListClient client;
    private final AniListMappingRepository repository;
    private final TransactionTemplate independentTransaction;

    public AnimeEnrichmentService(AniListClient client, AniListMappingRepository repository,
                                  PlatformTransactionManager transactionManager) {
        this.client = client;
        this.repository = repository;
        this.independentTransaction = new TransactionTemplate(transactionManager);
        this.independentTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public boolean isEnabled() { return client.isEnabled(); }

    /** Stored mapping of any age, never calling AniList; null when this title has not been resolved. */
    public AniListMapping findStored(long tmdbId) {
        return repository.findByResourceTypeAndTmdbId(ResourceType.TV, tmdbId).orElse(null);
    }

    /**
     * Return the stored or freshly resolved mapping for a TMDB TV title.
     * @throws AniListUnavailableException when AniList is needed but cannot answer and nothing usable is stored
     */
    public synchronized AniListMapping resolve(long tmdbId, String title, Integer year) {
        AniListMapping existing = repository.findByResourceTypeAndTmdbId(ResourceType.TV, tmdbId).orElse(null);
        if (existing != null && existing.getFetchedAt().isAfter(LocalDateTime.now(ZoneOffset.UTC).minus(MAPPING_TTL))) {
            return existing;
        }
        List<AniListMedia> candidates;
        try {
            candidates = client.searchAnime(title);
        } catch (AniListUnavailableException failure) {
            if (existing != null) return existing; // previously fetched real data; not invented
            throw failure;
        }
        AniListMedia match = selectMatch(title, year, candidates);
        AniListMapping mapping = existing != null ? existing : AniListMapping.builder()
                .resourceType(ResourceType.TV).tmdbId(tmdbId).build();
        apply(mapping, match);
        return independentTransaction.execute(status -> repository.saveAndFlush(mapping));
    }

    /**
     * The one TV/ONA entry whose title or synonym equals the TMDB title and whose season year is within
     * a year of the TMDB first-air year; ties are broken by an exact year, otherwise there is no match.
     */
    static AniListMedia selectMatch(String title, Integer year, List<AniListMedia> candidates) {
        if (title == null || year == null || candidates == null) return null;
        String wanted = normalize(title);
        if (wanted.isEmpty()) return null;
        List<AniListMedia> matches = candidates.stream()
                .filter(c -> c.format() != null && FORMATS.contains(c.format()))
                .filter(c -> c.seasonYear() != null && Math.abs(c.seasonYear() - year) <= 1)
                .filter(c -> c.titles().stream().map(AnimeEnrichmentService::normalize).anyMatch(wanted::equals))
                .toList();
        if (matches.size() == 1) return matches.get(0);
        List<AniListMedia> exact = matches.stream().filter(c -> c.seasonYear().equals(year)).toList();
        return exact.size() == 1 ? exact.get(0) : null;
    }

    static String normalize(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", "");
    }

    private void apply(AniListMapping mapping, AniListMedia media) {
        mapping.setFetchedAt(LocalDateTime.now(ZoneOffset.UTC));
        mapping.setMatched(media != null);
        mapping.setAnilistId(media == null ? null : media.id());
        mapping.setMalId(media == null ? null : media.idMal());
        mapping.setFormat(media == null ? null : media.format());
        mapping.setAdult(media != null && media.isAdult());
        mapping.setGenres(media == null ? null : media.genres().stream().map(AnimeEnrichmentService::clean)
                .collect(Collectors.joining(";")));
        mapping.setTags(media == null ? null : media.tags().stream()
                .map(t -> clean(t.name()) + "|" + t.rank()).collect(Collectors.joining(";")));
        mapping.setMeanScore(media == null ? null : media.meanScore());
        mapping.setPopularity(media == null ? null : media.popularity());
        mapping.setEpisodes(media == null ? null : media.episodes());
        mapping.setSeasonYear(media == null ? null : media.seasonYear());
    }

    private static String clean(String value) { return value.replace(";", " ").replace("|", " "); }
}
