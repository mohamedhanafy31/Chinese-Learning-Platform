# Deployment outline

This is the M0 production skeleton. The complete Hostinger, Cloudflare, TLS,
backup/restore, resource-limit, and go-live runbook will be written in M14.

For now:

1. Copy `.env.example` to `.env` and replace every production placeholder.
2. Set `APP_DOMAIN` to the public hostname and configure Cloudflare Full (strict)
   TLS before exposing the stack.
3. Run `docker compose -f infra/docker-compose.yml up -d --build`.
4. Confirm `/api/v1/health`, `/api/v1/ready`, and every locale route through
   Caddy.
5. Schedule `infra/backup/pg-backup.sh` nightly and keep its output local until
   the M14 off-host/restore procedure is approved.
