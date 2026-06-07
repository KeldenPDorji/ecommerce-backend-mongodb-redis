#!/bin/sh
set -eu

MONGO_USER="${MONGO_ROOT_USERNAME:-root}"
MONGO_PASSWORD="${MONGO_ROOT_PASSWORD:-rootpassword}"
REDIS_PASSWORD="${REDIS_PASSWORD:-redispassword}"

echo "MongoDB replica-set members"
docker compose exec mongo1 mongosh -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
  --authenticationDatabase admin --quiet \
  --eval 'rs.status().members.map(({name,stateStr,health}) => ({name,stateStr,health}))'

echo "Redis Sentinel master discovery"
docker compose exec sentinel1 redis-cli -p 26379 -a "$REDIS_PASSWORD" \
  SENTINEL get-master-addr-by-name mymaster
