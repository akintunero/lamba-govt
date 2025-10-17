const { getPrisma } = require('../../../platform/common/db');
const { TOPICS } = require('../../../platform/common/events');
const { startConsumer, publishEventSafe } = require('../../../platform/common/kafka');

const NOTIFICATION_TOPICS = [
  TOPICS.CITIZEN_CREATED,
  TOPICS.CITIZEN_UPDATED,
  TOPICS.IDENTITY_VERIFIED,
  TOPICS.DOCUMENT_APPROVED,
  TOPICS.DOCUMENT_REJECTED,
  TOPICS.ADMIN_ACTION
];

async function deliverNotification({ userId, channel, message, correlationId }) {
  const prisma = getPrisma();
  const notification = await prisma.notification.create({
    data: { userId, channel, message }
  });
  await publishEventSafe({
    topic: TOPICS.NOTIFICATION_CREATED,
    eventType: TOPICS.NOTIFICATION_CREATED,
    sourceService: 'notification-service',
    correlationId,
    payload: { notificationId: notification.id, userId, channel, message }
  });
  return notification;
}

async function startNotificationConsumer() {
  const prisma = getPrisma();
  await startConsumer({
    groupId: 'notification-service-consumers',
    topics: NOTIFICATION_TOPICS,
    clientId: 'notification-service',
    handler: async (topic, event) => {
      const { payload, correlation_id: correlationId } = event;
      let message = '';
      let channel = 'email';
      let userId = payload.userId || 1;

      switch (topic) {
        case TOPICS.CITIZEN_CREATED:
          message = `Citizen registration received for ${payload.nationalId || payload.email}`;
          channel = 'email';
          break;
        case TOPICS.CITIZEN_UPDATED:
          message = `Citizen record ${payload.citizenId} updated`;
          break;
        case TOPICS.IDENTITY_VERIFIED:
          message = `Identity verification completed for citizen ${payload.citizenId}`;
          break;
        case TOPICS.DOCUMENT_APPROVED:
          message = `Document request ${payload.requestId} approved`;
          channel = 'document_status';
          break;
        case TOPICS.DOCUMENT_REJECTED:
          message = `Document request ${payload.requestId} rejected`;
          channel = 'document_status';
          break;
        case TOPICS.ADMIN_ACTION:
          message = `Administrative action: ${payload.action}`;
          channel = 'admin_alert';
          break;
        default:
          message = `Platform event: ${event.event_type}`;
      }

      if (payload.email && !payload.userId) {
        const user = await prisma.user.findFirst({ where: { email: payload.email } });
        if (user) userId = user.id;
      }

      await deliverNotification({ userId, channel, message, correlationId });
    }
  });
}

module.exports = { startNotificationConsumer, deliverNotification };
