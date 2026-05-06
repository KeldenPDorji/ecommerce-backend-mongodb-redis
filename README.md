# E-Commerce Backend

A production-ready REST API for an e-commerce platform built with **Node.js**, **TypeScript**, **MongoDB**, and **Redis**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 + TypeScript 5 |
| Framework | Express 4 |
| Database | MongoDB 8 via Mongoose |
| Cache / Sessions | Redis via ioredis |
| Auth | JWT (access + refresh tokens) + bcrypt |
| Validation | Zod |
| Security | Helmet, CORS, express-rate-limit |
| Logging | Winston |

---

## Features

- **JWT Authentication** — short-lived access tokens (15 min) + rotating refresh tokens (7 days), stored per-user for multi-device support and reuse detection
- **Redis Caching** — product listings and individual products are cached with automatic invalidation on writes
- **Redis Rate Limiting** — global limiter (100 req / 15 min) and a tight auth limiter (10 req / 15 min)
- **Atomic Order Placement** — MongoDB sessions lock stock and clear the cart in a single transaction; aborted on any failure
- **Role-based Access** — `customer` and `admin` roles; admin-only routes for product/order management
- **Graceful Shutdown** — SIGTERM/SIGINT close DB and Redis connections cleanly before exit
- **Input Validation** — every route validates its payload via a Zod schema before touching the database
- **Centralised Error Handling** — Mongoose errors, duplicate keys, cast errors, and app errors all produce consistent JSON responses; stack traces are hidden in production

---

## Project Structure

```
src/
├── config/          # env validation, MongoDB connection, Redis client
├── controllers/     # route handlers (auth, product, cart, order)
├── middleware/      # JWT auth, Zod validation, rate limiting, error handler
├── models/          # Mongoose schemas (User, Product, Category, Cart, Order)
├── routes/          # Express routers
├── services/        # cache (Redis), token (JWT), email (stub)
├── utils/           # logger, AppError, asyncHandler
├── app.ts           # Express app setup
└── server.ts        # entry point — connects DB/Redis, starts HTTP server
```

---

## Prerequisites

- Node.js ≥ 20
- MongoDB running locally (`brew services start mongodb-community@8.0`)
- Redis running locally (`brew services start redis`)

---

## Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd E-Commerce
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum change the two JWT secrets

# 3. Start in development (tsx watch)
npm run dev

# 4. Build for production
npm run build
npm start
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `REDIS_HOST` / `REDIS_PORT` | ✅ | Redis host and port |
| `JWT_ACCESS_SECRET` | ✅ | Min 32 chars — sign access tokens |
| `JWT_REFRESH_SECRET` | ✅ | Min 32 chars — sign refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | — | Default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | — | Default `7d` |
| `PORT` | — | Default `5001` (5000 is taken by macOS AirPlay) |
| `CLIENT_URL` | — | CORS origin, default `http://localhost:3000` |
| `RATE_LIMIT_MAX` | — | Max requests per window, default `100` |

> **Never commit `.env`** — it is listed in `.gitignore`.

---

## API Reference

### Auth — `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Register; returns access token + sets refresh cookie |
| POST | `/login` | — | Login; rotates refresh token |
| POST | `/refresh` | cookie | Issue new access token |
| POST | `/logout` | Bearer | Revoke refresh token |
| GET | `/me` | Bearer | Current user profile |

### Products — `/api/v1/products`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | — | List products (search, filter by category/price, sort, paginate) |
| GET | `/:id` | — | Single product |
| POST | `/` | admin | Create product |
| PATCH | `/:id` | admin | Update product |
| DELETE | `/:id` | admin | Soft-delete product |

**Query params for `GET /`:** `page`, `limit`, `search`, `category`, `minPrice`, `maxPrice`, `sort` (`price_asc` \| `price_desc` \| `newest` \| `rating`)

### Cart — `/api/v1/cart`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Get cart |
| POST | `/items` | Add item `{ productId, quantity }` |
| PATCH | `/items/:productId` | Update quantity (0 = remove) |
| DELETE | `/` | Clear cart |

All cart routes require a Bearer token.

### Orders — `/api/v1/orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Bearer | Place order from cart |
| GET | `/my` | Bearer | My orders (paginated) |
| GET | `/:id` | Bearer | Single order |
| PATCH | `/:id/cancel` | Bearer | Cancel (pending/confirmed only) |
| PATCH | `/:id/status` | admin | Update status + tracking number |

**Order statuses:** `pending` → `confirmed` → `processing` → `shipped` → `delivered` (or `cancelled` / `refunded`)

---

## Quick Smoke Test

```bash
# 1. Register
curl -s -X POST http://localhost:5001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@test.com","password":"password123"}' | python3 -m json.tool

# 2. Promote to admin (run once)
mongosh ecommerce --eval 'db.users.updateOne({email:"alice@test.com"},{$set:{role:"admin"}})'

# 3. Login — copy the accessToken
curl -s -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"password123"}' | python3 -m json.tool

# 4. Verify Redis cache after listing products
redis-cli KEYS "products:*"
```

---

## Security Notes

- Passwords hashed with **bcrypt** (cost factor 12); never returned in responses (`select: false`)
- Refresh tokens stored per-user; **token reuse** triggers immediate rejection
- Request bodies capped at **10 KB** to prevent payload flooding
- **Helmet** sets secure HTTP headers; **CORS** restricted to `CLIENT_URL`
- Production error responses omit stack traces and internal messages
- All sensitive model fields (`password`, `refreshTokens`, reset tokens) use `select: false`
# ecommerce-backend-mongodb-redis
