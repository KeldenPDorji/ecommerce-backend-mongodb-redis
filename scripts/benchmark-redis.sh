#!/bin/sh
set -eu

HOST="${REDIS_HOST:-127.0.0.1}"
PORT="${REDIS_PORT:-6379}"
REQUESTS="${BENCHMARK_REQUESTS:-10000}"
CLIENTS="${BENCHMARK_CLIENTS:-50}"

echo "Redis benchmark: host=$HOST port=$PORT requests=$REQUESTS clients=$CLIENTS"
if [ -n "${REDIS_PASSWORD:-}" ]; then
  redis-benchmark -h "$HOST" -p "$PORT" -a "$REDIS_PASSWORD" -n "$REQUESTS" -c "$CLIENTS" -q -t get,set
else
  redis-benchmark -h "$HOST" -p "$PORT" -n "$REQUESTS" -c "$CLIENTS" -q -t get,set
fi
