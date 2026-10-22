#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
[[ $# == 1 && -f "$1" ]] || { echo 'Usage: run-postgres.sh <explicit ignored shell-format env file>' >&2; exit 2; }
[[ -n ${JAVA_HOME:-} ]] || { echo 'JAVA_HOME must point to Java 21' >&2; exit 2; }
"$JAVA_HOME/bin/java" -version 2>&1 | head -1 | grep -Eq 'version "21([.+-]|\")' || { echo 'Java 21 required' >&2; exit 2; }
# Source only the explicitly selected trusted local configuration, never root .env automatically.
source "$1"
exec env -i PATH="$PATH" HOME="$HOME" JAVA_HOME="$JAVA_HOME" \
 MN_DB_URL="${MN_DB_URL:-}" MN_DB_USER="${MN_DB_USER:-}" MN_DB_PASSWORD="${MN_DB_PASSWORD:-}" \
 MN_MIGRATION_USER="${MN_MIGRATION_USER:-}" MN_MIGRATION_PASSWORD="${MN_MIGRATION_PASSWORD:-}" \
 MN_JWT_SECRET="${MN_JWT_SECRET:-}" MN_TMDB_KEY="${MN_TMDB_KEY:-}" MN_OMDB_KEY="${MN_OMDB_KEY:-}" \
 "$JAVA_HOME/bin/java" -jar "$root/repo/MovieNightBackend/target/movienight-backend-0.0.1-SNAPSHOT.jar" \
 --spring.config.location=classpath:/application-postgres.properties --spring.profiles.active=postgres
