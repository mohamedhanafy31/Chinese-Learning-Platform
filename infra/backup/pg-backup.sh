#!/bin/sh
# One backup run: a custom-format pg_dump of the database plus a tarball of the
# uploads volume, written 0600 to BACKUP_DIR, then old files are pruned.
#
# Configuration (environment):
#   PGHOST PGUSER PGPASSWORD PGDATABASE  how to reach Postgres (libpq variables;
#                                        the password is never printed)
#   BACKUP_DIR             output directory          (default /backups)
#   UPLOADS_DIR            uploads to archive        (default /uploads; "" skips)
#   BACKUP_RETENTION_DAYS  delete files older than   (default 14)
#
# Exits non-zero, after logging a FAILED line to stderr, if anything goes wrong.
set -eu
umask 077

backup_dir=${BACKUP_DIR:-/backups}
uploads_dir=${UPLOADS_DIR-/uploads}
retention_days=${BACKUP_RETENTION_DAYS:-14}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
db_file="$backup_dir/app-db-$timestamp.dump"
uploads_file="$backup_dir/app-uploads-$timestamp.tar.gz"

log() {
  printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

cleanup() {
  status=$?
  rm -f "$db_file.partial" "$uploads_file.partial"
  if [ "$status" -ne 0 ]; then
    printf '%s backup: FAILED (exit %s)\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$status" >&2
  fi
}
trap cleanup EXIT

case "$retention_days" in
  '' | *[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a whole number" >&2; exit 2 ;;
esac
if [ -z "${PGPASSWORD:-}" ] || [ -z "${PGHOST:-}" ]; then
  echo "PGHOST and PGPASSWORD must be set" >&2
  exit 2
fi

mkdir -p "$backup_dir"
[ -w "$backup_dir" ] || { echo "$backup_dir is not writable" >&2; exit 1; }

log "dumping database $PGDATABASE on $PGHOST"
pg_dump --format=custom --no-owner --file="$db_file.partial"
# A dump that cannot be listed is not a backup.
pg_restore --list "$db_file.partial" > /dev/null
chmod 0600 "$db_file.partial"
mv "$db_file.partial" "$db_file"
log "wrote $db_file ($(wc -c < "$db_file") bytes)"

if [ -z "$uploads_dir" ]; then
  log "uploads archive skipped on purpose (UPLOADS_DIR is empty)"
else
  if [ ! -d "$uploads_dir" ]; then
    echo "UPLOADS_DIR is set to '$uploads_dir' but the directory does not exist" >&2
    exit 1
  fi
  log "archiving $uploads_dir (images and any local dev videos)"
  tar -C "$uploads_dir" -czf "$uploads_file.partial" .
  gzip -t "$uploads_file.partial"
  if [ -n "$(find "$uploads_dir" -mindepth 1 -type f -print -quit)" ] &&
    [ -z "$(tar -tzf "$uploads_file.partial" | sed -n '1p')" ]; then
    echo "UPLOADS_DIR contains files but the archive has no entries" >&2
    exit 1
  fi
  chmod 0600 "$uploads_file.partial"
  mv "$uploads_file.partial" "$uploads_file"
  log "wrote $uploads_file ($(wc -c < "$uploads_file") bytes)"
fi

find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'app-db-*.dump' -o -name 'app-uploads-*.tar.gz' \) \
  -mmin "+$((retention_days * 1440))" -print -delete |
  while read -r pruned; do log "pruned $pruned"; done

date -u +%Y-%m-%dT%H:%M:%SZ > "$backup_dir/.last-success"
log "done"
