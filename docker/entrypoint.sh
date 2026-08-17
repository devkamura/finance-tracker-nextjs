#!/bin/sh
set -e

echo "[entrypoint] applying prisma migrations..."
npx prisma migrate deploy

echo "[entrypoint] seeding master data (idempotent)..."
npx prisma db seed || true

exec "$@"
