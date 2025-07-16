const express = require('express');
const cookieParser = require('cookie-parser');

function createServiceApp({ serviceName }) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: serviceName });
  });

  return app;
}

module.exports = { createServiceApp };
