#!/usr/bin/env bash
# Run on the Linux host of a self-hosted Supabase Docker Compose installation.
set -Eeuo pipefail
umask 077

usage() {
  cat <<'TEXT'
Usage: bash scripts/repair-server.sh --compose-dir /path/to/supabase [--apply]
       [--url https://supabase.example.com] [--functions-service functions]
       [--db-service db] [--migrate-after YYYYMMDDHHMMSS]

Without --apply: inspect containers, function mounts, SQL capabilities and HTTP.
With --apply: back up files, deploy push/maintenance/_shared, restart functions,
and verify both handlers. No setup.sql, no database reset, no volume removal.
--migrate-after applies ONLY migrations newer than an explicitly supplied known
baseline, after a pg_dump backup. Omit it if the baseline is not known.
TEXT
}

compose_dir=''; public_url='https://supabase.pruebahomelab.es'; apply=false
functions_service=functions; db_service=db; migrate_after=''
source_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
while (($#)); do
  case "$1" in
    --compose-dir) compose_dir=${2:?Missing directory}; shift 2 ;;
    --url) public_url=${2:?Missing URL}; shift 2 ;;
    --functions-service) functions_service=${2:?Missing service}; shift 2 ;;
    --db-service) db_service=${2:?Missing service}; shift 2 ;;
    --migrate-after) migrate_after=${2:?Missing baseline}; shift 2 ;;
    --apply) apply=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done
[[ -n "$compose_dir" ]] || { usage; exit 2; }
[[ -z "$migrate_after" || "$migrate_after" =~ ^[0-9]{14}$ ]] || { echo 'Invalid migration baseline'; exit 2; }
[[ "$public_url" == https://* && "$public_url" != *'@'* && "$public_url" != *'?'* && "$public_url" != *'#'* ]] || {
  echo 'Use an HTTPS base URL without credentials, query or fragment'; exit 2;
}
for command in docker curl python3 tar; do command -v "$command" >/dev/null || { echo "Missing command: $command"; exit 2; }; done
compose_dir=$(cd -- "$compose_dir" && pwd -P)
cd -- "$compose_dir"
docker compose version >/dev/null
container=$(docker compose ps -q "$functions_service")
[[ -n "$container" && "$container" != *$'\n'* ]] || { echo 'Expected one running functions container'; exit 2; }
mount=$(docker inspect "$container" | python3 -c '
import json,sys
items=[m for m in json.load(sys.stdin)[0]["Mounts"] if m["Destination"]=="/home/deno/functions" and m["Type"]=="bind"]
if len(items)!=1: sys.exit("Expected one bind mount at /home/deno/functions; inspect your custom deployment")
print(items[0]["Source"])
')
[[ -d "$mount" && "$mount" != / ]] || { echo 'Unsafe or missing functions mount'; exit 2; }
mount=$(cd -- "$mount" && pwd -P)
[[ "$mount" != / && "$mount" != "$source_root/supabase/functions" ]] || { echo 'Source and deployment must be distinct directories'; exit 2; }
for name in push maintenance _shared; do
  [[ -d "$source_root/supabase/functions/$name" ]] || { echo "Missing source: $name"; exit 2; }
done
if [[ -n "$migrate_after" ]]; then
  matches=("$source_root/supabase/migrations/${migrate_after}_"*.sql)
  [[ -f "${matches[0]}" ]] || { echo 'Baseline must match a migration included in this package'; exit 2; }
fi
echo "Functions container: $container"
echo "Functions directory on host: $mount"
docker compose exec -T "$functions_service" sh -c '
  test -f /home/deno/functions/main/index.ts || { echo "Missing main/index.ts; repair the base Supabase installation first"; exit 1; }
  for name in push maintenance; do
    if test -f "/home/deno/functions/$name/index.ts"; then echo "$name/index.ts exists"; else echo "$name/index.ts MISSING"; fi
  done
  test -n "${SUPABASE_URL:-}" || { echo "SUPABASE_URL is missing"; exit 1; }
  test -n "${SUPABASE_SECRET_KEYS:-}${SUPABASE_SECRET_KEY:-}" || { echo "New secret API keys are missing from functions environment"; exit 1; }
  echo "Server URL and secret key configuration present (values hidden)"
'

sql() { docker compose exec -T "$db_service" sh -c 'exec psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -v ON_ERROR_STOP=1' ; }
echo 'Database capabilities (names only):'
sql < "$source_root/scripts/server-diagnostics.sql"

if "$apply"; then
  backup="$compose_dir/coupleapp-repair-backups/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir -p -- "$backup"
  tar -C "$mount" -czf "$backup/functions-before.tar.gz" .
  echo "Backup: $backup"
  if [[ -n "$migrate_after" ]]; then
    docker compose exec -T "$db_service" sh -c 'exec pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -Fc' > "$backup/database-before.dump"
    [[ -s "$backup/database-before.dump" ]] || { echo 'Empty database backup; stopping'; exit 1; }
    # Execute only the explicitly selected suffix of migration history.
    while IFS= read -r migration; do
      filename=${migration##*/}; version=${filename%%_*}
      if [[ "$version" > "$migrate_after" ]]; then
        echo "Applying $filename"
        sql < "$migration"
      fi
    done < <(find "$source_root/supabase/migrations" -maxdepth 1 -name '*.sql' -type f | LC_ALL=C sort)
    printf "NOTIFY pgrst, 'reload schema';\n" | sql
    sql < "$source_root/scripts/server-diagnostics.sql"
  fi
  # Keep main/ and all unrelated functions; copy only CoupleApp sources.
  for name in push maintenance _shared; do
    mkdir -p -- "$mount/$name"
    cp -a -- "$source_root/supabase/functions/$name/." "$mount/$name/"
    find "$mount/$name" -type d -exec chmod a+rx {} +
    find "$mount/$name" -type f -exec chmod a+r {} +
  done
  docker compose exec -T "$functions_service" sh -c 'test -f /home/deno/functions/push/index.ts && test -f /home/deno/functions/maintenance/index.ts && test -f /home/deno/functions/_shared/database.types.ts'
  docker compose restart "$functions_service"
fi

failed=0
for name in push maintenance; do
  success=false
  for attempt in 1 2 3 4 5; do
    # No credentials, no POST: this checks boot/auth without running any jobs.
    status=$(curl --silent --show-error --max-time 20 --proto '=https' -o /dev/null -w '%{http_code}' "${public_url%/}/functions/v1/$name") || status=000
    if [[ "$status" == 401 ]]; then success=true; break; fi
    if ! "$apply"; then break; fi
    sleep 2
  done
  echo "$name: HTTP $status (401 is expected without credentials)"
  if ! "$success"; then failed=1; fi
done
if ((failed)); then
  echo 'A worker still does not boot/authenticate correctly. Inspect locally: docker compose logs --tail 100 functions'
  echo 'Do not post raw logs or .env: they may contain private credentials.'
  exit 1
fi
echo 'Both workers boot and require authentication. This does not confirm cron, SQL migrations or actual push delivery.'
