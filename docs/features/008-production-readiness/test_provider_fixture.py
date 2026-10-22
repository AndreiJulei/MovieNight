"""Contract checks for the local TMDB substitute used by the manual demo."""

import importlib.util
import json
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location(
    "demo_provider", Path(__file__).with_name("provider_fixture.py")
)
provider = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(provider)


class ProviderFixtureTest(unittest.TestCase):
    def test_equal_numeric_id_keeps_movie_and_tv_details_separate(self):
        movie_status, movie = provider.response_for("/3/movie/862", "success")
        tv_status, tv = provider.response_for("/3/tv/862", "success")
        self.assertEqual((200, 200), (movie_status, tv_status))
        self.assertEqual("Demo Seed", movie["title"])
        self.assertEqual("Demo Series", tv["name"])

    def test_anime_and_tv_are_classifiable(self):
        _, data = provider.response_for("/3/search/multi?query=demo", "success")
        series = {item["name"]: item for item in data["results"] if "name" in item}
        self.assertNotIn(16, series["Demo Series"]["genre_ids"])
        self.assertIn(16, series["Demo Anime"]["genre_ids"])
        self.assertEqual("ja", series["Demo Anime"]["original_language"])

    def test_empty_and_failure_are_distinct(self):
        self.assertEqual((200, {"results": []}), provider.response_for("/3/search/multi?query=demo", "empty"))
        status, body = provider.response_for("/3/search/multi?query=demo", "failure")
        self.assertEqual(503, status)
        self.assertNotIn("api_key", json.dumps(body))

    def test_recommendation_seed_has_movie_candidate(self):
        _, data = provider.response_for("/3/movie/862/recommendations", "success")
        self.assertEqual(863, data["results"][0]["id"])
        self.assertEqual("Demo Candidate", data["results"][0]["title"])


if __name__ == "__main__":
    unittest.main()
