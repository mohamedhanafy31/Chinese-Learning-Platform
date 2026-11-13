# Deployment runbook (Hostinger VPS)

This is the complete runbook for putting the platform on a single VPS: Caddy
(reverse proxy) in front of the Next.js web app and the NestJS API, backed by
PostgreSQL, all in Docker Compose. It is written so a careful non-expert can
follow it top to bottom.

Steps marked **M15** are done during the live deployment milestone (they need
the real domain, Cloudflare and provider accounts). Everything else is proven
locally by `pnpm smoke:prod` (see [Local production smoke](#local-production-smoke)).

Contents: [Architecture](#architecture) - [1. Prepare the VPS](#1-prepare-the-vps) -
[2. Get the code](#2-get-the-code) - [3. Configure `.env`](#3-configure-env) -
[4. Start the stack](#4-start-the-stack) - [5. First administrator](#5-first-administrator) -
[6. Cloudflare (M15)](#6-cloudflare-m15) - [7. Provider webhooks (M15)](#7-provider-webhooks-m15) -
[Updating and rollback](#updating-and-rollback) - [Backups and restore](#backups-and-restore) -
[Logs](#logs-and-monitoring) - [Resource sizing](#resource-sizing) -
[Troubleshooting](#troubleshooting) - [Go-live checklist](#go-live-checklist)

## Architecture

```
Internet -> Cloudflare (M15) -> Caddy :80/:443 --+--> web  (Next.js, :3000, internal only)
                                                  +--> api  (NestJS,  :4000, internal only)
                                                  +--> /media/*  served from the uploads volume
api, migrate, backup -> postgres (:5432, internal only, no published port)
```

- Only Caddy publishes ports (80 and 443). Postgres, the API and web are
  reachable only on the private Compose network.
- `migrate` is a one-shot container that applies database migrations before the
  API starts. `backup` takes a nightly dump (see [Backups](#backups-and-restore)).
- Every app container runs as a non-root user with a read-only root filesystem,
  all Linux capabilities dropped and `no-new-privileges`.
- Compose files: `infra/docker-compose.yml` (production). `docker-compose.dev.yml`
  and `docker-compose.test.yml` are development/test databases only; never use
  them on the server.

## 1. Prepare the VPS

Recommended plan: Hostinger **KVM 2** (2 vCPU / 8 GB RAM), **Ubuntu 24.04 LTS**.

1. **Log in as root once** (Hostinger hPanel gives the root password / SSH
   access) and update:

   ```sh
   apt update && apt -y upgrade && reboot
   ```

2. **Create a non-root deploy user** and give it your SSH key:

   ```sh
   adduser deploy                    # choose a strong password; you will rarely need it
   usermod -aG sudo deploy
   mkdir -p /home/deploy/.ssh
   # On YOUR computer:  cat ~/.ssh/id_ed25519.pub   (create one with ssh-keygen -t ed25519 if missing)
   # Paste that single line into the file below:
   nano /home/deploy/.ssh/authorized_keys
   chown -R deploy:deploy /home/deploy/.ssh
   chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
   ```

   Open a **second terminal** and check `ssh deploy@<server-ip>` works before
   continuing. Keep the first session open until it does.

3. **SSH keys only, no root login.** Edit `/etc/ssh/sshd_config.d/10-hardening.conf`:

   ```
   PasswordAuthentication no
   PermitRootLogin no
   PubkeyAuthentication yes
   ```

   then `sudo sshd -t && sudo systemctl restart ssh`. Test a new login again.

4. **Firewall: only 22, 80, 443.**

   ```sh
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   sudo ufw status verbose
   ```

   Docker publishes ports by editing iptables directly and can bypass UFW for
   published ports. That is acceptable here because the compose file publishes
   only 80 and 443 (Postgres, API and web publish nothing). Do not add `ports:`
   to those services.

5. **Automatic security updates.**

   ```sh
   sudo apt install -y unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades    # answer Yes
   ```

6. **Install Docker Engine + the compose plugin** (official repository, not the
   snap):

   ```sh
   sudo apt install -y ca-certificates curl git openssl
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
   sudo apt update
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo usermod -aG docker deploy      # log out and back in afterwards
   docker compose version
   ```

7. **Optional but recommended:** add 2 GB of swap as a safety net
   (`sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`,
   then add `/swapfile none swap sw 0 0` to `/etc/fstab`).

## 2. Get the code

As the `deploy` user:

```sh
cd ~
git clone <your-private-repository-url> chinese-platform
cd chinese-platform
```

All commands below are run **from this repository root**.

## 3. Configure `.env`

```sh
cp .env.example .env
chmod 600 .env
nano .env
```

`.env.example` has a **PRODUCTION** block at the bottom listing every variable.
For production, set these (and delete or ignore the development values above
them, in particular `NODE_ENV`, `DATABASE_URL*`, `APP_URL`, `INTERNAL_API_URL`,
`API_PUBLIC_ORIGIN`, `JWT_*`):

| Variable                                 | Value                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                               | `production`                                                                      |
| `APP_DOMAIN`                             | the public hostname, e.g. `school.example.com` (no scheme)                        |
| `APP_URL`                                | `https://school.example.com` (https, no trailing slash)                           |
| `POSTGRES_DB` / `POSTGRES_USER`          | e.g. `app` / `app`                                                                |
| `POSTGRES_PASSWORD`                      | `openssl rand -hex 24` (hex only: base64 characters would break the database URL) |
| `JWT_ACCESS_SECRET`                      | `openssl rand -base64 48`                                                         |
| `JWT_REFRESH_SECRET`                     | a **different** `openssl rand -base64 48`                                         |
| `API_PUBLIC_ORIGIN`                      | leave **empty/unset** (Paymob webhooks are derived from `APP_URL`)                |
| `BUNNY_*`, `PAYMOB_*`, `SMTP_*`          | provider values, **all of a group or none of it** (see below)                     |
| `BACKUP_DIR`, `BACKUP_UID`, `BACKUP_GID` | see [Backups](#backups-and-restore)                                               |

The API **refuses to start** (and says which variable is wrong, never its
value) if: a JWT secret is shorter than 32 characters or still a placeholder, the
two secrets are equal, `APP_URL`, `DATABASE_URL` or `INTERNAL_API_URL` is
missing or invalid, `APP_URL` or `API_PUBLIC_ORIGIN` is not `https`, or a Bunny
(5 values), Paymob (4 values) or SMTP (5 values) group is only partially filled.
The web container refuses to start without `INTERNAL_API_URL` (Compose sets it).
Compose itself refuses to start if `APP_DOMAIN`, `APP_URL` or `POSTGRES_*` are
missing.

Never commit `.env`. Keep a copy of it in your password manager: without the
JWT secrets and database password you cannot recover the stack.

Prepare the backup folder (it is a host directory, so it must exist and be
writable by `BACKUP_UID`):

```sh
sudo mkdir -p /var/backups/chinese-platform
sudo chown 1000:1000 /var/backups/chinese-platform     # `id deploy` shows your uid:gid
sudo chmod 700 /var/backups/chinese-platform
```

If `id -u deploy` is not `1000`, set `BACKUP_UID`/`BACKUP_GID` in `.env` to match.

## 4. Start the stack

`--env-file .env` is **required** on every compose command: Compose resolves
`${VARIABLES}` relative to `infra/`, not the repository root. Make it a habit
with an alias (add to `~/.bashrc`):

```sh
alias dc='docker compose --env-file .env -f infra/docker-compose.yml'
```

Then:

```sh
dc config --quiet && echo "compose file + .env OK"
dc up -d --build --wait         # first build takes several minutes
dc ps
```

`--wait` returns when postgres, migrate (exited 0), api, web and caddy are
healthy. Verify through Caddy (`--resolve` sends the request to this machine even before DNS exists; `-k` is needed until a real certificate exists in M15):

```sh
D=school.example.com        # your APP_DOMAIN
curl -ks --resolve $D:443:127.0.0.1 https://$D/api/v1/health   # {"status":"ok"}
curl -ks --resolve $D:443:127.0.0.1 https://$D/api/v1/ready    # {"status":"ok"} (checks the database)
for l in ar en zh; do curl -ks --resolve $D:443:127.0.0.1 -o /dev/null -w "$l %{http_code}\n" https://$D/$l; done
```

(Until DNS points at the server, Caddy cannot obtain a public certificate for
`APP_DOMAIN`; see [Cloudflare (M15)](#6-cloudflare-m15) for TLS. The local smoke
uses `APP_DOMAIN=localhost`, for which Caddy issues a certificate from its own
internal CA.)

## 5. First administrator

The admin CLI is interactive (hidden password prompts), so use a real terminal
(`-t` is the default):

```sh
dc exec api node dist/identity/admin-create.cli.js
```

It asks for email, name, phone (E.164, e.g. `+201001234567`) and the password
twice. If the email already belongs to a student it asks before promoting that
account. There is no password in `.env` or in shell history. Then sign in at
`https://<domain>/ar/login` and open the admin area.

## 6. Cloudflare (M15)

Do this when DNS and the domain exist. **Do not enable the `trusted_proxies`
step before Cloudflare is actually proxying the site**, otherwise visitors could
spoof their IP address.

1. Add the site to Cloudflare; at the registrar switch nameservers to Cloudflare's.
2. DNS: `A` record `school.example.com` (and `www` if wanted) -> VPS IP, **Proxied**
   (orange cloud).
3. SSL/TLS -> Overview: set mode **Full (strict)**. Edge Certificates: turn on
   _Always Use HTTPS_ and _Automatic HTTPS Rewrites_.
4. Origin certificate, choose **one**:
   - **Cloudflare Origin CA certificate** (recommended): SSL/TLS -> Origin Server ->
     Create Certificate (15 years). Save the certificate and key on the server
     under `infra/certs/origin.pem` and `infra/certs/origin.key` (mode 600,
     git-ignored), mount `./certs:/etc/caddy/certs:ro` into the `caddy` service
     and add `tls /etc/caddy/certs/origin.pem /etc/caddy/certs/origin.key` to the
     site block in `infra/Caddyfile`.
   - **Caddy ACME** (Let's Encrypt): leave the Caddyfile as is; set the
     Cloudflare SSL mode to _Full_ until the certificate is issued, then
     _Full (strict)_. The first issuance needs ports 80/443 reachable (DNS-01 is
     required if you enforce "Always Use HTTPS" at the edge before issuance).
5. **Real visitor IPs (so per-IP throttling works).** In `infra/Caddyfile`, in
   the global options block, enable the commented `servers` section:

   ```
   servers {
       trusted_proxies static <Cloudflare IPv4 and IPv6 ranges>
       client_ip_headers CF-Connecting-IP
   }
   ```

   The ranges are published at <https://www.cloudflare.com/ips/>. Re-check them
   occasionally. Without this, the API sees Cloudflare's address for every
   visitor and the login/register throttles act on all users together.

6. Restrict the origin firewall to Cloudflare ranges on 80/443 if you want
   (optional hardening; keep 22 open to your own IP only if it is static).

Then reload Caddy: `dc up -d caddy` (or `dc exec caddy caddy reload --config /etc/caddy/Caddyfile`
-- the admin endpoint is disabled, so prefer `dc restart caddy`).

## 7. Provider webhooks (M15)

Configure these with the **real domain**. Both webhook routes verify an HMAC
signature, bypass the Origin check on purpose, and are rate-limited.

| Provider | Where                                                                  | URL / value                                                                                 |
| -------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Bunny    | Stream library -> API / Webhook                                        | `https://<domain>/api/v1/webhooks/bunny`                                                    |
| Bunny    | Library "Read-Only API key"                                            | goes into `BUNNY_WEBHOOK_SECRET` (Bunny signs webhooks with it)                             |
| Paymob   | Integration -> "Transaction processed callback"                        | `https://<domain>/api/v1/webhooks/paymob` (Paymob appends `?hmac=...`)                      |
| Paymob   | Integration -> "Transaction response callback" (customer redirect)     | `https://<domain>/<ar\|en\|zh>/checkout/result` (the API also sends the per-order redirect) |
| Paymob   | Settings -> Account info -> HMAC secret                                | `PAYMOB_HMAC_SECRET`                                                                        |
| Paymob   | Cards integration id (test first, then live), secret + public API keys | `PAYMOB_INTEGRATION_IDS`, `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`                          |

Use Paymob **test mode** credentials first and complete the go-live checklist
before switching to live keys. After editing `.env`, apply with
`dc up -d api` (recreates the API with the new environment).

## Updating and rollback

**Deploy an update**

```sh
cd ~/chinese-platform
git fetch --tags && git pull --ff-only
git rev-parse --short HEAD > .deployed-sha.new        # remember what you are deploying
dc build
dc up -d --wait                                       # migrate runs first, then api/web restart
dc ps && curl -ks https://<domain>/api/v1/ready
mv .deployed-sha.new .deployed-sha
```

Before every update, back up both the database and uploads; this is mandatory, including updates without migrations:

```sh
dc exec backup /opt/backup/pg-backup.sh  # writes both the database dump and uploads tarball
```

The backup fails loudly if the configured uploads volume is missing; set `UPLOADS_DIR=""` only when intentionally skipping the uploads archive.

### Never lose videos

- Never run `dc down -v`; uploads and the database are persistent data.
- `UPLOADS_DIR` must point at the Compose `uploads` volume.
- After every deploy, check `/api/v1/admin/diagnostics/video` and confirm `missingLocalFiles` is `0`.
- After configuring Bunny, confirm the diagnostics page reports embed tokens as `enforced`.
- Local video storage is development-only; production must use Bunny Stream.

### Scaling

The API is supported as a single container: Bunny reconciliation, pending-delete retries, orphan cleanup and billing expiry timers run per instance, so multiple instances duplicate external calls even though the jobs are idempotent. Do not set `deploy.replicas` or scale the API above one until a leader lock is added.

### Migration rehearsal

To rehearse the legacy data-integrity migration against the guarded test database server, run `pnpm --filter @app/api test:migration-rehearsal`. It creates and drops scratch databases ending in `_test`.

**Zero-surprise rollback.** Before updating, tag the images that are running:

```sh
git_sha=$(git rev-parse --short HEAD)
docker tag chinese-platform-api:latest chinese-platform-api:rollback-$git_sha
docker tag chinese-platform-web:latest chinese-platform-web:rollback-$git_sha
```

If the new release misbehaves:

1. Code-only problem (no migration was applied): `git checkout <previous-sha>`,
   `dc up -d --build --wait`. Because layers are cached this is fast.
2. The release included a migration: migrations are forward-only. Restore the
   database from the backup taken before the update
   ([Restore](#restore)), then redeploy the previous git sha. Do not hand-edit
   the `_prisma_migrations` table.

(`docker compose images` shows the exact image names; with the project name
`chinese-platform` they are `chinese-platform-api` and `chinese-platform-web`.)

Prune old build cache from time to time: `docker image prune -f && docker builder prune -f`.

## Backups and restore

Decision (PLAN.md #12): backups stay **on the VPS**; there is no off-box backup
service. That makes copying them to your own computer a manual duty.

### What runs

The `backup` service (Postgres 16 client, same major as the database) sleeps
until `BACKUP_TIME` (default **03:30 Africa/Cairo**) every day, then writes to
`BACKUP_DIR` (default `/var/backups/chinese-platform`) with mode `0600`:

- `app-db-<UTC timestamp>.dump` - custom-format `pg_dump` (verified with `pg_restore --list`)
- `app-uploads-<UTC timestamp>.tar.gz` - the `uploads` volume (admin images; also
  any local development videos, which can be large: production videos live on Bunny)

Files older than `BACKUP_RETENTION_DAYS` (default **14**) are deleted. A failed
run logs `FAILED` to stderr and exits non-zero inside the container; the loop
keeps running and tries again the next night. `BACKUP_DIR/.last-success` holds
the time of the last good run.

Check it:

```sh
dc logs --tail 20 backup
ls -l /var/backups/chinese-platform
cat /var/backups/chinese-platform/.last-success
```

Run one right now: `dc exec backup /opt/backup/pg-backup.sh`.

### Copy backups to your own computer

Do this regularly (weekly at least), and always before risky changes. From your
**own computer**:

```sh
rsync -av --ignore-existing deploy@<server-ip>:/var/backups/chinese-platform/ ~/chinese-platform-backups/
# or a single file:
scp deploy@<server-ip>:/var/backups/chinese-platform/app-db-<timestamp>.dump .
```

The dumps contain student data (names, phones, password hashes): keep them on an
encrypted disk and do not share them.

### Restore

`infra/backup/restore.sh` replaces the live database (and optionally the
uploads) with a backup. It refuses to run without `--yes`.

```sh
ls -lt /var/backups/chinese-platform | head          # pick the files
infra/backup/restore.sh --yes \
  --db      /var/backups/chinese-platform/app-db-<timestamp>.dump \
  --uploads /var/backups/chinese-platform/app-uploads-<timestamp>.tar.gz
```

It stops `api` and `web`, runs `pg_restore --clean --if-exists --no-owner` in a
single transaction (a failed restore leaves the database untouched), runs the
`migrate` service so a dump taken before an update is upgraded to the current
schema, unpacks the uploads over the volume (it never deletes extra files), and
starts `api`/`web` again, waiting for health. Use `--env-file`/`-p`/`-f` to
point at a non-default `.env` or Compose project.

To restore onto a **new server**: do sections 1-4 there (leave the stack
running), copy the files into its `BACKUP_DIR`, then run the command above.
Afterwards sign in and spot-check a student, an enrollment and an image.

Do a **restore drill** on a test machine (or with `pnpm smoke:prod`, which
performs backup -> change -> restore -> verify automatically) before go-live and
after major changes.

## Logs and monitoring

No external monitoring service is used in the MVP. Docker keeps JSON logs with
rotation (10 MB x 3 files per container).

```sh
dc logs -f --tail 100 api          # API (pino JSON; no cookies, headers, bodies or tokens)
dc logs -f --tail 100 web caddy    # web + Caddy access logs (JSON)
dc logs --since 1h backup migrate
dc ps                              # health/state of every service
docker stats --no-stream           # live memory/CPU against the limits
```

Uptime checks you can do yourself or point a free external checker at:
`https://<domain>/api/v1/health` (process alive) and `/api/v1/ready` (database
reachable). Look at the backup log and `.last-success` after the first nights.

## Resource sizing

Defaults assume a KVM 2 (2 vCPU / 8 GB). Every value can be overridden in `.env`
(`<SERVICE>_MEM_LIMIT`, `<SERVICE>_CPUS`, `<SERVICE>_PIDS_LIMIT`).

| Service  | Memory | CPUs | PIDs | Notes                                                          |
| -------- | ------ | ---- | ---- | -------------------------------------------------------------- |
| caddy    | 128 MB | 0.5  | 128  | reverse proxy, static `/media`, TLS                            |
| web      | 1 GB   | 1.0  | 256  | Next.js SSR; `.next/cache` is a 256 MB tmpfs (counts as RAM)   |
| api      | 768 MB | 1.0  | 256  | NestJS; image processing (sharp) is the memory peak            |
| migrate  | 512 MB | 1.0  | 128  | one-shot at each `up`                                          |
| postgres | 1 GB   | 1.5  | 200  | `shared_buffers` 256 MB, `max_connections` 50, `work_mem` 4 MB |
| backup   | 256 MB | 0.5  | 64   | idle except for ~1 minute nightly                              |

Total hard memory cap is about 3.7 GB, leaving the rest of the 8 GB for the OS
page cache (which Postgres relies on), Docker and builds. Building images on the
server needs about 2 GB extra for a few minutes. On a smaller VPS (KVM 1, 4 GB)
reduce `WEB_MEM_LIMIT=768m`, `POSTGRES_MEM_LIMIT=768m`,
`POSTGRES_SHARED_BUFFERS=192MB`, `POSTGRES_EFFECTIVE_CACHE_SIZE=448MB`.

Writable paths in the otherwise read-only containers: `/tmp` (tmpfs) for api,
web, migrate and backup; `/app/uploads` (volume) for api; `/app/apps/web/.next/cache`
(tmpfs) for web; `/backups` (host folder) for backup. Postgres and Caddy keep
state in named volumes.

## Local production smoke

`pnpm smoke:prod` (needs Docker, openssl, curl) runs the **same** production
stack locally as the isolated Compose project `cl-smoke`, with random throwaway
secrets in the git-ignored `infra/.smoke/`, on host ports **18080/18443** (override
with `SMOKE_HTTP_PORT` / `SMOKE_HTTPS_PORT`; `APP_DOMAIN=localhost`, TLS from
Caddy's internal CA, so the script uses `curl -k`). It checks health, locale
pages (Arabic RTL), 404s, security headers, cookies, CSRF/Origin, admin vs
student access, image upload and `/media` caching, non-root and read-only
containers, log hygiene, and the backup -> change -> restore -> verify round
trip, then removes only the `cl-smoke` project. It prints a PASS/FAIL summary and
exits non-zero on any failure. `KEEP=1 pnpm smoke:prod` leaves the stack up for
inspection (the command to remove it is printed). The smoke creates its admin
with a one-off SQL `UPDATE`, because the real admin CLI is interactive; this is
used only by the smoke.

## Troubleshooting

| Symptom                                             | Check / fix                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required variable ... is missing a value`          | A required `.env` value is missing, or you forgot `--env-file .env`.                                                                                     |
| `dc up` fails on `migrate`                          | `dc logs migrate`. Usually a wrong `POSTGRES_*` (changing the password in `.env` does **not** change an existing database volume) or Postgres not ready. |
| `api` exits at boot with `Invalid environment`      | `dc logs api` names the variable (never its value). Fix `.env`, then `dc up -d api`.                                                                     |
| Caddy cannot get a certificate                      | DNS must point at the VPS, ports 80/443 must be open (UFW and Hostinger firewall), or use the Cloudflare Origin certificate.                             |
| Browser shows a redirect loop with Cloudflare       | Cloudflare SSL mode is _Flexible_; set **Full (strict)**.                                                                                                |
| Login says "origin not allowed" / 403 on every POST | `APP_URL` must equal the exact address in the browser (scheme + host, no trailing slash, no port unless used).                                           |
| Everyone gets 429 "Too Many Requests"               | Per-IP throttling sees one IP: the `trusted_proxies` step (M15) is missing, or Cloudflare is not proxied.                                                |
| `backup` cannot write                               | `BACKUP_DIR` must exist and be owned by `BACKUP_UID:BACKUP_GID`; `dc logs backup`.                                                                       |
| Container killed / restarting (`OOMKilled`)         | `docker inspect <container> --format '{{.State.OOMKilled}}'`; raise that service's `*_MEM_LIMIT`.                                                        |
| `dc ps` shows `web` unhealthy                       | `dc logs web`. A missing `INTERNAL_API_URL` or API outage; Caddy only starts after both are healthy.                                                     |
| Disk filling up                                     | `docker system df`, `du -sh /var/backups/chinese-platform`; lower `BACKUP_RETENTION_DAYS`, `docker image prune -f`.                                      |
| Need a shell in a read-only container               | `dc exec api sh` works (reads are fine); writes outside `/tmp` and `/app/uploads` fail by design.                                                        |
| Stop everything (keeps data)                        | `dc down`. **Never** run `dc down -v` on the real server: `-v` deletes the database and uploads volumes.                                                 |

## Go-live checklist

Tick every box on the real server before announcing the site. Items that need
the real domain or provider accounts are the M15 work.

**Secrets and access**

- [ ] `.env` is mode 600, not committed, and a copy is stored in a password manager
- [ ] All secrets are freshly generated for production (not the development or
      smoke values); JWT access and refresh secrets differ and are >= 32 chars
- [ ] API boots in production mode with no `Invalid environment` error
- [ ] First admin created (`dc exec api node dist/identity/admin-create.cli.js`) and can sign in
- [ ] SSH is key-only, root login disabled; UFW allows only 22, 80, 443
- [ ] Unattended security upgrades enabled

**Platform**

- [ ] `dc ps` shows every service healthy; `/api/v1/health` and `/api/v1/ready` return 200 through the domain
- [ ] `/ar`, `/en`, `/zh` load; Arabic pages render right-to-left (`dir="rtl"`)
- [ ] Cloudflare: DNS proxied, SSL/TLS **Full (strict)**, origin certificate valid, HTTP redirects to HTTPS
- [ ] Caddy `trusted_proxies` configured for Cloudflare; a login attempt from two
      different networks is throttled independently (visitor IPs are real)
- [ ] Security headers present (`curl -sI https://<domain>/en`): HSTS, `nosniff`,
      referrer policy, permissions policy, no `Server`
- [ ] Resource limits fit the VPS (`docker stats --no-stream`, no `OOMKilled`)

**Payments and video**

- [ ] Paymob **test mode** purchase end to end: pay with a test card, webhook
      marks the order paid, the student is enrolled and can open the lessons
- [ ] Paymob webhook signature verified: a request with a wrong `hmac` is rejected (401)
- [ ] Bunny: admin uploads a video -> encode finishes -> a student with access
      plays it; a student without access does not
- [ ] Bunny webhook signature verified: an unsigned or wrongly signed request is rejected (401)
- [ ] Paymob switched to live keys only after all of the above passed

**Backups and recovery**

- [ ] Nightly backup ran at least once on the server (`.last-success`, files `0600`)
- [ ] A restore was tested (`infra/backup/restore.sh --yes ...` on a spare
      machine or `pnpm smoke:prod`) and the data checked
- [ ] A backup was copied to your own computer with `rsync`/`scp`

**Content and legal**

- [ ] Legal pages (terms of service, privacy policy, refund policy) and a contact
      page/email exist and are linked from the footer. **None exist in the app
      yet**: ask the owner for the text (needed for Paymob approval too)
- [ ] Brand name, instructor photo/bio and the syllabus/level content are final
- [ ] SMTP configured (or password-reset email deliberately disabled and
      documented), and a reset email arrives in the inbox
