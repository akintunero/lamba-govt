#!/bin/sh
set -eu

PGHOST="${PGHOST:-db}"
PGUSER="${PGUSER:-lamba}"
PGPASSWORD="${PGPASSWORD:-lamba}"

export PGPASSWORD

# Wait for postgres to accept real connections. On a fresh volume the postgres
# image runs a temporary server for initdb, so pg_isready can report healthy
# while the real server is still restarting — retry instead of dying.
i=0
until psql -h "$PGHOST" -U "$PGUSER" -d postgres -tAc "SELECT 1" >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -gt 90 ]; then
    echo "postgres not ready after 90s" >&2
    exit 1
  fi
  sleep 1
done

for db in keycloak lamba_legacy; do
  exists=$(psql -h "$PGHOST" -U "$PGUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" || echo "")
  if [ "$exists" != "1" ]; then
    psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "CREATE DATABASE ${db};"
    echo "Created database: ${db}"
  fi
done
