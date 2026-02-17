#!/bin/sh
set -e

# Run migrations (retry a few times in case DB is not ready yet, e.g. Railway Postgres)
MAX_TRIES=5
TRY=1
until npx prisma migrate deploy; do
  if [ "$TRY" -ge "$MAX_TRIES" ]; then
    echo "prisma migrate deploy failed after $MAX_TRIES attempts"
    exit 1
  fi
  echo "Migration attempt $TRY failed, retrying in 5s..."
  sleep 5
  TRY=$((TRY + 1))
done

exec node server.js
