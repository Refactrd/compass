#!/usr/bin/env bash
#
# Applies the migrations to a throwaway Postgres and asserts the RLS policies
# actually behave, using three real accounts (two consultants and an admin).
#
# This covers the production-readiness item "RLS policies tested with two real
# accounts, not just reviewed as code" (CLAUDE.md, week 3 day 4). Run it after
# any change to a migration.
#
#   ./supabase/tests/run.sh
#
# Requires Docker. Nothing here touches the real Supabase project.

set -euo pipefail

CONTAINER=compass-pg-test
IMAGE=pgvector/pgvector:pg17
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

psql_file() {
  docker cp "$1" "$CONTAINER:/tmp/$(basename "$1")" >/dev/null
  docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q \
    -f "/tmp/$(basename "$1")"
}

# The fixture reproduces the real project rather than an ideal one: pgvector
# installed in `public` rather than `extensions`, and another product already
# owning `public.documents` and the `documents` storage bucket. Both of those
# broke a migration in production, so the suite is run against the awkward
# case, not the convenient one.
docker cp "$ROOT/supabase/tests/00_bootstrap.sql" "$CONTAINER:/tmp/00_bootstrap.sql" >/dev/null
psql_file "$ROOT/supabase/tests/00_bootstrap_shared_project.sql"

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$migration")"
  psql_file "$migration"
done

# Idempotency is checked on the head migration only. 0001 deliberately refuses
# to run once the compass schema exists, so replaying the whole folder is not a
# valid operation and asserting it would be testing the wrong thing.
HEAD=$(ls "$ROOT"/supabase/migrations/*.sql | tail -1)
echo "re-applying $(basename "$HEAD") to check idempotency"
psql_file "$HEAD"

docker cp "$ROOT/supabase/tests/01_rls.sql" "$CONTAINER:/tmp/01_rls.sql" >/dev/null
OUTPUT=$(docker exec "$CONTAINER" psql -U postgres -f /tmp/01_rls.sql 2>&1 \
  | grep -v '^SET$\|^RESET$\|^$' | sed 's/^NOTICE:  //;s/^psql:[^ ]* //')

echo
echo "$OUTPUT"
echo

if echo "$OUTPUT" | grep -q "FAIL"; then
  echo "RLS TESTS FAILED"
  exit 1
fi

# The other product's table must come through untouched.
LEGACY=$(docker exec "$CONTAINER" psql -U postgres -At -c \
  "select count(*) from public.documents")
if [ "$LEGACY" != "3" ]; then
  echo "REGRESSION: the other product's public.documents has $LEGACY rows, expected 3"
  exit 1
fi
echo "other product's public.documents intact ($LEGACY rows)"

echo "$(echo "$OUTPUT" | grep -c 'PASS') checks passed"
