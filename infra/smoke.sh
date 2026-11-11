#!/usr/bin/env bash
# Local production-stack smoke test (`pnpm smoke:prod`).
#
# Boots the real production Compose stack (Caddy, web, api, migrate, postgres,
# backup) as the isolated project "cl-smoke" with throwaway random secrets, then
# drives it through Caddy over HTTPS (Caddy's internal CA for "localhost") and
# proves: health, locale pages, security headers, auth cookies, role checks,
# image upload + /media caching, non-root + read-only containers, secrets absent
# from logs, and a backup -> change data -> restore -> verify round trip.
#
# Environment:
#   SMOKE_HTTP_PORT   host port for Caddy's HTTP   (default 18080)
#   SMOKE_HTTPS_PORT  host port for Caddy's HTTPS  (default 18443)
#   KEEP=1            leave the stack and infra/.smoke/ running for inspection
#
# It only ever touches the Compose project "cl-smoke" and infra/.smoke/.
# Needs: docker (compose plugin), openssl, curl.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

project=cl-smoke
smoke_dir=$root/infra/.smoke
env_file=$smoke_dir/.env
http_port=${SMOKE_HTTP_PORT:-18080}
https_port=${SMOKE_HTTPS_PORT:-18443}
base="https://localhost:$https_port"

dc() {
  docker compose -p "$project" --env-file "$env_file" -f infra/docker-compose.yml "$@"
}

pass=0
fail=0
failures=()
started=0

ok() {
  pass=$((pass + 1))
  printf '  PASS  %s\n' "$1"
}
bad() {
  fail=$((fail + 1))
  failures+=("$1")
  printf '  FAIL  %s%s\n' "$1" "${2:+  ($2)}"
}
section() { printf '\n== %s\n' "$1"; }

# expect NAME ACTUAL EXPECTED
expect() {
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $3, got $2"; fi
}
# expect_contains NAME HAYSTACK NEEDLE (fixed string, case-insensitive)
expect_contains() {
  if printf '%s' "$2" | grep -qiF -- "$3"; then ok "$1"; else bad "$1" "missing: $3"; fi
}
expect_absent() {
  if printf '%s' "$2" | grep -qiF -- "$3"; then bad "$1" "unexpected: $3"; else ok "$1"; fi
}

psql_app() {
  dc exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt' <<<"$1" | tr -d '\r'
}

status() { curl -ks -o /dev/null -w '%{http_code}' "$@"; }

cleanup() {
  local code=$?
  set +e
  if [ "$started" = 1 ] && [ "${KEEP:-0}" != 1 ]; then
    echo
    echo "Tearing down project $project (volumes included)"
    dc down -v --remove-orphans >/dev/null 2>&1
    rm -rf "$smoke_dir"
  elif [ "${KEEP:-0}" = 1 ]; then
    echo
    echo "KEEP=1: stack left running at $base (project $project, files in infra/.smoke/)."
    echo "Remove it with: docker compose -p $project --env-file infra/.smoke/.env -f infra/docker-compose.yml down -v"
  fi
  echo
  if [ "$code" -ne 0 ] && [ "$fail" -eq 0 ]; then
    fail=1
    failures+=("smoke aborted before finishing (exit $code)")
  fi
  echo "================ SMOKE SUMMARY ================"
  echo "passed: $pass   failed: $fail"
  if [ "$fail" -gt 0 ]; then
    for item in "${failures[@]}"; do echo "  - $item"; done
    echo "RESULT: FAIL"
    exit 1
  fi
  echo "RESULT: PASS"
  exit 0
}
trap cleanup EXIT

section "Preflight"
for tool in docker openssl curl; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 2; }
done
for port in "$http_port" "$https_port"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "Host port $port is already in use. Set SMOKE_HTTP_PORT / SMOKE_HTTPS_PORT." >&2
    exit 2
  fi
done
ok "docker, openssl, curl present; ports $http_port/$https_port free"

section "Generate throwaway configuration (infra/.smoke/.env)"
# A previous KEEP=1 run may have left a cl-smoke stack behind: remove only that.
if [ -f "$env_file" ]; then
  dc down -v --remove-orphans >/dev/null 2>&1 || true
fi
rm -rf "$smoke_dir"
mkdir -p "$smoke_dir/backups"
(
  umask 077
  cat > "$env_file" <<ENV
NODE_ENV=production
APP_DOMAIN=localhost
APP_URL=$base
POSTGRES_DB=app
POSTGRES_USER=app
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d '\n')
JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
HTTP_PORT=$http_port
HTTPS_PORT=$https_port
BACKUP_DIR=$smoke_dir/backups
BACKUP_UID=$(id -u)
BACKUP_GID=$(id -g)
APP_ENV_FILE=.smoke/.env
ENV
)
ok "random secrets written (not logged)"

section "Boot the production stack"
started=1
if dc up -d --build --wait --wait-timeout 900; then
  ok "docker compose up --wait (all services healthy)"
else
  bad "docker compose up --wait"
  dc ps -a || true
  dc logs --tail 40 || true
  exit 1
fi

section "Health and pages through Caddy ($base)"
expect "GET /api/v1/health" "$(status "$base/api/v1/health")" 200
expect "GET /api/v1/ready" "$(status "$base/api/v1/ready")" 200
for locale in ar en zh; do
  expect "GET /$locale" "$(status "$base/$locale")" 200
done
ar_html=$(curl -ks "$base/ar")
expect_contains "/ar renders dir=\"rtl\"" "$ar_html" 'dir="rtl"'
expect_absent "/en is not rtl" "$(curl -ks "$base/en")" 'dir="rtl"'
expect "unknown level page is 404" "$(status "$base/en/levels/no-such-level-xyz")" 404
expect "unknown API route is 404" "$(status "$base/api/v1/no-such-route")" 404
expect "HTTP redirects to HTTPS" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$http_port/en")" 308

section "Security headers and compression"
for path in /en /api/v1/health; do
  headers=$(curl -ks -D - -o /dev/null -H 'Accept-Encoding: gzip' "$base$path" | tr -d '\r')
  expect_contains "$path: Strict-Transport-Security" "$headers" 'strict-transport-security: max-age='
  expect_contains "$path: X-Content-Type-Options" "$headers" 'x-content-type-options: nosniff'
  expect_contains "$path: Referrer-Policy" "$headers" 'referrer-policy: strict-origin-when-cross-origin'
  expect_contains "$path: Permissions-Policy" "$headers" 'permissions-policy:'
  if printf '%s\n' "$headers" | grep -qi '^server:'; then bad "$path: Server header removed"; else ok "$path: Server header removed"; fi
done
expect_absent "HSTS has no preload" "$headers" 'preload'
page_headers=$(curl -ks -D - -o /dev/null -H 'Accept-Encoding: zstd, gzip' "$base/en" | tr -d '\r')
expect_contains "/en is compressed" "$page_headers" 'content-encoding:'

section "Register, cookies and CSRF"
suffix=$(openssl rand -hex 4)
student_email="student-$suffix@smoke.test"
admin_email="admin-$suffix@smoke.test"
password="Smoke-$(openssl rand -hex 8)"
student_jar=$smoke_dir/student.jar
admin_jar=$smoke_dir/admin.jar
json='content-type: application/json'
origin_header="Origin: $base"

register_body() { printf '{"email":"%s","name":"%s","phone":"%s","password":"%s"}' "$1" "$2" "$3" "$password"; }

expect "register without Origin is rejected (403)" \
  "$(status -X POST -H "$json" -d "$(register_body "x-$suffix@smoke.test" 'No Origin' +201001230000)" "$base/api/v1/auth/register")" 403
expect "register with a foreign Origin is rejected (403)" \
  "$(status -X POST -H "$json" -H 'Origin: https://evil.example' -d "$(register_body "y-$suffix@smoke.test" 'Foreign' +201001230001)" "$base/api/v1/auth/register")" 403

reg_headers=$(curl -ks -D - -o /dev/null -c "$student_jar" -X POST -H "$json" -H "$origin_header" \
  -d "$(register_body "$student_email" 'Smoke Student' +201001234567)" "$base/api/v1/auth/register" | tr -d '\r')
expect_contains "register student returns 201" "$reg_headers" ' 201'
for cookie in access_token refresh_token; do
  line=$(printf '%s\n' "$reg_headers" | grep -i "^set-cookie: $cookie=" || true)
  expect_contains "$cookie cookie is HttpOnly" "$line" 'HttpOnly'
  expect_contains "$cookie cookie is Secure" "$line" 'Secure'
  expect_contains "$cookie cookie is SameSite=Lax" "$line" 'SameSite=Lax'
done
login_headers=$(curl -ks -D - -o /dev/null -c "$student_jar" -X POST -H "$json" -H "$origin_header" \
  -d "$(printf '{"email":"%s","password":"%s"}' "$student_email" "$password")" "$base/api/v1/auth/login" | tr -d '\r')
expect_contains "student login returns 200" "$login_headers" ' 200'
expect "GET /auth/me as student" "$(status -b "$student_jar" "$base/api/v1/auth/me")" 200

section "First admin (smoke-only SQL promotion; the real CLI is interactive)"
expect_contains "register admin candidate" \
  "$(curl -ks -o /dev/null -w '%{http_code}' -X POST -H "$json" -H "$origin_header" -d "$(register_body "$admin_email" 'Smoke Admin' +201001234568)" "$base/api/v1/auth/register")" 201
psql_app "UPDATE \"User\" SET role = 'ADMIN' WHERE email = '$admin_email'" >/dev/null
expect "admin login after promotion" \
  "$(status -c "$admin_jar" -X POST -H "$json" -H "$origin_header" -d "$(printf '{"email":"%s","password":"%s"}' "$admin_email" "$password")" "$base/api/v1/auth/login")" 200
expect "admin route without session is 401" "$(status "$base/api/v1/admin/overview")" 401
expect "admin route as student is 403" "$(status -b "$student_jar" "$base/api/v1/admin/overview")" 403
expect "admin route as admin is 200" "$(status -b "$admin_jar" "$base/api/v1/admin/overview")" 200

section "Image upload and /media caching"
png=$smoke_dir/pixel.png
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' | base64 -d > "$png"
upload=$(curl -ks -w '\n%{http_code}' -b "$admin_jar" -H "$origin_header" -F "file=@$png;type=image/png" "$base/api/v1/admin/media/images")
upload_code=$(printf '%s' "$upload" | tail -n 1)
upload_body=$(printf '%s' "$upload" | sed '$d')
case "$upload_code" in 200 | 201) ok "admin image upload ($upload_code)" ;; *) bad "admin image upload" "status $upload_code" ;; esac
media_path=$(printf '%s' "$upload_body" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
if [ -n "$media_path" ]; then
  media_headers=$(curl -ks -D - -o /dev/null "$base$media_path" | tr -d '\r')
  expect_contains "GET $media_path is 200" "$media_headers" ' 200'
  expect_contains "media cache-control is immutable" "$media_headers" 'cache-control: public, max-age=31536000, immutable'
  expect_contains "media is served as an image" "$media_headers" 'content-type: image/'
else
  bad "upload response contains a media url"
  media_path=/media/missing
fi
expect "student cannot upload (403)" "$(status -b "$student_jar" -H "$origin_header" -F "file=@$png;type=image/png" "$base/api/v1/admin/media/images")" 403

section "Container hardening"
for svc in api web; do
  uid=$(dc exec -T "$svc" id -u | tr -d '\r')
  if [ "$uid" != 0 ]; then ok "$svc runs as non-root (uid $uid)"; else bad "$svc runs as non-root" "uid 0"; fi
  if dc exec -T "$svc" sh -c 'touch /readonly-probe' >/dev/null 2>&1; then
    bad "$svc root filesystem is read-only" "write to / succeeded"
  else
    ok "$svc root filesystem is read-only"
  fi
  if dc exec -T "$svc" sh -c 'touch /tmp/probe && rm /tmp/probe' >/dev/null 2>&1; then ok "$svc /tmp (tmpfs) is writable"; else bad "$svc /tmp is writable"; fi
done
if dc exec -T api sh -c 'touch /app/uploads/images/.probe && rm /app/uploads/images/.probe' >/dev/null 2>&1; then ok "api can write the uploads volume"; else bad "api can write the uploads volume"; fi
if dc exec -T web sh -c 'touch /app/apps/web/.next/cache/probe && rm /app/apps/web/.next/cache/probe' >/dev/null 2>&1; then ok "web can write its .next/cache tmpfs"; else bad "web can write its .next/cache tmpfs"; fi
migrate_uid=$(dc run --rm --no-deps -T --entrypoint id migrate -u 2>/dev/null | tr -d '\r' | tail -n 1)
if [ -n "$migrate_uid" ] && [ "$migrate_uid" != 0 ]; then ok "migrate runs as non-root (uid $migrate_uid)"; else bad "migrate runs as non-root" "uid '$migrate_uid'"; fi
backup_uid=$(dc exec -T backup id -u | tr -d '\r')
if [ "$backup_uid" != 0 ]; then ok "backup runs as non-root (uid $backup_uid)"; else bad "backup runs as non-root"; fi
postgres_ports=$(docker port "$(dc ps -q postgres)" 2>/dev/null || true)
expect "postgres publishes no host port" "$postgres_ports" ""
api_json=$(dc logs --no-log-prefix --tail 5 api 2>/dev/null | head -n 1)
case "$api_json" in '{'*) ok "api logs JSON lines" ;; *) bad "api logs JSON lines" "first line: ${api_json:0:60}" ;; esac
caddy_log=$(dc logs --no-log-prefix --tail 200 caddy 2>/dev/null | grep -F '"http.log.access' | head -n 1 || true)
expect_contains "caddy writes JSON access logs" "$caddy_log" '"request"'

section "Secrets are not in container logs"
all_logs=$(dc logs --no-log-prefix 2>&1 || true)
access_cookie=$(awk '$6 == "access_token" {print $7}' "$student_jar" | head -n 1)
refresh_cookie=$(awk '$6 == "refresh_token" {print $7}' "$student_jar" | head -n 1)
expect_absent "password absent from logs" "$all_logs" "$password"
[ -n "$access_cookie" ] && expect_absent "access token absent from logs" "$all_logs" "$access_cookie" || bad "student access cookie captured"
[ -n "$refresh_cookie" ] && expect_absent "refresh token absent from logs" "$all_logs" "$refresh_cookie" || bad "student refresh cookie captured"
db_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$env_file")
expect_absent "database password absent from logs" "$all_logs" "$db_password"
unset all_logs

section "Backup -> change data -> restore -> verify"
if dc exec -T backup /opt/backup/pg-backup.sh >"$smoke_dir/backup.log" 2>&1; then ok "pg-backup.sh succeeded"; else bad "pg-backup.sh succeeded"; cat "$smoke_dir/backup.log" || true; fi
expect_absent "backup log never prints the database password" "$(cat "$smoke_dir/backup.log")" "$db_password"
dump=$(ls -1t "$smoke_dir"/backups/app-db-*.dump 2>/dev/null | head -n 1 || true)
uploads_tar=$(ls -1t "$smoke_dir"/backups/app-uploads-*.tar.gz 2>/dev/null | head -n 1 || true)
if [ -n "$dump" ] && [ -n "$uploads_tar" ]; then ok "dump and uploads tarball were written"; else bad "dump and uploads tarball were written"; fi
for file in "$dump" "$uploads_tar"; do
  [ -n "$file" ] && expect "$(basename "$file") is mode 600" "$(stat -c %a "$file")" 600
done
expect "pg_restore can list the dump" "$(dc exec -T backup sh -c 'pg_restore --list /backups/'"$(basename "${dump:-none}")"' >/dev/null && echo yes' 2>/dev/null | tr -d '\r')" yes

users_before=$(psql_app 'SELECT count(*) FROM "User"')
psql_app "UPDATE \"User\" SET name = 'CHANGED-AFTER-BACKUP' WHERE email = '$student_email'" >/dev/null
psql_app "INSERT INTO \"User\" (id, email, \"passwordHash\", name, phone, \"updatedAt\") VALUES (gen_random_uuid(), 'sentinel-$suffix@smoke.test', 'x', 'Sentinel', '+201001230099', now())" >/dev/null
expect "sentinel row exists before restore" "$(psql_app "SELECT count(*) FROM \"User\" WHERE email = 'sentinel-$suffix@smoke.test'")" 1
expect "sentinel rename visible before restore" "$(psql_app "SELECT name FROM \"User\" WHERE email = '$student_email'")" CHANGED-AFTER-BACKUP
# Remove the uploaded image so we can prove the uploads tarball brings it back.
dc exec -T api sh -c 'find /app/uploads/images -type f -delete'
expect "uploaded image is gone before restore" "$(status "$base$media_path")" 404

if [ -n "$dump" ] && [ -n "$uploads_tar" ]; then
  expect "restore.sh refuses without --yes" \
    "$(infra/backup/restore.sh --env-file "$env_file" -p "$project" --db "$dump" >/dev/null 2>&1; echo $?)" 2
  if infra/backup/restore.sh --yes --env-file "$env_file" -p "$project" --db "$dump" --uploads "$uploads_tar" >"$smoke_dir/restore.log" 2>&1; then
    ok "restore.sh --yes completed"
  else
    bad "restore.sh --yes completed"
    tail -n 30 "$smoke_dir/restore.log" || true
  fi
  expect "sentinel row is gone after restore" "$(psql_app "SELECT count(*) FROM \"User\" WHERE email = 'sentinel-$suffix@smoke.test'")" 0
  expect "student name matches the backup" "$(psql_app "SELECT name FROM \"User\" WHERE email = '$student_email'")" "Smoke Student"
  expect "user count matches the backup" "$(psql_app 'SELECT count(*) FROM "User"')" "$users_before"
  expect "uploaded image is back after restore" "$(status "$base$media_path")" 200
  expect "GET /api/v1/ready after restore" "$(status "$base/api/v1/ready")" 200
  expect "student can still log in after restore" \
    "$(status -X POST -H "$json" -H "$origin_header" -d "$(printf '{"email":"%s","password":"%s"}' "$student_email" "$password")" "$base/api/v1/auth/login")" 200
fi
