# Lamba Government Digital Services Platform

**Educational black-box CTF training environment.**  
This platform is intentionally vulnerable for security education purposes.  
All services run locally in Docker — nothing is exposed to the internet.

## Requirements

- Docker & Docker Compose
- Minimum 8GB RAM

## Quick Start

```bash
bash start.sh
```

Alternatively:

```bash
docker compose -f docker-compose.lite.yml up --build -d
```

## Access

| Service | URL |
|---------|-----|
| Citizen portal | http://localhost:3000/portal |
| Admin console | http://localhost:3000/admin |
| API gateway | http://localhost:8080/api |

## Credentials

```bash
docker logs lamba-secret-init
```

## Architecture

12 microservices behind an API gateway, PostgreSQL, MinIO, Kafka, Keycloak.

## Challenges

15 intentional vulnerabilities. Student-facing descriptions live in `CHALLENGES.md`
(distribute it out-of-band; it is not served by the platform).

## Verification

Black-box E2E suite (instructor use) — exploits every challenge through the
public gateway and validates flags, account isolation, and flag-leak hygiene:

```bash
make test        # or: bash scripts/e2e-ctf-test.sh
```

Requires `curl`, `jq`, `python3` (stdlib only). Exits non-zero if any check fails.
See `audit/FINAL_BLACKBOX_AUDIT.md` for the latest release assessment.

## Disclaimer

This platform contains intentional security vulnerabilities for educational purposes.  
Do not deploy to production. Do not expose to the internet. Run locally only.
