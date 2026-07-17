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

11 microservices behind an API gateway, PostgreSQL, MinIO, Kafka, Keycloak.

## Disclaimer

This platform contains intentional security vulnerabilities for educational purposes.  
Do not deploy to production. Do not expose to the internet. Run locally only.
