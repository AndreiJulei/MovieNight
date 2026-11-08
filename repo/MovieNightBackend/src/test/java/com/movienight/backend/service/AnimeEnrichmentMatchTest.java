package com.movienight.backend.service;

import com.movienight.backend.dto.external.AniListMedia;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AnimeEnrichmentMatchTest {
    private AniListMedia media(long id, String format, Integer year, String... titles) {
        return new AniListMedia(id, null, format, false, List.of(), List.of(), 80, 9000, 12, year, List.of(titles));
    }

    @Test void matchesNormalizedTitleWithinOneYearForTvAndOna() {
        assertEquals(1, AnimeEnrichmentService.selectMatch("Frieren: Beyond Journey's End", 2023,
                List.of(media(1, "TV", 2023, "Sousou no Frieren", "frieren beyond journeys end"))).id());
        assertEquals(2, AnimeEnrichmentService.selectMatch("Show", 2024, List.of(media(2, "ONA", 2023, "SHOW"))).id());
    }

    @Test void rejectsWrongFormatYearOrTitle() {
        assertNull(AnimeEnrichmentService.selectMatch("Show", 2023, List.of(media(1, "MOVIE", 2023, "Show"))));
        assertNull(AnimeEnrichmentService.selectMatch("Show", 2023, List.of(media(1, "TV", 2020, "Show"))));
        assertNull(AnimeEnrichmentService.selectMatch("Show", 2023, List.of(media(1, "TV", 2023, "Other"))));
        assertNull(AnimeEnrichmentService.selectMatch("Show", null, List.of(media(1, "TV", 2023, "Show"))));
        assertNull(AnimeEnrichmentService.selectMatch("Show", 2023, List.of()));
    }

    @Test void ambiguousMatchesResolveOnlyByUniqueExactYear() {
        assertEquals(2, AnimeEnrichmentService.selectMatch("Show", 2023,
                List.of(media(1, "TV", 2022, "Show"), media(2, "TV", 2023, "Show"))).id());
        assertNull(AnimeEnrichmentService.selectMatch("Show", 2023,
                List.of(media(1, "TV", 2022, "Show"), media(2, "TV", 2024, "Show"))));
    }
}
