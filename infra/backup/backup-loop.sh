#!/bin/sh
# Runs pg-backup.sh every day at BACKUP_TIME (HH:MM, 24 h) in BACKUP_TZ.
# A failed run is logged and retried the next day; the loop itself keeps going.
# Set BACKUP_ON_START=1 to also take a backup as soon as the container starts.
set -eu

time_of_day=${BACKUP_TIME:-03:30}
TZ=${BACKUP_TZ:-Africa/Cairo}
export TZ

case "$time_of_day" in
  [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
  *) echo "BACKUP_TIME must look like 03:30 (24 h), got: $time_of_day" >&2; exit 2 ;;
esac

log() {
  printf '%s backup-loop: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

run_backup() {
  /opt/backup/pg-backup.sh || log "ERROR: backup failed; see the message above"
}

trap 'log "stopping"; exit 0' TERM INT

log "scheduled daily at $time_of_day $TZ, keeping ${BACKUP_RETENTION_DAYS:-14} days"
[ "${BACKUP_ON_START:-0}" = "1" ] && run_backup

while true; do
  now=$(date +%s)
  target=$(date -d "$(date +%Y-%m-%d) $time_of_day:00" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  log "next backup in $((target - now))s"
  sleep "$((target - now))" &
  wait $!
  run_backup
  sleep 60 & wait $!
done
