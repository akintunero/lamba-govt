const { Pool } = require('pg');

let pool;

function getLegacyPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.LEGACY_DATABASE_URL || 'postgres://lamba:lamba@db:5432/lamba_legacy'
    });
  }
  return pool;
}

module.exports = { getLegacyPool };
