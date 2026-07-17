const express = require('express');
const { getPrisma } = require('../../../platform/common/db');
const { attachUser, requireAuth } = require('../../../platform/common/auth');
const {
  correlationMiddleware,
  serviceAuthMiddleware,
  requestLogMiddleware,
  metricsMiddleware,
  metrics
} = require('../../../platform/common/middleware');
const { kafkaPrometheusMetrics } = require('../../../platform/common/kafka');
const { startNotificationConsumer } = require('./consumer');

const app = express();
const prisma = getPrisma();
const PORT = process.env.PORT || 3006;
const SERVICE = 'notification-service';

app.use(express.json());
app.use(correlationMiddleware);
app.use(serviceAuthMiddleware);
app.use(requestLogMiddleware(SERVICE));
app.use(metricsMiddleware(SERVICE));
app.use(attachUser);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE, mode: 'event-driven' }));
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.prometheus(SERVICE) + kafkaPrometheusMetrics(SERVICE));
});

app.get('/notifications', requireAuth, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
  return res.json({ notifications });
});

app.post('/notifications', requireAuth, async (req, res) => {
  const { userId, channel, message } = req.body;
  if (!userId || !channel || !message) {
    return res.status(400).json({ error: 'userId, channel, and message are required' });
  }
  const notification = await prisma.notification.create({
    data: { userId, channel, message }
  });
  return res.status(201).json(notification);
});

app.patch('/notifications/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const data = {};
  if (req.body.read === true) data.read = true;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  const updated = await prisma.notification.update({
    where: { id },
    data
  });
  return res.json(updated);
});

async function bootstrap() {
  try {
    await startNotificationConsumer();
  } catch (err) {
    console.error(JSON.stringify({ component: 'notification-consumer', error: err.message }));
  }
  app.listen(PORT, () => {
    console.log(`${SERVICE} listening on ${PORT}`);
  });
}

bootstrap();
