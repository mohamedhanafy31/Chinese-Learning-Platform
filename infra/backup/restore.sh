#!/usr/bin/env bash
# Restore a backup made by pg-backup.sh into the RUNNING production stack.
#
#   infra/backup/restore.sh --yes --db /var/backups/chinese-platform/app-db-<ts>.dump \
#       [--uploads /var/backups/chinese-platform/app-uploads-<ts>.tar.gz]
#
# What it does, in order:
#   1. stops api and web (Caddy stays up and answers 502 meanwhile)
#   2. pg_restore --clean --if-exists --no-owner, in ONE transaction: if the
#      restore fails the database is left exactly as it was
#   3. runs the migrate service so a dump from an older release is brought up to
#      the schema the current code expects
#   4. unpacks the uploads tarball over the uploads volume (it never deletes
#      files that are not in the tarball)
#   5. starts api and web again and waits for them to be healthy
#
# It DESTROYS the current database contents, so it refuses to run without --yes.
#
# Options:
#   --env-file FILE     Compose env file                  (default: .env)
#   -p, --project NAME  Compose project name              (default: Compose's own)
#   -f, --compose-file  Compose file, repeatable          (default: infra/docker-compose.yml)
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

yes=0
db_file=""
uploads_file=""
env_file=".env"
project=""
compose_files=()

usage() {
  sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --yes) yes=1 ;;
    --db) db_file=${2:?--db needs a file}; shift ;;
    --uploads) uploads_file=${2:?--uploads needs a file}; shift ;;
    --env-file) env_file=${2:?--env-file needs a file}; shift ;;
    -p | --project) project=${2:?--project needs a name}; shift ;;
    -f | --compose-file) compose_files+=("${2:?--compose-file needs a file}"); shift ;;
    -h | --help) usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
  shift
done

[ ${#compose_files[@]} -gt 0 ] || compose_files=(infra/docker-compose.yml)
[ -n "$db_file" ] || { echo "--db is required" >&2; usage; }
[ -f "$db_file" ] || { echo "Database dump not found: $db_file" >&2; exit 1; }
[ -z "$uploads_file" ] || [ -f "$uploads_file" ] ||
  { echo "Uploads archive not found: $uploads_file" >&2; exit 1; }
[ -f "$env_file" ] || { echo "Env file not found: $env_file" >&2; exit 1; }

if [ "$yes" -ne 1 ]; then
  echo "This will REPLACE the live database with: $db_file" >&2
  [ -z "$uploads_file" ] || echo "and unpack uploads from: $uploads_file" >&2
  echo "Refusing to continue without --yes." >&2
  exit 2
fi

# Absolute paths: the uploads file is bind-mounted into a container.
db_file=$(cd "$(dirname "$db_file")" && pwd)/$(basename "$db_file")
[ -z "$uploads_file" ] ||
  uploads_file=$(cd "$(dirname "$uploads_file")" && pwd)/$(basename "$uploads_file")

compose=(docker compose --env-file "$env_file")
[ -z "$project" ] || compose+=(-p "$project")
for file in "${compose_files[@]}"; do compose+=(-f "$file"); done

# Fail early (and without touching anything) if the dump is not readable.
"${compose[@]}" run --rm --no-deps -T \
  -v "$db_file:/restore/db.dump:ro" --entrypoint pg_restore backup \
  --list /restore/db.dump > /dev/null ||
  { echo "The dump cannot be read by pg_restore; nothing was changed." >&2; exit 1; }

echo "==> Stopping api and web"
"${compose[@]}" stop api web

echo "==> Making sure postgres is up"
"${compose[@]}" up -d --wait postgres

echo "==> Restoring the database (single transaction)"
"${compose[@]}" exec -T postgres sh -c \
  'exec pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$db_file"

echo "==> Applying migrations newer than the dump"
"${compose[@]}" run --rm --no-deps migrate

if [ -n "$uploads_file" ]; then
  echo "==> Unpacking uploads"
  "${compose[@]}" run --rm --no-deps -T \
    -v "$uploads_file:/restore/uploads.tar.gz:ro" --entrypoint tar api \
    -xzf /restore/uploads.tar.gz -C /app/uploads
fi

echo "==> Starting api and web"
"${compose[@]}" up -d --wait api web

echo "Restore complete."
