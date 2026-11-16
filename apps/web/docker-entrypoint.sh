#!/bin/sh
# Apply database migrations, then start the server.
set -e

# A local run without BETTER_AUTH_SECRET gets a random secret kept in /data, so sessions
# survive restarts. Production deployments should set the variable explicitly.
if [ -z "$BETTER_AUTH_SECRET" ]; then
  if [ ! -s /data/auth-secret ]; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > /data/auth-secret
    echo "entrypoint: generated a local BETTER_AUTH_SECRET (stored in the papertrail-data volume)"
  fi
  BETTER_AUTH_SECRET=$(cat /data/auth-secret)
  export BETTER_AUTH_SECRET
fi

# The database may still be starting (first run of the bundled PostgreSQL, or a hosted
# database waking up): retry the migrations for up to two minutes.
tries=0
until MIGRATIONS_DIR=/app/db/migrations node scripts/migrate.mjs; do
  tries=$((tries + 1))
  if [ "$tries" -ge 24 ]; then
    echo "entrypoint: database still unreachable after 2 minutes; giving up" >&2
    exit 1
  fi
  echo "entrypoint: database not ready, retrying in 5 s"
  sleep 5
done

exec node server.js
