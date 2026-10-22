"""Loopback-only deterministic TMDB substitute for the feature-008 manual demo."""

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit


MOVIES = {
    862: {"id": 862, "title": "Demo Seed", "media_type": "movie", "release_date": "2020-01-01", "vote_average": 8.0, "vote_count": 1200},
    863: {"id": 863, "title": "Demo Candidate", "media_type": "movie", "release_date": "2021-01-01", "vote_average": 7.5, "vote_count": 1200},
    137: {"id": 137, "title": "Demo Friend Pick", "media_type": "movie", "release_date": "2019-01-01", "vote_average": 7.0, "vote_count": 1200},
}
TV = {
    862: {"id": 862, "name": "Demo Series", "media_type": "tv", "first_air_date": "2020-02-01", "original_language": "en", "origin_country": ["US"], "genre_ids": [18], "vote_average": 7.0, "vote_count": 1200},
    900: {"id": 900, "name": "Demo Anime", "media_type": "tv", "first_air_date": "2022-03-01", "original_language": "ja", "origin_country": ["JP"], "genre_ids": [16], "vote_average": 8.5, "vote_count": 1200},
}


def response_for(url, mode):
    """Return (HTTP status, JSON body) at the external provider boundary."""
    path = urlsplit(url).path
    if mode == "failure":
        return 503, {"status_message": "Demo provider unavailable"}
    if mode == "empty":
        return 200, {"results": []}
    if path == "/3/search/multi":
        return 200, {"results": list(MOVIES.values()) + list(TV.values())}
    if path == "/3/discover/movie":
        return 200, {"results": list(MOVIES.values())}
    if path in ("/3/discover/tv", "/3/tv/on_the_air"):
        return 200, {"results": list(TV.values())}
    parts = path.strip("/").split("/")
    if len(parts) >= 3 and parts[0] == "3" and parts[1] in ("movie", "tv") and parts[2].isdigit():
        resource = MOVIES if parts[1] == "movie" else TV
        item = resource.get(int(parts[2]))
        if item is None:
            return 404, {"status_message": "Demo title not found"}
        if len(parts) == 4 and parts[3] == "recommendations":
            return 200, {"results": [MOVIES[863]] if parts[1] == "movie" and item["id"] == 862 else []}
        if len(parts) == 3:
            details = dict(item)
            details["overview"] = "Deterministic demo title."
            details["genres"] = [{"id": genre, "name": "Animation" if genre == 16 else "Drama"} for genre in item.get("genre_ids", [])]
            if parts[1] == "tv":
                details.update(number_of_seasons=1, number_of_episodes=8, episode_run_time=[25])
            else:
                details["runtime"] = 100
            return 200, details
    return 404, {"status_message": "Unsupported demo provider path"}


class Handler(BaseHTTPRequestHandler):
    mode = "success"

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/__mode":
            requested = parse_qs(parsed.query).get("value", [""])[0]
            if requested not in ("success", "empty", "failure"):
                self.send_json(400, {"error": "Mode must be success, empty or failure"})
                return
            Handler.mode = requested
            self.send_json(200, {"mode": Handler.mode})
            return
        if parsed.path == "/__health":
            self.send_json(200, {"mode": Handler.mode})
            return
        status, body = response_for(self.path, Handler.mode)
        self.send_json(status, body)

    def send_json(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        # Avoid logging query strings, which may include a configured demo key.
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18081)
    args = parser.parse_args()
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
