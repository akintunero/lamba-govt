const TOPICS = {
  CITIZEN_CREATED: 'citizen.created',
  CITIZEN_UPDATED: 'citizen.updated',
  IDENTITY_VERIFIED: 'identity.verified',
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_APPROVED: 'document.approved',
  DOCUMENT_REJECTED: 'document.rejected',
  NOTIFICATION_CREATED: 'notification.created',
  AUDIT_EVENT: 'audit.event',
  REPORT_GENERATED: 'report.generated',
  ADMIN_ACTION: 'admin.action',
  AUTH_SESSION: 'auth.session',
  IDENTITY_USER_CREATED: 'identity.user.created',
  IDENTITY_USER_UPDATED: 'identity.user.updated',
  LEGACY_RECORD_CREATED: 'legacy.record.created',
  LEGACY_RECORD_UPDATED: 'legacy.record.updated',
  SEARCH_INDEX_UPDATED: 'search.index.updated',
  SEARCH_INDEX_FAILED: 'search.index.failed'
};

const ALL_TOPICS = Object.values(TOPICS);

const REQUIRED_FIELDS = ['event_id', 'event_type', 'timestamp', 'correlation_id', 'source_service', 'payload'];

function validateEvent(event) {
  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['Event must be an object'] };
  }
  const errors = REQUIRED_FIELDS.filter((field) => event[field] === undefined || event[field] === null);
  if (typeof event.payload !== 'object') {
    errors.push('payload must be an object');
  }
  return { valid: errors.length === 0, errors };
}

function buildEvent({ eventType, sourceService, correlationId, payload }) {
  const crypto = require('crypto');
  return {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    correlation_id: correlationId || crypto.randomUUID(),
    source_service: sourceService,
    payload: payload || {}
  };
}

function normalizeAuditRecord(event) {
  return {
    action: event.event_type,
    detail: JSON.stringify(event.payload),
    actor: event.payload?.actor || event.payload?.email || null,
    service: event.source_service,
    correlationId: event.correlation_id
  };
}

module.exports = {
  TOPICS,
  ALL_TOPICS,
  REQUIRED_FIELDS,
  validateEvent,
  buildEvent,
  normalizeAuditRecord
};
