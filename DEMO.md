# Screen Recording Script - DBS302 Demo

**For collaborators:** Follow this file top to bottom. Every step is numbered. The goal is to show the DB layer (MongoDB + Redis) working live - not just the UI.

---

## Before You Start (first-time setup)

### Option A — Local (macOS)
```bash
# 1. Install dependencies
npm install

# 2. Create your .env
cp .env.example .env
# Edit .env: set MONGODB_URI=mongodb://127.0.0.1:27017/ecommerce?replicaSet=rs0

# 3. Start Redis
brew services start redis

# 4. Start MongoDB as a single-node replica set (required for ACID transactions)
mongod --dbpath /usr/local/var/mongodb --replSet rs0 --fork \
  --logpath /usr/local/var/log/mongodb/mongod.log

# 5. Initialise the replica set (run once)
mongosh --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })"

# 6. Seed both databases (MongoDB + Redis)
npm run seed

# 7. Start the server
npm run dev
```

### Option A — Local (Linux)
```bash
npm install
cp .env.example .env
# Edit .env: set MONGODB_URI=mongodb://127.0.0.1:27017/ecommerce?replicaSet=rs0

sudo systemctl start redis-server

# Start MongoDB as a single-node replica set
mkdir -p /tmp/mongodb-data /tmp/mongodb-logs
mongod --dbpath /tmp/mongodb-data --logpath /tmp/mongodb-logs/mongod.log \
  --port 27017 --replSet rs0 --fork

# Initialise the replica set (run once)
mongosh --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })"
sleep 3

npm run seed
npm run dev
```

### Option B — Docker (3-node replica set + Redis Sentinel)
```bash
chmod 400 docker/mongo-keyfile
docker compose up -d

# Initialise the MongoDB replica set (run once)
docker compose exec mongo1 mongosh -u root -p rootpassword \
  --authenticationDatabase admin \
  --eval 'load("/docker-entrypoint-initdb.d/rs-init.js")'

MONGODB_URI="mongodb://root:rootpassword@localhost:27017/ecommerce?authSource=admin&replicaSet=rs0" \
  npm run seed

npm run dev
```

Server runs at **http://localhost:5001**

---

## What is Swagger? (the "frontend")

Open **http://localhost:5001/api-docs** in the browser.

Swagger UI is the visual interface for the API - it lists every endpoint, lets you fill in inputs, hit **Execute**, and see the real response from MongoDB/Redis. For a backend project this is the frontend for demo purposes.

**The lock icon** on an endpoint means it requires a logged-in user (JWT token). Without a token the server returns `401 Unauthorized`. With a token it returns real data. This demonstrates the auth + RBAC system.

---

## Screen Recording - Step by Step

> **Before you start:** Server log errors for `GET /` and `GET /favicon.ico` (404) are normal — the browser auto-requests these and the API has no root route. Ignore them.
>
> **If you see 401 on any endpoint:** You forgot to Authorize in Swagger. Go to Step 3 and re-authorize with a fresh token.

### 1. Open Swagger in browser

Go to **http://localhost:5001/api-docs**

Point out: all the endpoints are grouped by resource (Products, Orders, Analytics, etc.). This is the full API surface.

---

### 2. Register a new user

Scroll to **Auth → POST /auth/register** → **Try it out**

```json
{
  "name": "Demo User",
  "email": "demo@test.com",
  "password": "DemoPass1!"
}
```

> Password must be 8–72 characters. Name must be at least 2 characters.

Execute → you'll get back an `accessToken` and the new user object.

**What this proves:** User registration, bcrypt password hashing (cost 12), JWT issuance in one request.

---

### 3. Log in as Admin and Authorize

Scroll to **Auth → POST /auth/login** → **Try it out**

```json
{ "email": "alice@dragonkingdom.com", "password": "Admin1234!" }
```

Execute → from the response body, copy the value of `accessToken` (the long string starting with `eyJ...`).

> **IMPORTANT — do this after every login or you will get 401 errors on protected endpoints:**
> 1. Click the green **Authorize** button at the very top of the Swagger page (lock icon)
> 2. In the `bearerAuth` field, paste the token
> 3. Click **Authorize** → then **Close**
>
> The lock icons on protected endpoints will turn closed. If you ever see a 401 response, it means the token expired — just log in again and re-authorize.

Do this once — now every locked endpoint in the demo works without interruption.

---

### 4. Show Redis caching (product detail)

**Step 4a — Get a product ID first:**

Scroll to **Products → GET /products** → **Try it out** → leave all fields blank → **Execute**

In the response you'll see an array of products. Copy the `_id` value from any product, for example:
```json
{
  "_id": "6a26892818caeb17c6ad9f73",
  "name": "GameBeast G5",
  ...
}
```
Copy that `_id` string (the 24-character hex value).

**Step 4b — Hit the single product endpoint twice:**

Scroll to **Products → GET /products/{id}** → **Try it out**

Paste the `_id` you just copied into the `id` field → **Execute**. Do it a second time.

**Step 4c — Confirm the cache in terminal:**
```bash
redis-cli GET "product:<paste_the_id_here>"
```

You'll see the full JSON blob cached in Redis.

**What this proves:** Cache-aside strategy — first request hits MongoDB and writes to Redis, second request is served from Redis. Write-invalidation clears the key on every PATCH/DELETE.

---

### 5. Show Redis Trending Sorted Set updating live

Scroll to **Analytics → GET /analytics/trending** → **Try it out** → **Execute**

You'll see the top 10 products with scores. Note the `_id` and `_score` of the first product, e.g.:
```json
{ "_id": "6a26892818caeb17c6ad9f73", "name": "GameBeast G5", "_score": 510 }
```

Now open **Products → GET /products/{id}** → paste that `_id` → **Execute** 3 times.

Run trending again — the score has increased by 3. This happens in real time via Redis `ZINCRBY`.

**What this proves:** Redis Sorted Set (`trending:products`) updated on every product view, read with `ZREVRANGE`.

---

### 6. Show MongoDB text search

Scroll to **Products → GET /products** → **Try it out**

Fill in the `search` field: `gaming laptop` → **Execute**

You'll see results ranked by text relevance score.

**What this proves:** MongoDB full-text index across `name`, `description`, and `tags` fields.

---

### 7. Show MongoDB Aggregation Pipeline

Scroll to **Analytics → GET /analytics/sales/monthly** → **Try it out** → **Execute**

You'll see revenue grouped by year and month:
```json
[
  { "year": 2026, "month": 6, "revenue": 448.17, "orders": 2, "avgOrderValue": 224.09 },
  { "year": 2026, "month": 5, "revenue": 2743.02, "orders": 8, "avgOrderValue": 342.88 }
]
```

**What this proves:** MongoDB aggregation pipeline — `$match` (delivered/shipped orders) → `$group` (sum revenue by month) → `$sort`. This runs entirely inside MongoDB, not in application code.

---

### 8. Show Redis Leaderboard

Scroll to **Analytics → GET /analytics/leaderboard/buyers** → **Try it out**

Fill in `month`: `2026-06` → **Execute**

You'll see top spenders ranked by total spend for the month.

**What this proves:** Redis Sorted Set (`leaderboard:buyers:2026-06`) — each purchase increments a user's score via `ZINCRBY`. O(log N) write per order, O(N) read for the full leaderboard.

---

### 9. Show Recently Viewed (Redis List)

Log in as Carol first:

Scroll to **Auth → POST /auth/login** → execute with:
```json
{ "email": "carol@dragonkingdom.com", "password": "Customer1!" }
```

> **Remember:** Copy Carol's `accessToken` from the response → click **Authorize** at the top → paste it → **Authorize** → Close. You must re-authorize whenever you switch accounts.

View 2-3 different products via **Products → GET /products/{id}**.

Then scroll to **Products → GET /products/recently-viewed** → **Execute**

You'll see the products you just viewed, in reverse order (most recent first).

**What this proves:** Redis List per user — each product view does `LPUSH` + `LTRIM` (capped at 20). O(1) insert, O(N) read.

---

### 10. Show HyperLogLog (unique visitors)

Scroll to **Products → GET /products/{id}/unique-visitors** → **Try it out**

Use the same product `_id` from Step 4 or Step 5 → paste it into the `id` field → **Execute**

You'll see an estimated count of unique visitors:
```json
{ "success": true, "productId": "...", "uniqueVisitors": 11 }
```

**What this proves:** Redis HyperLogLog (`PFADD` / `PFCOUNT`) — O(1) space regardless of visitor count, ~0.81% standard error. Seed data pre-populates 10 unique IPs per product.

---

### 11. Show ACID Transaction (place an order)

Log in as Carol (token from Step 9) and authorize.

Add something to cart — **Cart → POST /cart/items** → **Try it out**:
```json
{ "productId": "<copy any _id from the products list>", "quantity": 1 }
```

Then scroll to **Orders → POST /orders** → **Try it out**:
```json
{
  "shippingAddress": {
    "fullName": "Demo User",
    "address": "1 Demo Street",
    "city": "Singapore",
    "postalCode": "600001",
    "country": "Singapore",
    "phone": "+6591234567"
  },
  "paymentMethod": "cod"
}
```

Execute.

**What this proves:** MongoDB multi-document ACID transaction — stock decrement + order insert + cart clear happen atomically inside a single session. If any step fails, all three are rolled back.

---

### 12. Show Rate Limiting

Open a terminal and run this loop to hammer the auth endpoint:
```bash
for i in {1..12}; do
  echo -n "Attempt $i: "
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5001/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"wrong@test.com","password":"wrong"}'
done
```

Attempts 1-10 return `401 Unauthorized` (bad credentials). Attempt 11 onwards returns `429 Too Many Requests`.

**What this proves:** Redis-backed rate limiter (`rate-limit-redis`) — auth endpoint allows 10 attempts per 15-minute window per IP. The counter lives in Redis under key `auth_rl::<ip>` with a TTL that resets the window.

---

### 13. Terminal - Raw DB Proof (3 commands)

Split the screen: browser on one side, terminal on the other.

**Redis — confirm the trending scores are real data:**
```bash
redis-cli ZREVRANGE trending:products 0 4 WITHSCORES
```
The ObjectIds and scores match exactly what Swagger returned in Step 5.

**Redis — confirm the session Hash (seeded by `npm run seed`):**
```bash
redis-cli HGETALL session:demo-session-001
```
Returns `userId`, `role`, `name`, `loginAt` stored as Hash fields.

**MongoDB — run the aggregation directly (no app layer):**
```bash
mongosh ecommerce --eval "
db.orders.aggregate([
  { \$match: { status: { \$in: ['delivered','shipped'] } } },
  { \$group: { _id: { year: { \$year: '\$createdAt' }, month: { \$month: '\$createdAt' } },
               revenue: { \$sum: '\$totalPrice' }, orders: { \$count: {} } } },
  { \$sort: { '_id.year': -1, '_id.month': -1 } }
]).toArray()
"
```
The numbers match what Swagger returned in Step 7 — proving the API reads straight from MongoDB, not fake cached data.

---

## Accounts

| Role     | Email                       | Password      |
|----------|-----------------------------|---------------|
| Admin    | alice@dragonkingdom.com     | Admin1234!    |
| Seller   | bob@dragonkingdom.com       | Seller123!    |
| Customer | carol@dragonkingdom.com     | Customer1!    |
