#!/bin/sh

# Source auto-generated secrets from the shared volume
if [ -f /secrets/.env ]; then
  set -a
  . /secrets/.env
  set +a
fi

# If JWT_SECRET is still empty, generate a fallback (shouldn't happen)
if [ -z "${JWT_SECRET-}" ]; then
  echo "[entrypoint] WARNING: JWT_SECRET not set. Generating ephemeral fallback." >&2
  export JWT_SECRET="lamba-$(date +%s)-$$-fallback"
fi

exec "$@"
