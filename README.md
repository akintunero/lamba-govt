# Lamba Government Digital Services CTF

Black-box web application security CTF. All challenges are solvable through the public interface only — no source code or backend access is needed or allowed.

## Quick Start

| Service          | URL                          |
|------------------|------------------------------|
| Citizen portal   | http://localhost:3000/portal |
| Admin console    | http://localhost:3000/admin  |
| API gateway      | http://localhost:8080/api    |

No credentials are provided. Discover or create accounts as needed.

See `CHALLENGES.md` for the list of challenges, hints, and entry points.

## Flag Format

`FLAG{64-character-hex-string}`

Flags are generated per deployment and rotate on reset.

## Rules

- Black-box only. Do not use source code, Docker, database, or internal ports.
- Only target the provided environment.
- Report broken challenges or issues with endpoint + request details (no flags).

## Start / Stop

```bash
make up
make down
make reset   # full clean reset (new flags)
```

## Reporting Issues

Report broken challenges with endpoint, method, and sanitized request/response (no actual flags).
