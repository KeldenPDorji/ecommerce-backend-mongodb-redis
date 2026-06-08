# Dragon Kingdom Store - E-Commerce Backend

A production-ready REST API for an online retail platform built with **Node.js**, **TypeScript**, **MongoDB 8**, and **Redis 7**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ · TypeScript 5 |
| Framework | Express 4 |
| Primary DB | MongoDB 8 via Mongoose (replica set) |
| Cache / Sessions / Real-time | Redis 7 via ioredis |
| Auth | JWT (access + refresh rotation) · bcrypt (cost 12) |
| Validation | Zod |
| Security | Helmet · CORS · express-rate-limit (Redis-backed) |
| Logging | Winston · Morgan |
| Containerisation | Docker Compose |

---

## Features

| Feature | Implementation |
|---|---|
| JWT auth with token rotation | Access (15 min) + refresh (7 days) with reuse detection |
| Role-based access | customer / seller / admin roles; route guards via `authorize()` |
| Product catalogue | CRUD · full-text search · filters · pagination · polymorphic attributes |
| Redis caching | Cache-aside with jittered TTL; write-invalidation on every mutation |
| Guest cart | Redis String with 24 h TTL and `guestId` cookie |
| Authenticated cart | MongoDB-persisted; cleared atomically on checkout |
| ACID order placement | MongoDB multi-document transaction: stock lock + order + cart clear |
| Product reviews | Compound unique index; auto-recalculates `averageRating` post-save |
| Trending products | Redis Sorted Set - views +1, purchases +5; top-10 endpoint |
| Recently viewed | Redis List per user; capped at 20; preserves recency order |
| Unique visitors | Redis HyperLogLog - O(1) space, ~0.81 % error |
| Top buyers leaderboard | Redis Sorted Set per calendar month |
| Session management | Redis Hash with TTL |
| Rate limiting | Global · Auth · Checkout - all Redis-backed |
| Analytics | 3 MongoDB aggregation pipelines; cached in Redis |
| Inventory log | Append-only events on every stock change |
| Sharding plan | Documented in `report.md` |
| HA | MongoDB 3-node replica set · Redis Sentinel (3 nodes) |
| Persistence | Redis hybrid RDB + AOF (`appendfsync everysec`) |
| Seed data | 10 categories · 10 users · 50 products · 20 orders · 15 reviews |

---

## Project Structure

```
.
├── src/
│   ├── config/          # env validation, MongoDB connection, Redis client
│   ├── controllers/     # auth, product, cart, order, category, review, analytics, user
│   ├── middleware/       # JWT auth, Zod validate, rate limiters, error handler
│   ├── models/          # User, Product, Category, Order, Cart, Review, Inventory
│   ├── routes/          # Express routers (one per resource)
│   ├── services/        # cache.service (String cache), redis.service (advanced Redis)
│   ├── utils/           # logger, AppError, asyncHandler
│   ├── app.ts           # Express setup
│   └── server.ts        # Entry point
├── scripts/
│   └── seed.ts          # Seed 50 products, 10 users, 20 orders, 15 reviews
├── docker/
│   ├── redis.conf       # Redis persistence + eviction config
│   ├── sentinel.conf    # Redis Sentinel HA config
│   ├── rs-init.js       # MongoDB replica-set init script
│   └── mongo-keyfile    # Replica-set internal auth keyfile
├── docker-compose.yml   # MongoDB 3-node RS + Redis master/replica/sentinel + app
├── Dockerfile           # Multi-stage production image
├── report.md            # Full technical report (DBS302)
├── .env.example
└── package.json
```

---

## Prerequisites (local dev without Docker)

- Node.js ≥ 20
- MongoDB ≥ 8 (must run as a replica set — required for ACID transactions)
- Redis running locally

---

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set MONGODB_URI=mongodb://127.0.0.1:27017/ecommerce?replicaSet=rs0
# Change the two JWT secrets (min 32 chars each)

# 3. Start MongoDB as a single-node replica set
mongod --dbpath /tmp/mongodb-data --replSet rs0 --fork \
  --logpath /tmp/mongodb-logs/mongod.log
# First time only: initialise the replica set
mongosh --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })"

# 4. Seed the database
npm run seed

# 5. Start in development (tsx watch)
npm run dev
```

Server starts on **http://localhost:5001**.

---

## Docker Setup (replica set + Redis HA)

```bash
# Generate a 400-permission keyfile (run once)
chmod 400 docker/mongo-keyfile

# Start all services
docker compose up -d

# Initialise the MongoDB replica set (run once)
docker compose exec mongo1 mongosh -u root -p rootpassword \
  --authenticationDatabase admin \
  --eval 'load("/docker-entrypoint-initdb.d/rs-init.js")'

# Seed (targeting the Docker cluster)
MONGODB_URI="mongodb://root:rootpassword@localhost:27017/ecommerce?authSource=admin&replicaSet=rs0" \
  npm run seed
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | ✅ | - | MongoDB connection string |
| `REDIS_HOST` | ✅ | `127.0.0.1` | Redis host |
| `REDIS_PORT` | ✅ | `6379` | Redis port |
| `REDIS_PASSWORD` | - | - | Redis auth password (if set) |
| `JWT_ACCESS_SECRET` | ✅ | - | Min 32 chars |
| `JWT_REFRESH_SECRET` | ✅ | - | Min 32 chars |
| `JWT_ACCESS_EXPIRES_IN` | - | `15m` | |
| `JWT_REFRESH_EXPIRES_IN` | - | `7d` | |
| `PORT` | - | `5001` | |
| `CLIENT_URL` | - | `http://localhost:3000` | CORS allow-list |
| `RATE_LIMIT_MAX` | - | `100` | Requests per 15-min window |

> **Never commit `.env`** - it is in `.gitignore`.

---

## API Reference

### Auth - `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | - | Register; returns access token + sets refresh cookie |
| POST | `/login` | - | Login; rotates refresh token |
| POST | `/refresh` | cookie | Issue new access token |
| POST | `/logout` | Bearer | Revoke refresh token |
| GET | `/me` | Bearer | Current user profile |

### Products - `/api/v1/products`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | - | List (search, filter, sort, paginate) |
| GET | `/recently-viewed` | Bearer | Per-user recently viewed list (Redis) |
| GET | `/:id` | - | Single product + fires view tracking |
| GET | `/:id/unique-visitors` | - | HyperLogLog estimated unique visitors |
| POST | `/` | admin | Create |
| PATCH | `/:id` | admin | Update + cache invalidation |
| DELETE | `/:id` | admin | Soft-delete |

**Query params for `GET /`:** `page`, `limit`, `search`, `category`, `minPrice`, `maxPrice`, `sort` (`price_asc` \| `price_desc` \| `newest` \| `rating`)

### Categories - `/api/v1/categories`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | - | All active categories (cached) |
| GET | `/:id` | - | Single category |
| POST | `/` | admin | Create |
| PATCH | `/:id` | admin | Update |
| DELETE | `/:id` | admin | Soft-delete |

### Reviews - `/api/v1/products/:productId/reviews`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | - | List reviews for product (paginated) |
| POST | `/` | Bearer | Create review (one per user per product) |
| PATCH | `/:reviewId` | Bearer (owner) | Update own review |
| DELETE | `/:reviewId` | Bearer (owner \| admin) | Delete review |
| POST | `/:reviewId/helpful` | Bearer | Mark review as helpful |

### Cart - `/api/v1/cart`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/guest` | - | Get guest cart (cookie-based, Redis) |
| POST | `/guest/items` | - | Add item to guest cart |
| PATCH | `/guest/items/:productId` | - | Update guest cart item qty |
| DELETE | `/guest` | - | Clear guest cart |
| GET | `/` | Bearer | Get authenticated cart (MongoDB) |
| POST | `/items` | Bearer | Add item |
| PATCH | `/items/:productId` | Bearer | Update qty (0 = remove) |
| DELETE | `/` | Bearer | Clear cart |

### Orders - `/api/v1/orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Bearer | Place order (ACID transaction; checkout rate limited) |
| GET | `/my` | Bearer | My orders (paginated) |
| GET | `/:id` | Bearer | Single order |
| PATCH | `/:id/cancel` | Bearer | Cancel (pending/confirmed only; restores stock) |
| PATCH | `/:id/status` | admin | Update status + tracking number |

### Users - `/api/v1/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profile` | Bearer | Full profile with populated wishlist |
| PATCH | `/profile` | Bearer | Update name / payment preferences |
| POST | `/addresses` | Bearer | Add address |
| PATCH | `/addresses/:addressId` | Bearer | Update address |
| DELETE | `/addresses/:addressId` | Bearer | Remove address |
| GET | `/wishlist` | Bearer | Get wishlist (populated products) |
| POST | `/wishlist/:productId` | Bearer | Add to wishlist |
| DELETE | `/wishlist/:productId` | Bearer | Remove from wishlist |

### Analytics - `/api/v1/analytics`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/trending` | - | Top 10 trending products (Redis Sorted Set) |
| GET | `/sales/monthly` | admin | Monthly revenue aggregation pipeline |
| GET | `/sales/daily` | admin | Daily sales last 30 days |
| GET | `/products/low-stock` | admin | Products at or below stock threshold |
| GET | `/products/top` | admin | Top products by revenue |
| GET | `/leaderboard/buyers` | admin | Monthly top buyers (Redis Sorted Set) |
| GET | `/inventory/:productId` | admin | Inventory event history |

---

## Quick Smoke Test

```bash
# Register
TOKEN=$(curl -s -X POST http://localhost:5001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@test.com","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Promote to admin (run once in mongosh)
mongosh ecommerce --eval 'db.users.updateOne({email:"alice@test.com"},{$set:{role:"admin"}})'

# Browse trending products (public)
curl -s http://localhost:5001/api/v1/analytics/trending | python3 -m json.tool

# View a product - triggers Redis tracking
curl -s http://localhost:5001/api/v1/products/<PRODUCT_ID>

# Check unique visitor count
curl -s http://localhost:5001/api/v1/products/<PRODUCT_ID>/unique-visitors

# Verify Redis keys
redis-cli KEYS "product:*"
redis-cli ZREVRANGE trending:products 0 9 WITHSCORES
redis-cli PFCOUNT product:views:unique:<PRODUCT_ID>
```

---

## Seed Accounts

After running `npm run seed`:

| Role | Email | Password |
|---|---|---|
| Admin | alice@dragonkingdom.com | Admin1234! |
| Seller | bob@dragonkingdom.com | Seller123! |
| Customer | carol@dragonkingdom.com | Customer1! |

---

## Security Notes

- Passwords hashed with **bcrypt** (cost 12); never returned in responses
- Refresh token reuse triggers immediate rejection (rotation detection)
- Request bodies capped at **10 KB**
- **Helmet** sets secure HTTP headers
- **CORS** restricted to `CLIENT_URL`
- Production error responses omit stack traces
- All sensitive schema fields use `select: false`
- Redis `volatile-ttl` eviction policy - cache keys evicted first, critical keys preserved

---

## Team Members

| # | Name |
|---|---|
| 1 | Kelden Phuntsho Dorji |
| 2 | Kinley Palden |
| 3 | Tshering Wangpo Dorji |
| 4 | Sonam Dorji Galley |
| 5 | Dechen Wangdra Sherpa |
