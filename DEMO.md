# Screen Recording Script — DBS302 Demo

**For collaborators:** Follow this file top to bottom. Every step is numbered. The goal is to show the DB layer (MongoDB + Redis) working live — not just the UI.

---

## Before You Start (first-time setup)

```bash
# 1. Install dependencies
npm install

# 2. Create your .env (copy the example — works as-is for local demo)
cp .env.example .env

# 3. Start MongoDB and Redis (macOS)
brew services start mongodb-community@8.0
brew services start redis

# 4. Seed both databases (MongoDB + Redis)
npm run seed

# 5. Start the server
npm run dev
```

Server runs at **http://localhost:5001**

---

## What is Swagger? (the "frontend")

Open **http://localhost:5001/api-docs** in the browser.

Swagger UI is the visual interface for the API — it lists every endpoint, lets you fill in inputs, hit **Execute**, and see the real response from MongoDB/Redis. For a backend project this is the frontend for demo purposes.

**The lock icon** on an endpoint means it requires a logged-in user (JWT token). Without a token the server returns `401 Unauthorized`. With a token it returns real data. This demonstrates the auth + RBAC system.

---

## Screen Recording — Step by Step

### 1. Open Swagger in browser

Go to **http://localhost:5001/api-docs**

Point out: all the endpoints are grouped by resource (Products, Orders, Analytics, etc.). This is the full API surface.

---

### 2. Log in and Authorize first

Scroll to **Auth → POST /auth/login** → **Try it out**

Paste this body:
```json
{ "email": "alice@xyzshope.com", "password": "Admin1234!" }
```

Execute → copy the `accessToken` value from the response.

Click the **Authorize** button at the top of the page → paste the token → **Authorize** → Close.

Do this once at the start — now every endpoint in the demo works without interruption.

---

### 3. Show Redis working

Scroll to **Analytics → GET /analytics/trending** → **Try it out** → **Execute**

You'll see the top 10 products with their scores:
```json
[
  { "productId": "...", "score": 510 },
  { "productId": "...", "score": 490 },
  ...
]
```

**What this proves:** Redis Sorted Set (`ZREVRANGE trending:products`) is live.

---

### 4. Show MongoDB text search

Scroll to **Products → GET /products** → **Try it out**

Fill in the `search` field: `gaming laptop` → **Execute**

You'll see results ranked by text relevance (GameBeast G5 at the top).

**What this proves:** MongoDB full-text index across name, description, and tags.

---

### 5. Show MongoDB Aggregation Pipeline

Scroll to **Analytics → GET /analytics/sales/monthly** → **Try it out** → **Execute**

You'll see revenue grouped by year and month:
```json
[
  { "_id": { "year": 2026, "month": 6 }, "revenue": 4823.91, "orderCount": 8 },
  ...
]
```

**What this proves:** MongoDB aggregation pipeline — `$match` (delivered/shipped orders) → `$group` (sum revenue by month) → `$sort`. This runs entirely inside MongoDB, not in application code.

---

### 6. Show Redis Leaderboard

Scroll to **Analytics → GET /analytics/leaderboard/buyers** → **Try it out**

Fill in `month`: `2026-06` → **Execute**

You'll see top spenders ranked by total spend.

**What this proves:** Redis Sorted Set (`leaderboard:buyers:2026-06`) — each purchase adds to a user's score using `ZINCRBY`. One O(log N) write per order, one O(N) read for the full leaderboard.

---

### 7. Show the ACID Transaction (place an order)

First add something to cart. Scroll to **Cart → POST /cart/items** → **Try it out**

```json
{ "productId": "<copy any _id from the products search above>", "quantity": 1 }
```

Then scroll to **Orders → POST /orders** → **Try it out**

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

**What this proves:** MongoDB multi-document ACID transaction — stock decrement + order insert + cart clear happen atomically. If any step fails, all three are rolled back.

---

### 8. Terminal — Raw DB Proof (3 commands)

Split the screen: browser on one side, terminal on the other.

**Redis — confirm the trending scores are real data:**
```bash
redis-cli ZREVRANGE trending:products 0 4 WITHSCORES
```
The ObjectIds and scores match exactly what Swagger returned in Step 2.

**Redis — confirm the session Hash:**
```bash
redis-cli HGETALL session:demo-session-001
```
Shows `userId`, `role`, `name`, `loginAt` stored as Hash fields with a TTL.

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
The numbers match what Swagger returned in Step 5 — proving the API is reading straight from MongoDB, not cached fake data.

---

## Accounts

| Role     | Email                  | Password      |
|----------|------------------------|---------------|
| Admin    | alice@xyzshope.com     | Admin1234!    |
| Seller   | bob@xyzshope.com       | Seller123!    |
| Customer | carol@xyzshope.com     | Customer1!    |
