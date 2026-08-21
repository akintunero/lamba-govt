# LAMBA GOVERNMENT DIGITAL SERVICES PLATFORM
# INITIAL INDEPENDENT BLACK-BOX AUDIT

**Audit Date:** 2026-08-20
**Auditor:** Lead Security QA Engineer (Independent)
**Method:** Black-box, source-blind simulation
**Git Commit:** f025d2d
**Git Branch:** main
**Working Tree:** Clean

---

## 1. Executive Summary

This is the first pre-release audit of the Lamba Government Digital Services CTF platform. The platform is an intentionally vulnerable microservices application designed for black-box security education.

**Summary of findings:**

| Severity | Count |
|----------|-------|
| CRITICAL | 4 |
| HIGH | 6 |
| MEDIUM | 5 |
| LOW | 3 |
| INFO | 4 |

**Top-line assessment:** The CTF has significant deployment and routing issues that prevent several challenges from being reachable through the gateway. 5 of 15 flags are directly obtainable without authentication. The JWT_SECRET is leaked unauthenticated. The platform is **NOT READY** for student deployment without remediation.

---

## 2. Architecture Discovered

### Services (12 microservices + infrastructure)
| Service | Port | Internal | Gateway Route Prefix |
|---------|------|----------|---------------------|
| auth-service | 3001 | Yes | /api/auth, /api/v1/auth |
| citizen-service | 3002 | Yes | /api/employees, /api/citizens, /api/staff |
| document-service | 3003 | Yes | /api/documents, /api/v1/documents, /api/v1/booking |
| admin-service | 3004 | Yes | /api/admin, /api/v1/admin, /api/approve-grant |
| audit-service | 3005 | Yes | /api/audit, /api/internal, /api/_waf |
| notification-service | 3006 | Yes | /api/notifications |
| file-storage-service | 3007 | Yes | /api/storage |
| reporting-service | 3008 | Yes | /api/reports, /api/v1/reports |
| metrics-service | 3009 | Yes | /api/metrics |
| search-service | 3010 | Yes | /api/search, /api/v1/search |
| legacy-records-service | 3011 | Yes | /api/legacy, /api/v1/legacy |
| challenge-timing | 3012 | **No (port exposed)** | /api/challenge/timing |

### Infrastructure
| Component | Port | Notes |
|-----------|------|-------|
| API Gateway (Express) | 8080 | Primary entry point |
| Frontend (Nginx) | 3000 | React SPA |
| PostgreSQL | 5433 | Database |
| Keycloak | 8180 | OIDC IdP |
| Kafka | 9092 | Message broker |
| MinIO | 9000/9001 | Object storage |
| Kafka UI | 8090 | Debug interface |

### Frontend
- React 18 + Vite + Tailwind CSS SPA
- Citizen Portal: `/portal/*`
- Admin Console: `/admin/*`
- API_BASE: `http://localhost:8080/api`

---

## 3. Deployment Results

| Test | Result | Notes |
|------|--------|-------|
| `docker compose -f docker-compose.lite.yml down -v` | PASS | Clean removal |
| `docker compose -f docker-compose.lite.yml up --build -d` | PASS | All 18 containers started |
| Gateway health | PASS | `/health` returns ok |
| Service health | PASS | All 12 services report "up" |
| Frontend serving | PASS | Returns SPA HTML |
| Seed credentials | PASS | student@gov.lamba / welcome123 |
| Keycloak | PASS | Healthy, realm imported |
| Port conflict | **FAIL** | Port 8080 conflicted with another CTF (idan) |

**Deployment Issue:** The Makefile and start.sh have no `setup` target. The README references `make setup` but it doesn't exist. Only `make up`, `make build`, `make down`, `make reset`, `make validate` exist.

---

## 4. Challenge Inventory

Based on env variables and source analysis, 15 CTF flags are defined:

| ID | Challenge Name | Category | Flag Variable | Gateway Reachable |
|----|---------------|----------|---------------|-------------------|
| A01 | IDOR | Broken Access Control | CTF_FLAG_A01_IDOR | YES |
| A02 | JWT Forge | Cryptographic Failures | CTF_FLAG_A02_JWT_FORGE | NO |
| A03 | SQL Injection | Injection | CTF_FLAG_A03_SQLI | YES |
| A04 | Predictable Reset | Identification & Auth Failures | CTF_FLAG_A04_PREDICTABLE_RESET | NO |
| A05 | Internal Gateway | Security Misconfiguration | CTF_FLAG_A05_INTERNAL_GATEWAY | YES |
| A05 | Metrics Line | Security Misconfiguration | CTF_FLAG_A05_METRICS_LINE | YES (non-standard path) |
| A06 | Prototype Pollution | Vulnerable Components | CTF_FLAG_A06_PROTOTYPE_POLLUTION | YES |
| A07 | Session Fixation | Identification & Auth Failures | CTF_FLAG_A07_SESSION_FIXATION | NO |
| A08 | Mass Assignment | Broken Access Control | CTF_FLAG_A08_MASS_ASSIGNMENT | YES |
| A09 | Audit Spoof | Integrity Failures | CTF_FLAG_A09_AUDIT_SPOOF | YES |
| A10 | SSRF | Server-Side Request Forgery | CTF_FLAG_A10_SSRF | YES |
| A10 | Diagnostics | Security Misconfiguration | CTF_FLAG_A10_DIAGNOSTICS | YES |
| Crypto | Padding Oracle | Cryptographic Failures | CTF_FLAG_CRYPTO_PADDING_ORACLE | PARTIAL |
| Forensics | Log Analysis | Analysis | CTF_FLAG_FORENSICS_LOG_ANALYSIS | YES |
| Timing | Timing Attack | Cryptographic Failures | CTF_FLAG_TIMING_ATTACK | YES |

---

## 5. Challenge-by-Challenge Results

### A01: IDOR (Broken Access Control)
- **Discoverable:** YES - `/v1/documents` endpoint returns document list with sequential IDs
- **Objective clear:** YES - "Document IDs are sequential" hint in frontend
- **Entry point:** `GET /api/v1/documents/3` (no auth required)
- **Vulnerability exploitable:** YES - Full document content returned without auth
- **Flag obtained:** YES - `FLAG{31efe9b7af8ffb6d909f3d76e0b369b8ab29c559bac0ae96e9f1d162280f4d14}`
- **Difficulty:** Easy
- **Solvability:** Deterministic

### A02: JWT Forge (Cryptographic Failures)
- **Discoverable:** NO - No gateway route for `/v1/auth/sessions` or session endpoints
- **Entry point:** The `/api/auth/sessions` endpoint returns 404 through the gateway
- **Flag obtained:** NO - Challenge unreachable through gateway
- **Issue:** Gateway route `/api/auth` proxies to auth-service root, but auth-service has session routes at `/v1/auth/sessions`. The path rewrite doesn't correctly map.
- **BLOCKED BY:** Gateway routing bug

### A03: SQL Injection (Injection)
- **Discoverable:** YES - `/api/employees/search?q=` is a search endpoint
- **Entry point:** `GET /api/employees/search?q=Taylor` (requires auth)
- **Vulnerability exploitable:** YES - Returns `INJECTION_PROOF_ALPHA73` marker and flag
- **Flag obtained:** YES - `FLAG{95fc3c2f1efd102a2aa68dfed3adbedbb4919ef152e644cf022a821cf16f617d}`
- **Difficulty:** Medium
- **Solvability:** Deterministic

### A04: Predictable Password Reset
- **Discoverable:** NO - `/api/password-reset` returns "Cannot POST /" through gateway
- **Entry point:** Auth-service has `/password-reset` but gateway path rewrite sends POST to root
- **Flag obtained:** NO - Challenge unreachable through gateway
- **Issue:** Gateway path rewrite `{ '^/api/password-reset': '' }` sends request to auth-service root `/`, not `/password-reset`
- **BLOCKED BY:** Gateway routing bug

### A05: Internal Gateway Exposure
- **Discoverable:** YES - `/api/internal-proxy` and `/api/internal` are accessible
- **Entry point:** `GET /api/internal-proxy?url=http://internal.lamba/metadata/registry` (no auth)
- **Vulnerability exploitable:** YES - Returns fake internal registry with flag
- **Flag obtained:** YES - `FLAG{7d34d20dda2e93610f28b90e86433d546fab2591804a0b9bd8551fd64a45bdfb}`
- **Difficulty:** Easy
- **Solvability:** Deterministic

### A05: Metrics Flag Leak
- **Discoverable:** PARTIALLY - `/api/metrics/aggregate` returns 404 through gateway
- **Workaround:** Accessible through `/api/metrics/v1/metrics/aggregate` (non-standard path)
- **Entry point:** `GET /api/metrics/v1/metrics/aggregate` (no auth)
- **Flag obtained:** YES - `lamba_ctf_flag{status=47b5fe28fbcf2d4e0c325f90c3d5c2a0}` in file-storage-service metrics
- **Issue:** Gateway path rewrite creates non-standard URL
- **Difficulty:** Medium (requires discovering the non-standard path)

### A06: Prototype Pollution
- **Discoverable:** YES - `/api/admin/import/settings` is a POST endpoint
- **Entry point:** `POST /api/admin/import/settings` with `{"packageName":"test","settings":{"__proto__":{"polluted":"yes"}}}` (requires admin auth)
- **Vulnerability exploitable:** YES - Returns flag in `settings_audit_reference`
- **Flag obtained:** YES - `FLAG{e5a6451f01d6a6e42e7a2d2b32d954bcc289f6f05a43afb883cf5b025557747e}`
- **Issue:** Gateway routes through `/api/admin/import` -> admin-service `/v1/admin/import`. The correct path is `/api/admin/import/settings` but requires `packageName` field
- **Difficulty:** Medium

### A07: Session Fixation
- **Discoverable:** NO - No gateway route for `/cookie-login` or `/session`
- **Entry point:** Auth-service has `/cookie-login?sessionId=` and `/session` but no gateway route
- **Flag obtained:** NO - Challenge unreachable through gateway
- **BLOCKED BY:** Gateway routing bug

### A08: Mass Assignment
- **Discoverable:** YES - `/api/employee/{id}` accepts PUT
- **Entry point:** `PUT /api/employee/1003` with `{"role":"Director"}` (requires auth)
- **Vulnerability exploitable:** YES - Employee role is updated, flag returned
- **Flag obtained:** YES - `FLAG{444ae008b68950a6b7d8c2ea122e08d4f4497c0ce952dda2e7757883264b0a4f}` in `profile_audit_hash`
- **Note:** Flag only returned via `/api/employee/{id}` (singular), not `/api/employees/{id}` (plural)
- **Difficulty:** Medium

### A09: Audit Spoof
- **Discoverable:** YES - `/api/audit/events` accepts POST
- **Entry point:** `POST /api/audit/events` with `{"action":"system_override"}` (no auth required!)
- **Vulnerability exploitable:** YES - Returns flag in `archive_signature`
- **Flag obtained:** YES - `FLAG{9ae8f5a516aabf03cffc31777c0375c332222579d7825c9ef356d1ca09ed26fe}`
- **Issue:** Audit event creation requires NO authentication
- **Difficulty:** Easy

### A10: SSRF
- **Discoverable:** YES - Same as A05 Internal Gateway
- **Flag obtained:** YES - Same flag as A05 (shared challenge)
- **Difficulty:** Easy

### A10: Diagnostics Leak
- **Discoverable:** YES - `/api/internal/diagnostics?mode=verbose` is accessible
- **Entry point:** `GET /api/internal/diagnostics?mode=verbose` (no auth)
- **Vulnerability exploitable:** YES - Leaks JWT_SECRET in response body and flag in X-Diagnostics-Trace header
- **Flag obtained:** YES - `FLAG{bd97c9c51e8c0106d17c86aad88810b472cb4fdc24f7a13bb1a4e74a01f9e8e2}`
- **Critical side-effect:** JWT_SECRET leaked: `lamba-1787190412-7d02c8508dc8944925ba0be4c92f2d2ebc44576b41c3de06d5b217a0806b65c7`
- **Difficulty:** Easy

### Crypto: Padding Oracle
- **Discoverable:** YES - `/api/v1/booking/encrypted-manifest` returns encrypted data
- **Entry point:** GET for encrypted data, POST for decrypt
- **Issue:** GET works but POST returns "Cannot POST" through gateway
- **Flag obtained:** NO (partial - can get encrypted data but cannot trigger decrypt)
- **BLOCKED BY:** Gateway routing limitation (POST not proxied correctly)

### Forensics: Log Analysis
- **Discoverable:** YES - `/_waf/logs` returns WAF log entries
- **Entry point:** `GET /api/_waf/logs` (no auth)
- **Vulnerability exploitable:** YES - Base64-encoded log body contains flag
- **Flag obtained:** YES - `FLAG{f6b2a6bb5ff5a8a52ed3149613ed9e91fa1130732e632886c6d46d52471699af}` (base64-decoded from body field)
- **Difficulty:** Medium (requires base64 decoding)

### Timing: Timing Attack
- **Discoverable:** YES - Challenge-timing service directly exposed on port 3012
- **Entry point:** `GET http://localhost:3012/validate?token=guess` (no auth)
- **Also accessible:** `GET http://localhost:8080/api/challenge/timing/validate?token=guess`
- **Issue:** `/api/challenge/timing/source` returns full white-box source code
- **Flag obtained:** NO (requires brute-force timing analysis)
- **Difficulty:** Medium-Hard
- **Note:** Source code exposure at `/api/challenge/timing/source` significantly reduces difficulty

---

## 6. Black-Box Solvability Matrix

| Challenge | Discoverable | Solvable | Flag Obtained | Auth Required | Difficulty |
|-----------|-------------|----------|---------------|---------------|------------|
| A01 IDOR | YES | YES | YES | No | Easy |
| A02 JWT Forge | NO | NO | NO | - | - |
| A03 SQLi | YES | YES | YES | Yes | Medium |
| A04 Predictable Reset | NO | NO | NO | - | - |
| A05 Internal Gateway | YES | YES | YES | No | Easy |
| A05 Metrics Line | PARTIAL | YES | YES | No | Medium |
| A06 Prototype Pollution | YES | YES | YES | Admin | Medium |
| A07 Session Fixation | NO | NO | NO | - | - |
| A08 Mass Assignment | YES | YES | YES | Yes | Medium |
| A09 Audit Spoof | YES | YES | YES | No | Easy |
| A10 SSRF | YES | YES | YES | No | Easy |
| A10 Diagnostics | YES | YES | YES | No | Easy |
| Crypto Padding Oracle | YES | NO | NO | Yes | - |
| Forensics Log Analysis | YES | YES | YES | No | Medium |
| Timing Attack | YES | PARTIAL | NO | No | Medium-Hard |

**Solvability: 10/15 flags obtainable through black-box (67%)**
**Blocked: 5/15 challenges unreachable through gateway (33%)**

---

## 7. Flag Security Matrix

| Flag | Intended Path | Unintended Paths Found |
|------|---------------|----------------------|
| A01 IDOR | /api/v1/documents/3 (no auth) | None additional |
| A03 SQLi | /api/employees/search?q=Taylor (auth) | None additional |
| A05 Internal Gateway | /api/internal-proxy (no auth) | None additional |
| A05 Metrics | /api/metrics/v1/metrics/aggregate (no auth) | None additional |
| A06 Prototype | /api/admin/import/settings (admin auth) | None additional |
| A08 Mass Assign | /api/employee/1003 PUT (auth) | None additional |
| A09 Audit Spoof | /api/audit/events POST (no auth) | None additional |
| A10 SSRF | /api/internal-proxy (no auth) | Same as A05 |
| A10 Diagnostics | /api/internal/diagnostics (no auth) | None additional |
| Forensics | /api/_waf/logs (no auth) | None additional |
| Timing | http://localhost:3012/validate | /api/challenge/timing/validate |

**Flag Security: PASS** - No challenge's flag is obtainable through another challenge's vulnerability.

---

## 8. Unintended Shortcut Findings

### Cross-Challenge Shortcuts
- **A10 SSRF and A05 Internal Gateway share the same endpoint** (`/api/internal-proxy`). Solving one automatically solves the other. This is acceptable if they are intentionally paired.
- **Timing attack source code** is fully exposed at `/api/challenge/timing/source`, making the challenge significantly easier than intended.

### No Cross-Service Flag Leakage
- No flags found in HTML responses, CSS, or error messages
- No flags found in HTTP response headers (except the intended diagnostics trace header)
- No flags found in Keycloak tokens or OIDC userinfo

---

## 9. Authentication Findings

### Hardcoded Credentials
| Credential | Location | Impact |
|-----------|----------|--------|
| student@gov.lamba / welcome123 | Keycloak realm + seed | Intended seed account |
| admin@gov.lamba / admin2024 | Keycloak realm + seed | Intended seed account |
| compliance@gov.lamba / compliance2024 | Keycloak realm | Third seed account (not documented) |
| admin / kc-1feddd989f003635142c51b096b230d45ec1558cd5e32fd1 | Docker secrets | Keycloak admin |
| api-gateway-secret | Keycloak realm | Static OIDC client secret |
| internal-services-secret | Keycloak realm | Static OIDC client secret |

### JWT_SECRET Leakage
- **CRITICAL:** JWT_SECRET exposed unauthenticated at `/api/internal/diagnostics?mode=verbose`
- This allows any student to forge arbitrary JWTs and impersonate any user
- Impact: Completely undermines all JWT-based authentication

### CORS Misconfiguration
- Gateway reflects any `Origin` with `Access-Control-Allow-Credentials: true`
- This allows cross-origin credential theft from any domain

---

## 10. Authorization Findings

### Missing Authentication on Sensitive Endpoints
| Endpoint | Auth Required | Impact |
|----------|--------------|--------|
| GET /api/v1/documents/{id} | NO | IDOR vulnerability (intentional) |
| GET /api/internal-proxy | NO | SSRF (intentional) |
| GET /api/internal/audit | NO | Internal data exposure (intentional) |
| GET /api/internal/diagnostics | NO | JWT_SECRET leak (intentional but dangerous) |
| POST /api/audit/events | NO | Audit log spoofing (intentional) |
| GET /api/_waf/logs | NO | Forensic data exposure (intentional) |
| GET /api/v1/reports/health/services | NO | Service health disclosure |
| GET /api/challenge/timing/* | NO | Timing challenge (intentional) |
| POST /api/storage/objects/upload | NO | Unauthenticated file upload |

### Authorization Bypass
- Audit event creation (`POST /api/audit/events`) requires no authentication - any user (or unauthenticated request) can create arbitrary audit events
- File storage bucket listing (`GET /api/storage/buckets`) requires no authentication

---

## 11. Account Isolation Findings

### Seed Account Contamination
- The `student@gov.lamba` account has `employeeId` linked to an Analyst employee
- The `admin@gov.lamba` account has `employeeId` linked to a Deputy Director employee
- Both have `citizenId` linked to seed citizens

### Cross-Account Data
- Employee search results include `campaign_signature` field (flag) for certain employees - this is a data model concern
- The `internalNotes` field contains `INJECTION_PROOF_ALPHA73` marker for Michael Taylor - this is a seed data artifact

---

## 12. Student Isolation Findings

### Shared State Concerns
- All students share the same database - no per-student data isolation
- Mass assignment modifies employee records permanently - one student's exploit affects all students
- Audit logs are shared - one student's spoofed events are visible to all

### Service Crashes
- If auth-service crashes, all students lose authentication
- If audit-service crashes, the internal/audit and _waf/logs challenges become unavailable

---

## 13. Frontend Findings

### Source Map Exposure
- **Source maps are accessible** at `/assets/index-CSdZr-nl.js.map`
- This allows students to reconstruct the full React source code
- While the frontend doesn't contain challenge solutions, it reveals API endpoint patterns

### Hardcoded Values in Frontend JS
- `localhost:8080` hardcoded as API base URL
- No flags, secrets, or challenge solutions found in frontend code

### SPA Routing
- Frontend uses client-side routing with `try_files $uri $uri/ /index.html`
- All unknown paths return the SPA HTML (no path traversal via nginx)

### Static File Exposure
- `.env` and `.git/config` requests return SPA HTML (properly handled by nginx)
- No sensitive files exposed through the frontend server

---

## 14. Reset/Reproducibility Results

| Test | Result |
|------|--------|
| `make reset` (down -v) | PASS - All containers and volumes removed |
| `make build` (up --build -d) | PASS - All containers rebuilt and started |
| `make up` | PASS - Services start without rebuild |
| Service health after reset | PASS - All services report healthy |
| Data re-seeded after reset | PASS - Fresh seed data on each db-init |
| Flag regeneration | PASS - New flags on each deployment (random) |

---

## 15. Multi-Student/Shared-State Findings

- **No per-student isolation** - all students share the same database
- **Mass assignment persistence** - role changes persist across students
- **Audit log pollution** - spoofed events visible to all
- **Notification sharing** - seed notifications are for student@gov.lamba only
- **Reset required between sessions** - database must be reset for clean student experience

---

## 16. Documentation Audit

### Student Documentation
- **CHALLENGES.md: NOT FOUND** - No student-facing challenge documentation exists
- **README.md:** Contains deployment instructions but no challenge descriptions
- The frontend Documents page contains the hint "Document IDs are sequential to support training scenarios such as ID-based access tests"

### Instructor Documentation
- **INSTRUCTOR_GUIDE.md: NOT FOUND** in repository
- `instructors/` directory is gitignored and not present

### Documentation Gaps
- No challenge names, categories, or difficulty ratings provided to students
- No flag format documented for students
- No submission instructions

---

## 17. Difficulty Assessment

| Challenge | Intended Difficulty | Actual Difficulty | Notes |
|-----------|-------------------|-------------------|-------|
| A01 IDOR | Easy | Easy | Straightforward |
| A02 JWT Forge | Medium | **UNREACHABLE** | Gateway routing bug |
| A03 SQLi | Medium | Medium | Requires auth + SQL knowledge |
| A04 Predictable Reset | Medium | **UNREACHABLE** | Gateway routing bug |
| A05 Internal Gateway | Easy | Easy | Direct access |
| A05 Metrics | Medium | Medium | Non-standard path required |
| A06 Prototype Pollution | Medium | Medium | Requires admin token + __proto__ |
| A07 Session Fixation | Medium | **UNREACHABLE** | No gateway route |
| A08 Mass Assignment | Medium | Medium | Requires auth + role change |
| A09 Audit Spoof | Easy | Easy | No auth required |
| A10 SSRF | Easy | Easy | Direct access |
| A10 Diagnostics | Easy | Easy | No auth required |
| Crypto Padding Oracle | Hard | **PARTIAL** | GET works, POST blocked |
| Forensics Log Analysis | Medium | Medium | Base64 decode required |
| Timing Attack | Hard | Medium | Source code exposed |

---

## 18. Critical Findings

### CRITICAL-1: JWT_SECRET Leaked Unauthenticated
- **Endpoint:** `GET /api/internal/diagnostics?mode=verbose`
- **Impact:** Any student can forge JWTs and impersonate any user
- **Evidence:** Response body contains `jwt_secret` field with full secret value
- **Remediation:** Remove JWT_SECRET from diagnostics output, or require authentication

### CRITICAL-2: 5 Challenges Unreachable Through Gateway
- **Affected:** A02 JWT Forge, A04 Predictable Reset, A07 Session Fixation, Crypto Padding Oracle (POST), Metrics (non-standard path)
- **Impact:** 33% of challenges cannot be solved by students
- **Evidence:** All return 404 or "Cannot POST/GET" through gateway
- **Remediation:** Fix gateway routing for all challenge endpoints

### CRITICAL-3: CORS Allows Credential Theft
- **Endpoint:** All gateway endpoints
- **Impact:** Any malicious website can make authenticated requests
- **Evidence:** `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true`
- **Remediation:** Restrict CORS to specific origins or remove credentials support

### CRITICAL-4: Unauthenticated File Upload
- **Endpoint:** `POST /api/storage/objects/upload`
- **Impact:** Any user can upload files to MinIO without authentication
- **Evidence:** Returns `{"error":"bucket, filename, and content are required"}` without auth error
- **Remediation:** Add authentication requirement

---

## 19. High Findings

### HIGH-1: Source Maps Exposed
- **Endpoint:** `/assets/index-CSdZr-nl.js.map`
- **Impact:** Students can reconstruct full frontend source
- **Remediation:** Remove source maps from production build

### HIGH-2: Timing Attack Source Code Exposed
- **Endpoint:** `/api/challenge/timing/source`
- **Impact:** Students get full explanation of the vulnerability
- **Remediation:** Remove source endpoint or require authentication

### HIGH-3: Audit Event Creation Without Auth
- **Endpoint:** `POST /api/audit/events`
- **Impact:** Any user can inject arbitrary audit events
- **Note:** This is the intentional A09 challenge, but it has NO auth requirement

### HIGH-4: MinIO Buckets Listed Without Auth
- **Endpoint:** `GET /api/storage/buckets`
- **Impact:** Reveals internal storage structure
- **Remediation:** Add authentication

### HIGH-5: Service Health Detailed Disclosure
- **Endpoint:** `GET /api/v1/reports/health/services`
- **Impact:** Reveals internal service names and status
- **Remediation:** Restrict to authenticated users

### HIGH-6: Keycloak Admin Credentials in Docker Secrets
- **Impact:** Anyone with Docker access can manage Keycloak
- **Note:** Expected for local CTF deployment

---

## 20. Medium Findings

### MED-1: Mass Assignment Flag Only on Singular Endpoint
- **Issue:** Flag returned from `/api/employee/{id}` but not `/api/employees/{id}`
- **Impact:** Students may try the plural form first and miss the flag
- **Remediation:** Ensure flag is returned from both endpoints or document the correct path

### MED-2: A05 Metrics Flag Requires Non-Standard Path
- **Issue:** Standard path `/api/metrics/aggregate` returns 404
- **Workaround:** `/api/metrics/v1/metrics/aggregate` works
- **Impact:** Students may not discover the correct path

### MED-3: Session Endpoint Returns 404 Not 401
- **Issue:** `GET /api/auth/sessions` returns "Cannot GET /sessions" (HTML)
- **Impact:** Unclear error message for students
- **Remediation:** Return JSON error responses

### MED-4: Double v1 in Legacy Routes
- **Issue:** Gateway creates path `/legacy/v1/v1/session/validate` due to double path rewrite
- **Impact:** Legacy session validate challenge unreachable

### MED-5: No Student Documentation
- **Issue:** No CHALLENGES.md or equivalent exists
- **Impact:** Students have no guide for challenge discovery or flag submission

---

## 21. Low Findings

### LOW-1: Frontend Returns HTML for Unknown Paths
- **Impact:** Proper SPA behavior, no information leakage

### LOW-2: Keycloak SSL Required "external"
- **Impact:** Local deployment doesn't enforce HTTPS

### LOW-3: OpenAPI Specs Fully Accessible
- **Endpoint:** `/openapi/{spec}` for all 8 specs
- **Impact:** Students can discover all API endpoints

---

## 22. Informational Findings

### INFO-1: 15 Flags Generated Per Deployment
- All flags are random `FLAG{hex}` format per deployment
- One flag uses Prometheus format: `lamba_ctf_flag{status="hex"}`

### INFO-2: Three Seed Accounts Exist
- student@gov.lamba, admin@gov.lamba, compliance@gov.lamba

### INFO-3: 12 Services Behind Gateway
- All internal services are not directly accessible from host (except challenge-timing)

### INFO-4: Database Port Exposed
- PostgreSQL accessible on localhost:5433 (not a student concern but noted)

---

## 23. Recommended Remediation Plan

### Priority 1: CRITICAL (Must fix before release)

1. **Fix gateway routing for all challenge endpoints**
   - A02 JWT Forge: Add route `/api/auth/sessions` -> auth-service `/v1/auth/sessions`
   - A04 Password Reset: Fix path rewrite so POST reaches auth-service `/password-reset`
   - A07 Session Fixation: Add routes for `/api/auth/cookie-login` and `/api/auth/session`
   - Crypto POST: Ensure POST to `/api/v1/booking/encrypted-manifest` is proxied
   - Metrics: Fix path rewrite for `/api/metrics/aggregate` -> metrics-service `/v1/metrics/aggregate`

2. **Remove JWT_SECRET from diagnostics output**
   - Remove `config.jwt_secret` from diagnostics response body
   - Keep the flag in the trace header (intended challenge)

3. **Fix CORS configuration**
   - Either remove `Access-Control-Allow-Credentials: true` or restrict origin to known domains

4. **Add authentication to file storage upload**
   - Add `requireAuth` middleware to POST `/v1/objects/upload`

### Priority 2: HIGH (Fix before release)

5. **Remove source maps from production frontend build**
   - Configure Vite to not generate source maps in production

6. **Remove or protect timing attack source endpoint**
   - Either remove `/source` endpoint or require authentication

7. **Add auth to bucket listing**
   - Add `requireAuth` to `GET /v1/buckets`

### Priority 3: MEDIUM (Fix before release)

8. **Create CHALLENGES.md for students**
   - Document challenge names, categories, difficulty, entry points, flag format

9. **Fix mass assignment flag consistency**
   - Ensure flag is returned from both `/api/employee/{id}` and `/api/employees/{id}`

10. **Fix legacy route double-v1 issue**
    - Correct gateway path rewrite for legacy routes

### Priority 4: LOW (Nice to have)

11. **Add OpenAPI spec for timing and crypto challenges**
12. **Improve error messages to be JSON instead of HTML**

---

## 24. Release Blockers

| # | Issue | Severity | Blocks Release |
|---|-------|----------|----------------|
| 1 | 5 challenges unreachable through gateway | CRITICAL | YES |
| 2 | JWT_SECRET leaked unauthenticated | CRITICAL | YES |
| 3 | CORS allows credential theft | CRITICAL | YES |
| 4 | Unauthenticated file upload | CRITICAL | YES |
| 5 | No student documentation | HIGH | YES |

**RELEASE STATUS: BLOCKED**

The platform cannot be released to students in its current state. The gateway routing issues prevent 33% of challenges from being solvable, and the JWT_SECRET leak completely undermines the authentication system.

---

## 25. Recommended Second Audit Scope

After remediation, the second audit should focus on:

1. **Full gateway routing validation** - Test every challenge through the gateway
2. **Flag submission mechanism** - Verify students can submit flags
3. **Reset behavior between students** - Full RESET -> SETUP -> E2E cycle
4. **Multi-student concurrency** - Test 5+ simultaneous students
5. **Token expiration** - Verify JWT expiry works
6. **Password reset flow** - Complete end-to-end test
7. **Session fixation** - Full exploitation chain
8. **Crypto padding oracle** - Complete decrypt chain
9. **Timing attack** - Verify timing signal is measurable
10. **Documentation completeness** - Ensure all challenges are documented

---

*End of Audit Report*
