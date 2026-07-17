const { Pool } = require('pg');

let pool;

function getLegacyPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.LEGACY_DATABASE_URL
    });
  }
  return pool;
}

module.exports = { getLegacyPool };
