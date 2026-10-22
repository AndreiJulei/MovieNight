#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
backend="$root/repo/MovieNightBackend"
frontend="$root/repo/MovieNightFrontend"

check_tools() {
  for tool in python3 java node pnpm openssl curl; do
    command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 1; }
  done
  java -version 2>&1 | head -1 | grep -Eq 'version "21([.+-]|\")' || { echo 'Java 21 required' >&2; exit 1; }
  [[ $(node -p 'process.versions.node.split(".")[0]') == 22 ]] || { echo 'Node 22 required' >&2; exit 1; }
  [[ $(pnpm --version) == 10.34.3 ]] || { echo 'pnpm 10.34.3 required' >&2; exit 1; }
  echo 'Declared runtimes available.'
}

case "${1:-}" in
  check)
    check_tools
    python3 -m unittest discover -s "$here" -p 'test_provider_fixture.py'
    ;;
  run)
    check_tools
    (cd "$frontend" && pnpm install --frozen-lockfile)
    export DEMO_JWT_SECRET
    DEMO_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
    export SPRING_CONFIG_LOCATION=classpath:/application-demo.properties
    export VITE_API_URL=http://127.0.0.1:8080
    unset APP_TMDB_API_KEY APP_TMDB_BASE_URL APP_OMDB_API_KEY APP_OMDB_BASE_URL TMDB_API_KEY OMDB_API_KEY
    python3 "$here/provider_fixture.py" & fixture_pid=$!
    (cd "$backend" && ./mvnw spring-boot:run) & backend_pid=$!
    (cd "$frontend" && pnpm dev --mode demo --host 127.0.0.1 --port 8443) & frontend_pid=$!
    trap 'kill "$fixture_pid" "$backend_pid" "$frontend_pid" 2>/dev/null || true' EXIT INT TERM
    echo 'Demo: http://127.0.0.1:8443 | API: http://127.0.0.1:8080 | fixture: http://127.0.0.1:18081/__health'
    echo 'Ctrl-C stops the demo. In-memory H2 data is then discarded.'
    wait "$backend_pid"
    ;;
  reset)
    echo 'Stop the running demo with Ctrl-C, then run: ./demo.sh run'
    echo 'Only the demo in-memory database is reset; this command deletes no files.'
    ;;
  *)
    echo 'Usage: ./demo.sh check|run|reset' >&2
    exit 2
    ;;
esac
