#!/bin/bash
set -euo pipefail

BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}"

topics=(
  citizen.created
  citizen.updated
  identity.verified
  document.uploaded
  document.approved
  document.rejected
  notification.created
  audit.event
  report.generated
  admin.action
  auth.session
  identity.user.created
  identity.user.updated
  legacy.record.created
  legacy.record.updated
  search.index.updated
  search.index.failed
)

echo "Initializing Kafka topics on ${BOOTSTRAP}"

existing=$(/opt/bitnami/kafka/bin/kafka-topics.sh --list --bootstrap-server "${BOOTSTRAP}" 2>/dev/null || true)
already=0
for topic in "${topics[@]}"; do
  if printf '%s\n' "$existing" | grep -qx "$topic"; then
    already=$((already + 1))
    continue
  fi
  /opt/bitnami/kafka/bin/kafka-topics.sh \
    --create \
    --if-not-exists \
    --bootstrap-server "${BOOTSTRAP}" \
    --topic "${topic}" \
    --partitions 3 \
    --replication-factor 1
  echo "Topic ready: ${topic}"
done

echo "Kafka topic initialization complete (${already} already existed)"
