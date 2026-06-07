const test = require('node:test');
const assert = require('node:assert/strict');

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars';

const { signRefreshToken, verifyRefreshToken } = require('../dist/services/token.service');

test('refresh tokens carry the Redis session identifier', () => {
  const token = signRefreshToken('user-1', 'customer', 'session-1');
  const payload = verifyRefreshToken(token);

  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.role, 'customer');
  assert.equal(payload.sid, 'session-1');
  assert.equal(payload.type, 'refresh');
});
