const express = require('express');

const app = express();
const PORT = process.env.PORT || 3012;
const SERVICE = 'challenge-timing';

const FLAG = process.env.CTF_FLAG_TIMING_ATTACK || 'FLAG{placeholder_timing_flag}';

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE }));

function unsafeCompare(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

app.get('/validate', (req, res) => {
  const token = req.query.token || '';
  const start = process.hrtime.bigint();
  const valid = unsafeCompare(token, FLAG);
  const end = process.hrtime.bigint();
  const elapsed = Number(end - start);

  res.json({
    valid,
    elapsed_ns: elapsed,
    message: valid ? 'Access granted' : 'Access denied'
  });
});

app.listen(PORT, () => {
  console.log(`${SERVICE} listening on ${PORT}`);
});
