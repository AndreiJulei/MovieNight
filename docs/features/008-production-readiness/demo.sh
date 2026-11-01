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

check_lan_address() {
  [[ -n ${LAN_IP:-} ]] || { echo 'LAN_IP is required for lan mode (example: LAN_IP=192.168.1.23 ./demo.sh lan)' >&2; exit 2; }
  python3 - "$LAN_IP" <<'PY' || { echo 'LAN_IP must be a non-loopback IPv4 address on this computer' >&2; exit 2; }
import ipaddress
import sys

try:
    address = ipaddress.IPv4Address(sys.argv[1])
except ipaddress.AddressValueError:
    sys.exit(1)
if address.is_loopback or address.is_unspecified or address.is_multicast or address.is_reserved or address.is_link_local:
    sys.exit(1)
PY
  export PORT=${PORT:-8443}
  [[ $PORT =~ ^[0-9]+$ ]] && (( PORT >= 1 && PORT <= 65535 )) || { echo 'PORT must be 1–65535' >&2; exit 2; }
}

case "${1:-}" in
  check)
    check_tools
    python3 -m unittest discover -s "$here" -p 'test_*.py'
    ;;
  run|lan)
    mode=$1
    if [[ $mode == lan ]]; then check_lan_address; fi
    check_tools
    (cd "$frontend" && pnpm install --frozen-lockfile)
    export DEMO_JWT_SECRET
    DEMO_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
    export SPRING_CONFIG_LOCATION=classpath:/application-demo.properties
    if [[ $mode == lan ]]; then
      # The phone uses the page's own origin; Vite proxies /api to loopback.
      export VITE_API_URL="http://${LAN_IP}:${PORT}"
    else
      export VITE_API_URL=http://127.0.0.1:8080
    fi
    unset APP_TMDB_API_KEY APP_TMDB_BASE_URL APP_OMDB_API_KEY APP_OMDB_BASE_URL TMDB_API_KEY OMDB_API_KEY
    python3 "$here/provider_fixture.py" & fixture_pid=$!
    (cd "$backend" && ./mvnw spring-boot:run) & backend_pid=$!
    if [[ $mode == lan ]]; then
      (cd "$frontend" && pnpm dev --mode lan --host 0.0.0.0 --port "$PORT") & frontend_pid=$!
    else
      (cd "$frontend" && pnpm dev --mode demo --host 127.0.0.1 --port 8443) & frontend_pid=$!
    fi
    trap 'kill "$fixture_pid" "$backend_pid" "$frontend_pid" 2>/dev/null || true' EXIT INT TERM
    if [[ $mode == lan ]]; then
      echo "Phone: http://${LAN_IP}:${PORT} | API: same-origin /api (proxied to 127.0.0.1:8080) | fixture: loopback 127.0.0.1:18081"
    else
      echo 'Demo: http://127.0.0.1:8443 | API: http://127.0.0.1:8080 | fixture: http://127.0.0.1:18081/__health'
    fi
    echo 'Ctrl-C stops the demo. In-memory H2 data is then discarded.'
    wait "$backend_pid"
    ;;
  reset)
    echo 'Stop the running demo with Ctrl-C, then run: ./demo.sh run (or LAN_IP=<address> ./demo.sh lan)'
    echo 'Only the demo in-memory database is reset; this command deletes no files.'
    ;;
  *)
    echo 'Usage: ./demo.sh check|run|lan|reset' >&2
    exit 2
    ;;
esac
