#!/usr/bin/env bash
#
# One-shot deploy: Turso database, schema, first data load, Vercel app.
#
#   bash scripts/deploy.sh
#
# Run the two logins first — they open a browser and only you can complete them:
#   turso auth login
#   vercel login
#
# Safe to re-run. Every step checks whether it has already been done.

set -euo pipefail

export PATH="$HOME/.turso:$PATH"
DB_NAME="${DB_NAME:-watch-desk}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v turso  >/dev/null || die "turso CLI not found. curl -sSfL https://get.tur.so/install.sh | bash"
command -v vercel >/dev/null || die "vercel CLI not found. npm i -g vercel"

turso auth token >/dev/null 2>&1 || die "Not logged in to Turso. Run: turso auth login"

# --- 1. Database ------------------------------------------------------------
say "1/5  Turso database"
if turso db show "$DB_NAME" >/dev/null 2>&1; then
  echo "     '$DB_NAME' already exists — reusing it"
else
  turso db create "$DB_NAME"
fi

DB_URL="$(turso db show "$DB_NAME" --url)"
DB_TOKEN="$(turso db tokens create "$DB_NAME")"
echo "     $DB_URL"

# --- 2. Schema --------------------------------------------------------------
say "2/5  Pushing the schema"
DATABASE_URL="$DB_URL" TURSO_AUTH_TOKEN="$DB_TOKEN" npx prisma migrate deploy
DATABASE_URL="$DB_URL" TURSO_AUTH_TOKEN="$DB_TOKEN" npm run db:seed

# --- 3. First data load -----------------------------------------------------
# This MUST run from here rather than from CI: NSE refuses datacenter IPs, so
# the fetching has to leave from a home connection. See docs/HOSTING.md.
say "3/5  First data load (from this machine — NSE blocks datacenters)"
DATABASE_URL="$DB_URL" TURSO_AUTH_TOKEN="$DB_TOKEN" npm run backfill || \
  echo "     backfill hit an upstream limit; the poller will finish it"

# --- 4. Access password -----------------------------------------------------
say "4/5  Access password"
if [ -z "${ACCESS_PASSWORD:-}" ]; then
  ACCESS_PASSWORD="$(openssl rand -base64 24)"
  echo "     generated — SAVE THIS, it is how you get in:"
  printf '\n       \033[1m%s\033[0m\n\n' "$ACCESS_PASSWORD"
else
  echo "     using the one already in your environment"
fi

# --- 5. Deploy --------------------------------------------------------------
say "5/5  Vercel"
# Interactive on purpose. `--yes` links to a project named after this folder
# ("market"), which is NOT necessarily the project you deployed — that silently
# creates a stray third project. Pick the real one, or set VERCEL_PROJECT.
if [ -n "${VERCEL_PROJECT:-}" ]; then
  vercel link --yes --project "$VERCEL_PROJECT" >/dev/null
else
  vercel link
fi

# Both targets: a preview build that cannot reach the database fails exactly
# the same way production did, and the error is just as confusing there.
set_env() {
  for tgt in production preview; do
    vercel env rm "$1" "$tgt" --yes >/dev/null 2>&1 || true
    printf '%s' "$2" | vercel env add "$1" "$tgt" >/dev/null 2>&1 || true
  done
  echo "     set $1 (production + preview)"
}
set_env DATABASE_URL     "$DB_URL"
set_env TURSO_AUTH_TOKEN "$DB_TOKEN"
set_env ACCESS_PASSWORD  "$ACCESS_PASSWORD"

vercel --prod

say "Done."
cat <<EOF
     Open the URL above — it should land on /unlock, not the panel.
     Password: the value printed in step 4.

     To keep it current, run this on this machine (not in the cloud):
       DATABASE_URL="$DB_URL" \\
       TURSO_AUTH_TOKEN="$DB_TOKEN" \\
       npm run poller
EOF
