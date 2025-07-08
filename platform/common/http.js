const { SERVICE_TOKEN } = require('./middleware');

async function serviceFetch(baseUrl, path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Service-Token': SERVICE_TOKEN,
    ...(options.headers || {})
  };
  if (options.correlationId) {
    headers['X-Request-Id'] = options.correlationId;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Service request failed: ${response.status} ${text}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

module.exports = { serviceFetch };
