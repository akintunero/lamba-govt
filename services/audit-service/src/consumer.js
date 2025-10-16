const { getPrisma } = require('../../../platform/common/db');
const { ALL_TOPICS, normalizeAuditRecord } = require('../../../platform/common/events');
const { startConsumer } = require('../../../platform/common/kafka');

async function startAuditConsumer() {
  const prisma = getPrisma();
  await startConsumer({
    groupId: 'audit-service-consumers',
    topics: ALL_TOPICS,
    clientId: 'audit-service',
    handler: async (topic, event) => {
      const record = normalizeAuditRecord(event);
      await prisma.auditLog.create({
        data: {
          action: record.action,
          detail: record.detail,
          actor: record.actor,
          service: record.service,
          correlationId: record.correlationId
        }
      });
    }
  });
}

module.exports = { startAuditConsumer };
