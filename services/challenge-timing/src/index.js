const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3012;
const SERVICE = 'challenge-timing';

// The challenge token is deliberately short (hex) so a per-character timing
// attack over HTTP is practical. Each correct leading character adds a
// measurable server-side delay; wrong prefixes return immediately.
const TIMING_SECRET = process.env.TIMING_ATTACK_SECRET || 'deadbeef00';
const FLAG = process.env.CTF_FLAG_TIMING_ATTACK || 'FLAG{placeholder_timing_flag}';
// 80ms per correct character: deliberately far above typical local HTTP
// jitter (~50-150ms through the gateway), so the side channel is measurable
// with a handful of samples per candidate.
const PER_CHAR_DELAY_MS = parseInt(process.env.TIMING_PER_CHAR_MS || '80', 10);

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE }));

// GET /validate?token=<guess>
// Deliberately vulnerable: response time grows by PER_CHAR_DELAY_MS for every
// correct leading character. Recover the token char-by-char, then submit it.
app.get('/validate', (req, res) => {
  const token = String(req.query.token || '');
  const start = process.hrtime.bigint();

  let matchingChars = 0;
  const maxLen = Math.min(token.length, TIMING_SECRET.length);
  for (let i = 0; i < maxLen; i++) {
    if (token[i] !== TIMING_SECRET[i]) break;
    matchingChars++;
  }

  // Release the event loop so concurrent requests are not blocked, then apply
  // a per-matching-character delay that is far larger than HTTP jitter.
  const delayMs = matchingChars * PER_CHAR_DELAY_MS;
  setTimeout(() => {
    const valid = token === TIMING_SECRET;
    const elapsed = Number(process.hrtime.bigint() - start);
    const body = {
      valid,
      elapsed_ns: elapsed,
      message: valid ? 'Access granted' : 'Access denied'
    };
    if (valid && FLAG) {
      body.flag = FLAG;
    }
    res.json(body);
  }, delayMs);
});

app.listen(PORT, () => {
  console.log(`${SERVICE} listening on ${PORT}`);
});
