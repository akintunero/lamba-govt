const { getPrisma } = require('../../../platform/common/db');
const { ALL_TOPICS, TOPICS } = require('../../../platform/common/events');
const { startConsumer, publishEventSafe } = require('../../../platform/common/kafka');

const activityBuffer = {
  counts: {},
  lastEventAt: null
};

function recordActivity(event) {
  activityBuffer.counts[event.event_type] = (activityBuffer.counts[event.event_type] || 0) + 1;
  activityBuffer.lastEventAt = event.timestamp;
}

async function startReportingConsumer() {
  await startConsumer({
    groupId: 'reporting-service-consumers',
    topics: ALL_TOPICS,
    clientId: 'reporting-service',
    handler: async (_topic, event) => {
      recordActivity(event);
    }
  });
}

async function publishReportGenerated({ type, title, payload, correlationId, generatedBy }) {
  const prisma = getPrisma();
  const record = await prisma.report.create({
    data: {
      type,
      title,
      payload: JSON.stringify(payload),
      generatedBy: generatedBy || 'system',
      status: 'completed'
    }
  });
  await publishEventSafe({
    topic: TOPICS.REPORT_GENERATED,
    eventType: TOPICS.REPORT_GENERATED,
    sourceService: 'reporting-service',
    correlationId,
    payload: { reportId: record.id, type, title, generatedBy }
  });
  return record;
}

function getActivitySnapshot() {
  return {
    eventCounts: { ...activityBuffer.counts },
    lastEventAt: activityBuffer.lastEventAt,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  startReportingConsumer,
  publishReportGenerated,
  getActivitySnapshot
};
