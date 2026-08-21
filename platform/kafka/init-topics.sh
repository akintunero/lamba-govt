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

# Wait until the broker answers a metadata request. Fresh single-node KRaft
# clusters can take minutes to elect leaders on loaded hosts, and the broker
# can be listening long before it can serve requests.
existing=""
for i in $(seq 1 90); do
  if existing=$(/opt/bitnami/kafka/bin/kafka-topics.sh --list --bootstrap-server "${BOOTSTRAP}" 2>/dev/null); then
    break
  fi
  echo "waiting for broker metadata... ($i)"
  sleep 5
done

already=0
for topic in "${topics[@]}"; do
  if printf '%s\n' "$existing" | grep -qx "$topic"; then
    already=$((already + 1))
    continue
  fi
  # Topic creation can fail transiently while leader elections settle — retry.
  for attempt in $(seq 1 18); do
    if /opt/bitnami/kafka/bin/kafka-topics.sh \
      --create \
      --if-not-exists \
      --bootstrap-server "${BOOTSTRAP}" \
      --topic "${topic}" \
      --partitions 3 \
      --replication-factor 1; then
      echo "Topic ready: ${topic}"
      break
    fi
    echo "create ${topic}: attempt ${attempt} failed, retrying..."
    sleep 5
    if [ "$attempt" = "18" ]; then
      echo "ERROR: could not create topic ${topic}" >&2
      exit 1
    fi
  done
done

echo "Kafka topic initialization complete (${already} already existed)"
