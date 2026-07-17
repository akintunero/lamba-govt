#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "[*] Starting Lamba Government Platform..."
echo "[*] Secrets will be auto-generated inside Docker."

docker compose -f docker-compose.lite.yml up --build -d

echo ""
echo "============================================"
echo "  Lamba Government Platform started"
echo "============================================"
echo "  Citizen portal:  http://localhost:3000/portal"
echo "  Admin console:   http://localhost:3000/admin"
echo "  API gateway:     http://localhost:8080/api"
echo "  Keycloak:        http://localhost:8180"
echo "  MinIO console:   http://localhost:9001"
echo ""
echo "  Seed credentials printed by secret-init container."
echo "  Run: docker logs lamba-secret-init"
echo "============================================"
