const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Redis active directives do not contain unsupported inline comments', () => {
  const config = fs.readFileSync('docker/redis.conf', 'utf8');
  const invalid = config
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('#'));

  assert.deepEqual(invalid, []);
});

test('Docker app connects to Redis through Sentinel', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');

  assert.match(compose, /REDIS_SENTINELS:/);
  assert.match(compose, /REDIS_MASTER_NAME:/);
  assert.match(compose, /requirepass/);
});

test('MongoDB connection and transactions declare strong concerns', () => {
  const database = fs.readFileSync('src/config/database.ts', 'utf8');
  const orders = fs.readFileSync('src/controllers/order.controller.ts', 'utf8');

  assert.match(database, /readConcern: \{ level: 'majority' \}/);
  assert.match(database, /writeConcern: \{ w: 'majority', j: true \}/);
  assert.match(orders, /readConcern: \{ level: 'snapshot'/);
  assert.match(orders, /writeConcern: \{ w: 'majority'/);
});
