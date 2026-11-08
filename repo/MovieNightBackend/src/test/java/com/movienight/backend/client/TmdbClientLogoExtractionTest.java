package com.movienight.backend.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TmdbClientLogoExtractionTest {

    private TmdbClient tmdbClient;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        tmdbClient = new TmdbClient(
                "test-api-key",
                "https://api.themoviedb.org/3",
                "https://image.tmdb.org/t/p"
        );
        objectMapper = new ObjectMapper();
    }

    @Test
    @DisplayName("LG01: selects highest-rated English transparent PNG logo from TMDB JSON payload")
    void selectsHighestRatedEnglishTransparentPngLogo() throws Exception {
        String jsonPayload = """
                {
                  "id": 550,
                  "title": "Fight Club",
                  "images": {
                    "logos": [
                      {
                        "file_path": "/logo_low_en.png",
                        "iso_639_1": "en",
                        "vote_average": 5.2,
                        "vote_count": 10
                      },
                      {
                        "file_path": "/logo_high_en.png",
                        "iso_639_1": "en",
                        "vote_average": 8.7,
                        "vote_count": 25
                      },
                      {
                        "file_path": "/logo_top_ja.png",
                        "iso_639_1": "ja",
                        "vote_average": 9.5,
                        "vote_count": 50
                      },
                      {
                        "file_path": "/logo_svg_en.svg",
                        "iso_639_1": "en",
                        "vote_average": 9.9,
                        "vote_count": 100
                      }
                    ]
                  }
                }
                """;

        TmdbMovieDetailsResponse response = objectMapper.readValue(jsonPayload, TmdbMovieDetailsResponse.class);
        assertNotNull(response);
        assertNotNull(response.getImages());
        assertEquals(4, response.getImages().getLogos().size());

        String bestLogoPath = response.getEffectiveLogoPath();
        assertEquals("/logo_high_en.png", bestLogoPath);

        String fullLogoUrl = tmdbClient.buildLogoUrl(bestLogoPath);
        assertEquals("https://image.tmdb.org/t/p/w500/logo_high_en.png", fullLogoUrl);
    }

    @Test
    @DisplayName("LG01: falls back to highest-rated non-English PNG when no English PNG is available")
    void fallsBackToHighestRatedNonEnglishPng() throws Exception {
        String jsonPayload = """
                {
                  "id": 129,
                  "title": "Spirited Away",
                  "images": {
                    "logos": [
                      {
                        "file_path": "/spirited_ja_low.png",
                        "iso_639_1": "ja",
                        "vote_average": 6.0,
                        "vote_count": 5
                      },
                      {
                        "file_path": "/spirited_ja_high.png",
                        "iso_639_1": "ja",
                        "vote_average": 8.9,
                        "vote_count": 40
                      }
                    ]
                  }
                }
                """;

        TmdbMovieDetailsResponse response = objectMapper.readValue(jsonPayload, TmdbMovieDetailsResponse.class);
        assertEquals("/spirited_ja_high.png", response.getEffectiveLogoPath());
        assertEquals("https://image.tmdb.org/t/p/w500/spirited_ja_high.png", tmdbClient.extractLogoUrl(response));
    }

    @Test
    @DisplayName("LG01: prefers English logo asset over foreign-language PNG when no English PNG exists")
    void prefersEnglishAssetOverForeignPng() throws Exception {
        String jsonPayload = """
                {
                  "id": 129,
                  "title": "Spirited Away",
                  "images": {
                    "logos": [
                      {
                        "file_path": "/spirited_ja_high.png",
                        "iso_639_1": "ja",
                        "vote_average": 9.5,
                        "vote_count": 80
                      },
                      {
                        "file_path": "/spirited_en.svg",
                        "iso_639_1": "en",
                        "vote_average": 8.0,
                        "vote_count": 30
                      }
                    ]
                  }
                }
                """;

        TmdbMovieDetailsResponse response = objectMapper.readValue(jsonPayload, TmdbMovieDetailsResponse.class);
        assertEquals("/spirited_en.svg", response.getEffectiveLogoPath());
        assertEquals("https://image.tmdb.org/t/p/original/spirited_en.svg", tmdbClient.extractLogoUrl(response));
    }

    @Test
    @DisplayName("LG01: falls back to first valid logo asset when no PNG logos exist")
    void fallsBackToFirstValidLogoAssetWhenNoPng() {
        TmdbMovieDetailsResponse response = new TmdbMovieDetailsResponse();
        TmdbMovieDetailsResponse.Images images = new TmdbMovieDetailsResponse.Images();
        List<TmdbMovieDetailsResponse.Logo> logos = new ArrayList<>();

        TmdbMovieDetailsResponse.Logo svgLogo = new TmdbMovieDetailsResponse.Logo();
        svgLogo.setFilePath("/vector_logo.svg");
        svgLogo.setIso6391("en");
        logos.add(svgLogo);

        images.setLogos(logos);
        response.setImages(images);

        assertEquals("/vector_logo.svg", response.getEffectiveLogoPath());
        assertEquals("https://image.tmdb.org/t/p/original/vector_logo.svg", tmdbClient.extractLogoUrl(response));
    }

    @Test
    @DisplayName("LG01: returns null gracefully when images or logos are null or empty")
    void returnsNullWhenNoLogosAvailable() {
        TmdbMovieDetailsResponse responseNoImages = new TmdbMovieDetailsResponse();
        assertNull(responseNoImages.getEffectiveLogoPath());
        assertNull(tmdbClient.extractLogoUrl(responseNoImages));

        TmdbMovieDetailsResponse responseEmptyLogos = new TmdbMovieDetailsResponse();
        responseEmptyLogos.setImages(new TmdbMovieDetailsResponse.Images());
        assertNull(responseEmptyLogos.getEffectiveLogoPath());
        assertNull(tmdbClient.extractLogoUrl(responseEmptyLogos));

        assertNull(tmdbClient.buildLogoUrl(null));
        assertNull(tmdbClient.buildLogoUrl(""));
        assertNull(tmdbClient.buildLogoUrl("   "));
    }
}

