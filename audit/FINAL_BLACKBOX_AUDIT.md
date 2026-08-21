# LAMBA GOVERNMENT DIGITAL SERVICES PLATFORM
# FINAL BLACK-BOX AUDIT REPORT (POST-REMEDIATION)

**Audit Date:** 2026-08-21
**Auditor:** Remediation Engineer (fix + independent verification)
**Method:** Black-box over public HTTP gateway only (no source access, no DB access, no internal ports, no container access during testing)
**Git Branch:** main (f025d2d + remediation working tree)
**Stack:** docker-compose.lite.yml, 18 containers

---

## 1. Executive Verdict

**FINAL VERDICT: STUDENT READY**

All three release blockers from the independent audit are fixed and verified black-box:

| Blocker | Status |
|---------|--------|
| A02 JWT Forge unsolvable (secret not leaked) | FIXED — `jwt_secret` intentionally exposed via diagnostics; forge flow verified end-to-end |
| Timing Attack unreliable (ns-scale signal) | FIXED — ms-scale per-character oracle (80ms/char), 10-hex-char token, full recovery verified over HTTP in every cycle |
| No automated E2E test suite | FIXED — `scripts/e2e-ctf-test.sh` verifies all 15 named challenges + isolation + leak regression, stdlib-only |

All 15 challenges are intentionally exploitable through `http://localhost:8080` with HTTP only. 3/3 clean reset cycles pass with fully rotated secrets and flags.

---

## 2. Environment Baseline

- Docker Desktop (server 29.6.2 → 29.7.2 during the engagement; the daemon hung twice after host sleep and was restarted — no data loss, named volumes persisted)
- 18 containers: 12 app microservices, api-gateway (8080), frontend (3000), postgres (5433), keycloak (8180), minio (9000/9001), kafka (9092)
- All 12 services report `up` via `GET /api/health/services` on every cycle
- Secrets and flags are generated per-deployment by `secret-init` into a shared volume; seed credentials fixed (`student@gov.lamba/welcome123`, `admin@gov.lamba/admin2024`)
- Host-published infra ports exist for lab operation (see §10)

## 3. Challenge Inventory

| # | Challenge | Flag Channel | Auth |
|---|-----------|--------------|------|
| A01 | IDOR | `GET /api/v1/documents/3` body | No |
| A02 | JWT Forge | `X-Admin-Audit-Trace` header on forged-admin request | Forged |
| A03 | SQL Injection | `campaign_signature` in employee search | Yes |
| A04 | Predictable Password Reset | `reset_audit_reference` on confirm | No |
| A05 | Internal Gateway Exposure | `logs[0].internal_route_id` at `/api/internal/audit` | No |
| A05b | Metrics Flag Leak | `lamba_ctf_flag{...}` in `/api/metrics/aggregate` | No |
| A06 | Prototype Pollution | `settings_audit_reference` | Admin |
| A07 | Session Fixation | `session_trace_id` | No |
| A08 | Mass Assignment | `profile_audit_hash` | Yes |
| A09 | Audit Spoof | `archive_signature` | No |
| A10 | SSRF | `K8S_NODE_DEBUG_KEY` via `/api/internal-proxy` | No |
| A10b | Diagnostics Leak | `X-Diagnostics-Trace` header | No |
| Crypto | Padding Oracle | `flag` on decrypt POST | No |
| Forensics | Log Analysis | base64 WAF log body | No |
| Timing | Timing Attack | `flag` on exact token match | No |

**Total: 15 challenges** (A05/A05b and A10/A10b counted separately).

## 4. Challenge-by-Challenge Results (Cycle 3, 2026-08-21T12:54Z)

| Challenge | Result | Deterministic |
|-----------|--------|---------------|
| A01 IDOR | PASS | Yes |
| A02 JWT Forge | PASS | Yes |
| A03 SQL Injection | PASS | Yes |
| A04 Password Reset | PASS | Yes (per-hour token) |
| A05 Internal Gateway | PASS | Yes |
| A05b Metrics | PASS | Yes |
| A06 Prototype Pollution | PASS | Yes |
| A07 Session Fixation | PASS | Yes |
| A08 Mass Assignment | PASS | Yes |
| A09 Audit Spoof | PASS | Yes |
| A10 SSRF | PASS | Yes |
| A10b Diagnostics | PASS | Yes |
| Crypto Padding Oracle | PASS | Yes |
| Forensics Log Analysis | PASS | Yes |
| Timing Attack | PASS | Statistical (80ms/char vs ~70ms jitter; median-of-3 per candidate + cluster-separation gate; recovered 10/10 chars every run) |

## 5. A02 JWT Forge Evidence

1. `GET /api/internal/diagnostics?mode=verbose` → HTTP 500 with body `config.jwt_secret` = the platform's legacy HS256 signing secret (**intended leak**; only `jwt_secret`, `token_issuer`, `service_version` present — no MinIO/Keycloak/DB/Kafka/flag values)
2. Student login → legitimate token; claims decoded
3. Same claims + `role:"admin"`, re-signed HS256 with the leaked secret
4. `GET /api/employees/search?q=test` with forged token → `X-Admin-Audit-Trace: FLAG{…}` (A02 flag)
5. Negative checks: wrong-secret signature → rejected (no flag); garbage token → rejected; normal student token → no flag (no accidental auto-admin)

Secret strengthening was intentionally NOT performed — the weak secret is the challenge.

## 6. Timing Attack Evidence

- Oracle: `GET /api/challenge/timing/validate?token=…` — each correct leading character adds ~80ms server-side delay; response carries `elapsed_ns`; exact 10-char hex token match returns `valid:true` + flag
- Measured on cycle-3 deployment (fresh secret `478ec1cfe1`, recovered blind): per-position separation ≈ 80ms at every position (e.g. pos0: 81ms vs 1ms cluster; pos9: 801ms vs 721ms cluster); full recovery in ~200s over HTTP through the gateway
- Wall-clock corroboration each cycle: baseline 16–240ms vs full-token 481–1330ms
- The token is never exposed by the endpoint; only `valid`/`elapsed_ns`/`message` (+ `flag` on exact match)

## 7. E2E Test Results

`scripts/e2e-ctf-test.sh` — black-box, stdlib-only (curl/jq/python3), no source imports, no DB access, no internal ports. 33 checks: 15 challenge flows + auth negatives + idempotency restore + account isolation + leak regression + readiness gate.

| Run | Deployment | Result |
|-----|-----------|--------|
| 2026-08-21T00:01Z | pre-reset | 33/33 PASS |
| 2026-08-21T00:25Z | pre-reset (post A05/A10 remap) | 33/33 PASS |
| 2026-08-21T03:09Z | cycle 1 fresh | 33/33 PASS |
| 2026-08-21T03:27Z | cycle 2 fresh | 33/33 PASS |
| 2026-08-21T12:54Z | cycle 3 fresh | 33/33 PASS |

## 8. Account Isolation

Fresh `alice_<ts>@test.ctf` / `bob_<ts>@test.ctf` every run: distinct identities (unique `userId`, matching email claims), cross-user reads blocked/empty, no seeded/demo identity leakage, no hardcoded identity in responses. PASS on all cycles. A02 forge grants the challenge flag via header only; it does not become a generic account-takeover primitive (forged claims map to the caller's own identity; `isForgedAdminLegacyToken` gates the flag header).

## 9. Flag Leak Audit

~50 surfaces scanned (frontend HTML/JS/CSS + `.map` probes, robots.txt, sitemap, error pages, `/health`, `/api/health/services`, non-verbose diagnostics, `/api/metrics`, 8 OpenAPI specs, `/api/v0`–`v3`, path-traversal and encoded-traversal probes, `/.env`, `/.git/*`, `/secrets/.env`, config/env/debug guesses, `_waf` console, response headers, cookies).

- **Unintended leaks: 0**
- Frontend 200s for `/.env`, `/.git/config`, `/audit/*` are byte-identical SPA `index.html` fallbacks (MD5-verified) — no content leak
- Cookies: only `sessionId`, no flags
- All 8 intended flag channels confirmed live and only where expected (§3)
- A02's leaked JWT secret is not a flag and reveals no other flag or secret

## 10. Student Isolation

- Gateway probes for `.env`, `.git`, source files, Dockerfiles, compose files, solution scripts, audit reports → 404/400
- Traversal (`..`, `%2e%2e`) → 404/400
- `challenge-timing:3012` no longer host-published in either compose file — reachable only via the gateway (aligns with the "no internal ports" rule; challenge unchanged)
- Host-published infra (postgres 5433, keycloak 8180, minio 9000/9001, kafka 9092) remains for lab operation; Keycloak must stay host-reachable for the browser OIDC flow. Accepted lab posture; CTF rules prohibit student use.

## 11. Instructor Isolation

`audit/*.md` (including this report and prior audit files with flags/credentials) are not served by the gateway or frontend (404 / SPA fallback). `CHALLENGES.md` is distributed out-of-band and is not served. PASS.

## 12. Reset Reproducibility

| Cycle | Boot | Suite | Isolation | Leaks |
|-------|------|-------|-----------|-------|
| 1 | clean (all 12 up) | 33/33 | PASS | 0 |
| 2 | clean | 33/33 | PASS | 0 |
| 3 | clean (after fixes below) | 33/33 | PASS | 0 |

Flags rotate per cycle (e.g. A01: `9a6f589c…` → `32afd1b3…` → `69001044…` → `c7c2b33f…`), proving dynamic generation and that the suite asserts on exploit output, not stored values.

Boot reliability fixes applied during cycle 3 (real defects found by the reset process):
- `platform/db/init-databases.sh`: wait-for-postgres loop — fresh `down -v` boots raced postgres's initdb temporary-server restart (pg_isready healthy → connection refused → exit 2)
- `platform/kafka/init-topics.sh` + compose: kafka-init no longer gated on a healthcheck whose `--list` probe (39s under KRaft leadership-election load) exceeds its 10s timeout; init script now waits for broker metadata and retries topic creation. Kafka healthcheck relaxed to informational (timeout 60s, start_period 180s)

## 13. Security Regression Results

- CORS remains origin-restricted (no reflection of arbitrary origins)
- File storage still requires auth
- Timing `/source` endpoint removed with the oracle rewrite (source no longer served at all)
- Source maps disabled in new frontend builds
- A03 flag now requires injection syntax — the marker row is reachable via broad plain search, so previously `q=` leaked the flag without injection; fixed and covered by a negative test. The SQLi itself (`$queryRawUnsafe`) is untouched
- A04 confirm consumes single-use tokens; the suite restores the admin password via the same exploit so repeat runs stay green
- `platform/common/kafka.js`: `publishEventSafe` races a 2s timeout — a sick broker can no longer hang login (observed 30s login hangs during Kafka leadership elections; now ≤ ~3s worst case). Event delivery semantics unchanged
- No intended vulnerability removed or weakened

## 14. Remaining Findings

Non-blocking (none affect challenge exploitability):

| # | Item | Severity | Note |
|---|------|----------|------|
| 1 | Host-published infra ports | LOW | Accepted lab posture; Keycloak required for OIDC browser flow |
| 2 | Gateway `/health` exposes version string | LOW | Optional hardening |
| 3 | No `Cache-Control: no-store` on sensitive responses | LOW | Optional hardening |
| 4 | Kafka single-node KRaft slow to elect under host load | INFO | Boot now self-heals (§12); HTTP paths unaffected (non-blocking publish) |
| 5 | Sequential DB IDs | INFO | Not exploitable beyond intended A01 |

## 15. Final Release Decision

| Criterion | Status |
|-----------|--------|
| A01–A10b, Crypto, Forensics, Timing (15/15) | PASS |
| Automated E2E tests pass | PASS (33/33 × 5 consecutive runs) |
| Account isolation | PASS |
| 0 unintended flag leaks | PASS |
| Student isolation | PASS |
| Instructor isolation | PASS |
| 3/3 reset cycles | PASS |
| No challenge requires source code | PASS |
| No challenge requires privileged infrastructure | PASS |
| No intended vulnerability removed | PASS |

**FINAL VERDICT: STUDENT READY**

---

*End of Final Black-Box Audit Report*
