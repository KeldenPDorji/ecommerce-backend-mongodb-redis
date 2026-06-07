import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<100'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:5001';
const productId = __ENV.PRODUCT_ID;

export default function () {
  if (!productId) throw new Error('Set PRODUCT_ID before running this benchmark');

  const response = http.get(`${baseUrl}/api/v1/products/${productId}`);
  check(response, { 'product returned': (res) => res.status === 200 });
  sleep(0.1);
}
