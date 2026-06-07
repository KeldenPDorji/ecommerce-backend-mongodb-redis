const test = require('node:test');
const assert = require('node:assert/strict');

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars';

const { jitter } = require('../dist/services/cache.service');

test('jitter keeps TTL within the documented +/-20 percent range', () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ttl = jitter(100);
    assert.ok(ttl >= 80);
    assert.ok(ttl < 120);
  }
});
