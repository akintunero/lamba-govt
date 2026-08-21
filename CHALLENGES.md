# Lamba Digital Services — Security Challenges

Welcome to the Lamba Government Digital Services Platform security training.

This platform contains **15 intentional vulnerabilities** across 12 microservices.
Your goal: discover each vulnerability and extract the hidden flag (`FLAG{...}`).

## Getting Started

1. Open http://localhost:8080/api in your browser
2. Login with `student@gov.lamba / welcome123`
3. Explore the platform — use your browser, curl, or any HTTP tool
4. Look for flags in unexpected places

## Flag Format

All flags follow the format: `FLAG{64-character-hex-string}`

## Challenges

### A01 — IDOR (Broken Access Control)
- **Difficulty:** Easy
- **Hint:** The Documents page mentions sequential IDs. What happens if you access a document by its ID directly?
- **Entry point:** `GET /api/v1/documents/{id}`

### A02 — JWT Forge (Cryptographic Failures)
- **Difficulty:** Medium
- **Hint:** The platform signs its legacy tokens with a weak symmetric secret. Somewhere in the diagnostics output, a configuration value that should never be published is exposed. Find it, then modify your token's claims and re-sign it.
- **Entry point:** Inspect `GET /api/internal/diagnostics?mode=verbose` closely, then forge a JWT with `role: "admin"` and call an endpoint that checks privileges

### A03 — SQL Injection (Injection)
- **Difficulty:** Medium
- **Hint:** The employee search feature takes user input. What happens when you send unexpected characters?
- **Entry point:** `GET /api/employees/search?q=...` (requires login)

### A04 — Predictable Password Reset (Identification & Auth Failures)
- **Difficulty:** Medium
- **Hint:** Request a password reset and examine the token carefully. How is it generated?
- **Entry point:** `POST /api/v1/auth/password-reset/request`

### A05 — Internal Gateway Exposure (Security Misconfiguration)
- **Difficulty:** Easy
- **Hint:** Some internal endpoints may be exposed through the gateway. Try common internal paths.
- **Entry point:** `GET /api/internal/audit`

### A05b — Metrics Flag Leak (Security Misconfiguration)
- **Difficulty:** Medium
- **Hint:** Metrics endpoints expose service data. What other services report their status?
- **Entry point:** `GET /api/metrics/aggregate`

### A06 — Prototype Pollution (Vulnerable Components)
- **Difficulty:** Medium
- **Hint:** The admin import settings endpoint processes JSON. What happens with special property names?
- **Entry point:** `POST /api/admin/import/settings` (requires admin login)

### A07 — Session Fixation (Identification & Auth Failures)
- **Difficulty:** Medium
- **Hint:** The cookie login flow sets a session cookie. What if you force a specific session ID?
- **Entry point:** `POST /api/auth/cookie-login?sessionId=...`

### A08 — Mass Assignment (Broken Access Control)
- **Difficulty:** Medium
- **Hint:** The employee update endpoint accepts role changes. What roles can you assign?
- **Entry point:** `PUT /api/employee/{id}` (requires login)

### A09 — Audit Spoof (Integrity Failures)
- **Difficulty:** Easy
- **Hint:** The audit event creation endpoint may not validate who is creating events.
- **Entry point:** `POST /api/audit/events`

### A10 — SSRF (Server-Side Request Forgery)
- **Difficulty:** Easy
- **Hint:** Some endpoints fetch data from URLs you provide. What internal URLs exist?
- **Entry point:** `GET /api/internal-proxy?url=...`

### A10b — Diagnostics Leak (Security Misconfiguration)
- **Difficulty:** Easy
- **Hint:** Diagnostic endpoints may expose sensitive configuration data.
- **Entry point:** `GET /api/internal/diagnostics?mode=verbose`

### Crypto — Padding Oracle (Cryptographic Failures)
- **Difficulty:** Hard
- **Hint:** A padding oracle attack lets you decrypt ciphertext by observing whether padding is valid. Manipulate the ciphertext to exploit the oracle.
- **Entry point:** `GET /api/v1/booking/encrypted-manifest` to retrieve encrypted data, `POST /api/v1/booking/encrypted-manifest` with `{"action":"decrypt","ciphertext":"..."}` to test decryption

### Forensics — Log Analysis (Analysis)
- **Difficulty:** Medium
- **Hint:** Web Application Firewall logs contain evidence of attacks. Decode what you find.
- **Entry point:** `GET /api/_waf/logs`

### Timing — Timing Attack (Cryptographic Failures)
- **Difficulty:** Hard
- **Hint:** The token validation endpoint compares your guess against a short lowercase-hex token one character at a time, and each additional correct leading character makes the response measurably slower (tens of milliseconds — no special equipment needed). Watch the `elapsed_ns` field and your own request timings. Recover the token character by character; a fully correct token is accepted and returns the flag.
- **Entry point:** `GET /api/challenge/timing/validate?token=...`
- **Tips:** Sample each candidate several times and compare medians; wrong prefixes return almost immediately while correct prefixes are progressively slower.

## Tips

- Use `curl` or browser DevTools to inspect HTTP responses
- Check response headers — flags can be hidden there
- Read error messages carefully
- Try accessing endpoints without authentication
- Look at base64-encoded data in responses
- Monitor response timing for side-channel leaks

## Rules

1. All challenges are solvable through HTTP only
2. Do not modify the database directly
3. Do not access services on their internal ports
4. Each flag can only be obtained through its intended vulnerability
5. Share your findings with the instructor, not with other students

Good luck!
