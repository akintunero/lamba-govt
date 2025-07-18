#!/bin/sh
set -eu

PGHOST="${PGHOST:-db}"
PGUSER="${PGUSER:-lamba}"
PGPASSWORD="${PGPASSWORD:-lamba}"

export PGPASSWORD

for db in keycloak lamba_legacy; do
  exists=$(psql -h "$PGHOST" -U "$PGUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" || echo "")
  if [ "$exists" != "1" ]; then
    psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "CREATE DATABASE ${db};"
    echo "Created database: ${db}"
  fi
done
