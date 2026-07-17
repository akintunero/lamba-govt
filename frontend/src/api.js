const API_BASE =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8080/api'
    : '/api');

const TOKEN_EXPIRY_EVENT = 'lamba:token-expired';

export async function apiFetch(path, { method = 'GET', body, token, signal } = {}) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
    signal
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(TOKEN_EXPIRY_EVENT));
    let message = 'Session expired. Please log in again.';
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      //
    }
    throw new Error(message);
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      //
    }
    throw new Error(message);
  }

  return res.json();
}

export { API_BASE, TOKEN_EXPIRY_EVENT };
