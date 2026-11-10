#!/bin/sh
set -eu

backup_dir=${BACKUP_DIR:-/var/backups/chinese-platform/postgres}
retention_days=${BACKUP_RETENTION_DAYS:-7}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$backup_dir"
pg_dump --format=custom --file="$backup_dir/app-$timestamp.dump" "$DATABASE_URL"
find "$backup_dir" -type f -name 'app-*.dump' -mtime "+$retention_days" -delete

