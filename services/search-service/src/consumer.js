const { getPrisma } = require('../../../platform/common/db');
const { TOPICS, ALL_TOPICS } = require('../../../platform/common/events');
const { startConsumer, publishEventSafe } = require('../../../platform/common/kafka');
const { indexDocument } = require('../../../platform/common/opensearch');

async function handleIndexEvent(topic, event) {
  const { payload } = event;
  try {
    switch (topic) {
      case TOPICS.CITIZEN_CREATED:
      case TOPICS.CITIZEN_UPDATED:
      case TOPICS.IDENTITY_VERIFIED:
        await indexDocument('citizens', payload.citizenId || payload.id, {
          id: payload.citizenId || payload.id,
          nationalId: payload.nationalId,
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          status: payload.status || 'active'
        });
        break;
      case TOPICS.DOCUMENT_UPLOADED:
      case TOPICS.DOCUMENT_APPROVED:
      case TOPICS.DOCUMENT_REJECTED:
        await indexDocument('documents', payload.documentId || payload.requestId, {
          id: payload.documentId || payload.requestId,
          title: payload.title || payload.documentType,
          type: payload.documentType || payload.type,
          status: payload.status || topic.split('.')[1],
          citizenId: payload.citizenId
        });
        break;
      case TOPICS.NOTIFICATION_CREATED:
        await indexDocument('notifications', payload.notificationId, {
          id: payload.notificationId,
          userId: payload.userId,
          channel: payload.channel,
          message: payload.message
        });
        break;
      case TOPICS.REPORT_GENERATED:
        await indexDocument('reports', payload.reportId, {
          id: payload.reportId,
          type: payload.type,
          title: payload.title,
          status: 'completed',
          generatedBy: payload.generatedBy
        });
        break;
      case TOPICS.LEGACY_RECORD_CREATED:
      case TOPICS.LEGACY_RECORD_UPDATED:
        await indexDocument('citizens', `legacy-${payload.legacyId}`, {
          id: payload.legacyId,
          nationalId: payload.nationalId,
          firstName: payload.fullName?.split(' ')[0],
          lastName: payload.fullName?.split(' ').slice(1).join(' '),
          status: 'legacy',
          region: payload.regionCode
        });
        break;
      default:
        if (topic.includes('audit') || event.source_service === 'audit-service') {
          await indexDocument('audit_logs', event.event_id, {
            action: event.event_type,
            detail: JSON.stringify(payload),
            actor: payload.actor || payload.email,
            service: event.source_service,
            correlationId: event.correlation_id,
            createdAt: event.timestamp
          });
        }
    }
    await publishEventSafe({
      topic: TOPICS.SEARCH_INDEX_UPDATED,
      eventType: TOPICS.SEARCH_INDEX_UPDATED,
      sourceService: 'search-service',
      correlationId: event.correlation_id,
      payload: { sourceTopic: topic, sourceEvent: event.event_type }
    });
  } catch (err) {
    console.error(JSON.stringify({
      component: 'search-consumer',
      topic,
      warning: 'index event skipped',
      error: err.message
    }));
    try {
      await publishEventSafe({
        topic: TOPICS.SEARCH_INDEX_FAILED,
        eventType: TOPICS.SEARCH_INDEX_FAILED,
        sourceService: 'search-service',
        correlationId: event.correlation_id,
        payload: { sourceTopic: topic, error: err.message }
      });
    } catch (publishErr) {
      console.error(JSON.stringify({
        component: 'search-consumer',
        warning: 'failed to publish index failure event',
        error: publishErr.message
      }));
    }
  }
}

async function reindexFromDatabase() {
  const prisma = getPrisma();
  const citizens = await prisma.citizen.findMany({ take: 500 });
  for (const c of citizens) {
    await indexDocument('citizens', c.id, {
      id: c.id,
      nationalId: c.nationalId,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      status: c.status
    });
  }
  const logs = await prisma.auditLog.findMany({ take: 500, orderBy: { createdAt: 'desc' } });
  for (const log of logs) {
    await indexDocument('audit_logs', log.id, {
      id: log.id,
      action: log.action,
      detail: log.detail,
      actor: log.actor,
      service: log.service,
      correlationId: log.correlationId,
      createdAt: log.createdAt
    });
  }
}

async function startSearchConsumer() {
  await startConsumer({
    groupId: 'search-service-consumers',
    topics: ALL_TOPICS,
    clientId: 'search-service',
    handler: async (topic, event) => {
      await handleIndexEvent(topic, event);
    }
  });
}

module.exports = { startSearchConsumer, reindexFromDatabase, handleIndexEvent };
