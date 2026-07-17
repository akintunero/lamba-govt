const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

const CREDENTIALS = {
  student: {
    email: process.env.SEED_STUDENT_EMAIL || 'student@gov.lamba',
    password: process.env.SEED_STUDENT_PASSWORD || 'DefaultPass123!'
  },
  admin: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@gov.lamba',
    password: process.env.SEED_ADMIN_PASSWORD || 'DefaultAdminPass123!'
  }
};

async function apiFetch(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : await res.text();
  return { status: res.status, headers: res.headers, data };
}

async function loginAs(role) {
  const creds = CREDENTIALS[role];
  const { data } = await apiFetch('/auth/v1/login', {
    method: 'POST',
    body: { email: creds.email, password: creds.password }
  });
  return data.token;
}

export { API_BASE, CREDENTIALS, apiFetch, loginAs };
