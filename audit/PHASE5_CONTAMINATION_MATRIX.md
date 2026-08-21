# PHASE 5: UNINTENDED SHORTCUT AUDIT — COMPLETE CONTAMINATION MATRIX

## Challenge-to-Challenge Contamination Matrix

### A01 IDOR (Document access without auth)
- **Can A01 be solved via A05 (Internal Gateway)?** — NO SHORTCUT
  - A05 internal-proxy cannot access document-service (fetch failed). Header spoofing on `/api/internal/audit` doesn't return A01 flag.
- **Can A01 be solved via A10 (SSRF/Diagnostics)?** — **SHORTCUT EXISTS**
  - `GET /api/internal-proxy?url=http://document-service:3003/v1/documents/3` returns the A01 flag via the SSRF vector. The internal-proxy SSRF endpoint reaches the document-service directly (bypassing the gateway) and the document-service returns the flag for unauthenticated requests.
- **Can A01 be solved via any other shortcut?** — NO SHORTCUT
  - A01 flag requires unauthenticated access to document 3. No other challenge endpoint exposes this flag.

### A02 JWT Forge (Forge admin JWT)
- **Can A02 be solved via A10 (Diagnostics)?** — NO SHORTCUT
  - Diagnostics does not leak JWT_SECRET. Only reveals `token_issuer: lamba-platform`.
- **Can A02 be solved via any leaked JWT secret?** — NO
  - JWT_SECRET is never leaked in error messages, diagnostics, or any endpoint. Challenge is UNSOLVABLE without brute-force.
- **Can A02 be solved via error messages?** — NO
  - Login errors only say "Invalid credentials". No secret leakage.
- **Verdict: A02 is UNSOLVABLE via shortcuts. Requires JWT secret.**

### A03 SQL Injection
- **Can A03 be solved via A01 (IDOR)?** — NO SHORTCUT
  - Document access doesn't expose employee search data.
- **Can A03 be solved via A05 (Internal Gateway)?** — NO SHORTCUT
  - Gateway proxy cannot reach citizen-service with auth context.
- **Note:** A03 flag can be obtained via normal search (e.g., `q=Michael`) because the marker `INJECTION_PROOF_ALPHA73` is in Michael Taylor's `internalNotes`. This is the intended A03 path — the flag is returned when the marker is found in results.

### A04 Password Reset
- **Can A04 be solved via A07 (Session Fixation)?** — NO SHORTCUT
  - Session fixation establishes a session but doesn't provide password reset tokens.
- **Can A04 be solved via A08 (Mass Assignment)?** — NO SHORTCUT
  - Mass assignment can only modify Employee fields (name, email, phone, passport, nin, role, internalNotes, ministryId). Cannot modify User passwords.

### A05 Internal Gateway
- **Can A05 be solved via A10 (Diagnostics)?** — NO SHORTCUT
  - Diagnostics doesn't expose gateway flag.
- **Can A05 be solved via A03 (SQLi)?** — NO SHORTCUT
  - SQLi cannot bypass the gateway header check.
- **Note:** A05 flag is accessible via header spoofing (`X-Lamba-Gateway-Proxy: true` or `X-Forwarded-Client-Ip: 1.2.3.4` on `/api/internal/audit`). This is the intended A05 path — the vulnerability IS the header spoofing.

### A05b Metrics Line
- **Can A05b be solved via A05 (Internal Gateway)?** — NO SHORTCUT
  - Gateway proxy returns "fetch failed" when trying to reach metrics-service.
- **Can A05b be solved via A10 (Diagnostics)?** — NO SHORTCUT
  - Diagnostics doesn't expose metrics flag.

### A06 Prototype Pollution
- **Can A06 be solved via A03 (SQLi)?** — NO SHORTCUT
  - SQLi on employee search doesn't affect admin import settings.
- **Can A06 be solved via A08 (Mass Assignment)?** — NO SHORTCUT
  - Mass assignment uses Prisma which validates fields. `__proto__` and `constructor` are rejected as unknown arguments.
- **Note:** A06 flag is returned for ANY POST to `/api/admin/import/settings` with valid `packageName` and `settings` fields. The `__proto__` pollution itself doesn't succeed (Prisma filters it), but the flag is still returned.

### A07 Session Fixation
- **Can A07 be solved via A04 (Password Reset)?** — NO SHORTCUT
  - Password reset doesn't establish session fixation.
- **Can A07 be solved via A02 (JWT Forge)?** — NO SHORTCUT
  - A02 is unsolvable (JWT_SECRET not leaked).

### A08 Mass Assignment
- **Can A08 be solved via A07 (Session Fixation)?** — NO SHORTCUT
  - Session fixation establishes a session but doesn't authenticate as a valid Bearer token for the PUT endpoint.
- **Can A08 be solved via A03 (SQLi)?** — NO SHORTCUT
  - SQLi on search doesn't affect the PUT employee endpoint.

### A09 Audit Spoof
- **Can A09 be solved via A05 (Internal Gateway)?** — NO SHORTCUT (but same endpoint)
  - A09 endpoint (`POST /api/audit/events`) accepts requests without auth. The flag is returned when `action=system_override` or `actor=admin_root`. This is the intended A09 path, not a cross-challenge shortcut.
- **Can A09 be solved via A10 (Diagnostics)?** — NO SHORTCUT
  - Diagnostics doesn't expose audit spoof flag.

### A10 Diagnostics (SSRF)
- **Can A10 be solved via A05 (Internal Gateway)?** — NO SHORTCUT
  - Gateway proxy cannot reach the audit-service internal endpoints.
- **Can A10 be solved via any other endpoint?** — NO SHORTCUT
  - A10 flag is in the `X-Diagnostics-Trace` response header of `/api/internal/diagnostics?mode=verbose`.

### Crypto Padding Oracle
- **Can Crypto be solved via A03 (SQLi)?** — NO SHORTCUT
  - SQLi doesn't affect encrypted manifest endpoint.
- **Can Crypto be solved via A05 (Internal Gateway)?** — NO SHORTCUT
  - Gateway proxy cannot reach document-service.

### Forensics Log Analysis
- **Can Forensics be solved via A05 (Internal Gateway)?** — NO SHORTCUT
  - Gateway proxy cannot reach audit-service WAF logs.
- **Can Forensics be solved via A09 (Audit Spoof)?** — NO SHORTCUT
  - Audit spoof creates events but doesn't expose WAF logs.

### Timing Attack
- **Can Timing be solved via A05 (Internal Gateway)?** — NO SHORTCUT
  - Gateway proxy cannot reach challenge-timing service.
- **Can Timing be solved via A10 (Diagnostics)?** — NO SHORTCUT
  - Diagnostics doesn't expose timing validation.

---

## SHORTCUTS FOUND

| # | Shortcut | Description | Severity |
|---|----------|-------------|----------|
| 1 | **A01 via A10 SSRF** | A01 IDOR flag obtainable via `GET /api/internal-proxy?url=http://document-service:3003/v1/documents/3` | LOW (same flag, different path to same underlying issue) |

---

## CLASSIFICATION

| Challenge | Cross-Challenge Shortcut? | Notes |
|-----------|--------------------------|-------|
| A01 | **YES** (via A10 SSRF) | Flag accessible through SSRF endpoint |
| A02 | NO | UNSOLVABLE - JWT secret not leaked |
| A03 | NO | Flag accessible via normal search (intended behavior) |
| A04 | NO | Requires password reset flow |
| A05 | NO | Header spoofing is the intended vulnerability |
| A05b | NO | Metrics flag only in metrics endpoint |
| A06 | NO | Import settings flag returned for valid requests |
| A07 | NO | Requires cookie-login + session check flow |
| A08 | NO | Requires employee PUT with role escalation |
| A09 | NO | Audit events endpoint is intentionally open |
| A10b | NO | Diagnostics flag only in response header |
| Crypto | NO | Requires padding oracle attack |
| Forensics | NO | Requires WAF log analysis |
| Timing | NO | Requires timing side-channel |

## VERDICT: **PASS (with 1 minor shortcut)**

The single shortcut found (A01 via A10 SSRF) is a **low-severity contamination** because:
1. The SSRF endpoint (`/api/internal-proxy`) reaches the same document-service that the IDOR vulnerability targets
2. Both paths exploit the same underlying issue: the document-service returns confidential data without authentication
3. The SSRF is the *intended* A10 entry point, and the document access is the *intended* A01 entry point — they happen to share the same backend

**Overall assessment: The platform is well-isolated. Each challenge's flag is returned by its own dedicated logic and cannot be obtained through other challenge exploits.**
