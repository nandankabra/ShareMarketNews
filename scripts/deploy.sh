#!/usr/bin/env bash
#
# One-shot deploy to Vercel.
#
#   bash scripts/deploy.sh
#
# Run the login first — it opens a browser and only you can complete it:
#   vercel login
#
# Safe to re-run. Every step checks whether it has already been done.
#
# There is no database step. The deployed app fetches upstream inside the
# request through src/lib/live/; ACCESS_PASSWORD is the only variable it needs.
# See docs/HOSTING.md for why the Turso and poller setup this script used to
# perform is gone.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

VERCEL_PROJECT="${VERCEL_PROJECT:-share-market-news}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v vercel >/dev/null || die "vercel CLI not found. npm i -g vercel"
vercel whoami >/dev/null 2>&1 || die "Not logged in to Vercel. Run: vercel login"

# --- 1. Checks --------------------------------------------------------------
# Before the deploy rather than after: a build that fails on Vercel costs a
# round trip to discover something `tsc` knew instantly.
say "1/4  Checks"
npm run check

# --- 2. Link ----------------------------------------------------------------
say "2/4  Linking to '$VERCEL_PROJECT'"
if [ -f .vercel/project.json ]; then
  echo "     already linked — reusing .vercel/project.json"
else
  # Named on purpose. `vercel link --yes` with no project links to one named
  # after this folder ("market"), which is NOT the project this app deploys to,
  # and silently creates a stray.
  vercel link --yes --project "$VERCEL_PROJECT" >/dev/null
  echo "     linked"
fi

# --- 3. Access password -----------------------------------------------------
# Not optional. The panel has mutating server actions and no user model, so an
# ungated URL lets a stranger edit the watchlist and drive requests at the
# upstreams from your deployment. See docs/DEPLOY.md.
say "3/4  Access password"
if vercel env ls production 2>/dev/null | grep -q '^ *ACCESS_PASSWORD '; then
  echo "     already set in production — leaving it alone"
else
  PW="${ACCESS_PASSWORD:-$(openssl rand -base64 24)}"
  for tgt in production preview; do
    printf '%s' "$PW" | vercel env add ACCESS_PASSWORD "$tgt" >/dev/null 2>&1 || true
  done
  echo "     generated — SAVE THIS, it is how you get in:"
  printf '\n       \033[1m%s\033[0m\n\n' "$PW"
fi

# --- 4. Deploy --------------------------------------------------------------
say "4/4  Deploying to production"
vercel --prod --yes

say "Done."
cat <<'TXT'
     Verify: the URL should answer 307 to /unlock, and /api/pulse should be
     401 {"error":"Locked"}. Then sign in and open /api/probe — it runs every
     upstream from the deployed host.

     YAHOO_CHART failing there is expected; see docs/HOSTING.md.
TXT
