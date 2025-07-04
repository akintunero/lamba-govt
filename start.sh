#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

node scripts/generate-openapi.js
node scripts/generate-sbom.js

docker compose -f docker-compose.lite.yml up --build -d

echo "Platform started (lite stack)."
echo "Citizen portal:  http://localhost:3000/portal"
echo "Admin console:   http://localhost:3000/admin"
echo "API gateway:     http://localhost:8080/api"
echo "Keycloak:        http://localhost:8180"
echo "MinIO console:   http://localhost:9001"
