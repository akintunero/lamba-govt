const { Kafka, logLevel } = require('kafkajs');
const { buildEvent, validateEvent } = require('./events');

const kafkaMetrics = {
  published: 0,
  consumed: 0,
  failed: 0,
  processingLatencyMs: []
};

let kafkaClient;
let sharedProducer;

function getBrokers() {
  const brokers = process.env.KAFKA_BROKERS;
  if (!brokers) return ['kafka:9092'];
  return brokers.split(',').map((b) => b.trim());
}

function getKafkaClient(clientId) {
  if (!kafkaClient) {
    kafkaClient = new Kafka({
      clientId: clientId || process.env.SERVICE_NAME || 'lamba-platform',
      brokers: getBrokers(),
      logLevel: logLevel.ERROR,
      retry: { initialRetryTime: 300, retries: 10 }
    });
  }
  return kafkaClient;
}

async function connectProducer(clientId) {
  if (!sharedProducer) {
    sharedProducer = getKafkaClient(clientId).producer();
    await sharedProducer.connect();
  }
  return sharedProducer;
}

async function publishEvent({ topic, eventType, sourceService, correlationId, payload, clientId }) {
  const event = buildEvent({ eventType, sourceService, correlationId, payload });
  const validation = validateEvent(event);
  if (!validation.valid) {
    throw new Error(`Invalid event schema: ${validation.errors.join(', ')}`);
  }
  const producer = await connectProducer(clientId || sourceService);
  await producer.send({
    topic,
    messages: [{ key: event.event_id, value: JSON.stringify(event), headers: {
      'correlation-id': event.correlation_id,
      'source-service': event.source_service
    }}]
  });
  kafkaMetrics.published += 1;
  return event;
}

const PUBLISH_TIMEOUT_MS = parseInt(process.env.KAFKA_PUBLISH_TIMEOUT_MS || '2000', 10);

async function publishEventSafe(options) {
  // Never let a sick broker hang an HTTP request: race the publish against a
  // short timeout. The underlying publish continues in the background and its
  // own catch records failures, so delivery is best-effort, not request-blocking.
  const publish = publishEvent(options).catch((err) => {
    kafkaMetrics.failed += 1;
    console.error(JSON.stringify({
      level: 'error',
      component: 'kafka-producer',
      message: err.message,
      topic: options.topic,
      correlationId: options.correlationId
    }));
    return null;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PUBLISH_TIMEOUT_MS));
  timeout.unref?.();
  return Promise.race([publish, timeout]);
}

async function startConsumer({ groupId, topics, handler, clientId }) {
  const consumer = getKafkaClient(clientId).consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topics, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const start = Date.now();
      try {
        const raw = message.value?.toString();
        if (!raw) return;
        const event = JSON.parse(raw);
        const validation = validateEvent(event);
        if (!validation.valid) {
          kafkaMetrics.failed += 1;
          console.error(JSON.stringify({ level: 'error', component: 'kafka-consumer', topic, errors: validation.errors }));
          return;
        }
        await handler(topic, event, message);
        kafkaMetrics.consumed += 1;
        kafkaMetrics.processingLatencyMs.push(Date.now() - start);
        if (kafkaMetrics.processingLatencyMs.length > 1000) {
          kafkaMetrics.processingLatencyMs.shift();
        }
      } catch (err) {
        kafkaMetrics.failed += 1;
        console.error(JSON.stringify({ level: 'error', component: 'kafka-consumer', topic, message: err.message }));
      }
    }
  });
  return consumer;
}

function kafkaPrometheusMetrics(serviceName) {
  const avgLatency = kafkaMetrics.processingLatencyMs.length
    ? kafkaMetrics.processingLatencyMs.reduce((a, b) => a + b, 0) / kafkaMetrics.processingLatencyMs.length
    : 0;
  return [
    `# HELP kafka_events_published_total Events published`,
    `# TYPE kafka_events_published_total counter`,
    `kafka_events_published_total{service="${serviceName}"} ${kafkaMetrics.published}`,
    `# HELP kafka_events_consumed_total Events consumed`,
    `# TYPE kafka_events_consumed_total counter`,
    `kafka_events_consumed_total{service="${serviceName}"} ${kafkaMetrics.consumed}`,
    `# HELP kafka_events_failed_total Failed event operations`,
    `# TYPE kafka_events_failed_total counter`,
    `kafka_events_failed_total{service="${serviceName}"} ${kafkaMetrics.failed}`,
    `# HELP kafka_event_processing_latency_ms Average processing latency`,
    `# TYPE kafka_event_processing_latency_ms gauge`,
    `kafka_event_processing_latency_ms{service="${serviceName}"} ${avgLatency.toFixed(2)}`
  ].join('\n') + '\n';
}

module.exports = {
  publishEvent,
  publishEventSafe,
  startConsumer,
  connectProducer,
  kafkaPrometheusMetrics,
  kafkaMetrics
};
