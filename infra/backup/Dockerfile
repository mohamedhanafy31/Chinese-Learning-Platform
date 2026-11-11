# Backup runner: same Postgres major as the database (pg_dump must not be older
# than the server), plus tzdata so BACKUP_TZ (Africa/Cairo) works.
FROM postgres:16-alpine

RUN apk add --no-cache tzdata
COPY pg-backup.sh backup-loop.sh /opt/backup/
RUN chmod 0755 /opt/backup/pg-backup.sh /opt/backup/backup-loop.sh

# The Postgres image's entrypoint would try to start a server.
ENTRYPOINT []
CMD ["/opt/backup/backup-loop.sh"]
