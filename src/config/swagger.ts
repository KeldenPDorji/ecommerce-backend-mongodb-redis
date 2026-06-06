import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'XYZ Shope API',
    version: '1.0.0',
    description:
      'E-Commerce REST API — DBS302 Assignment. MongoDB 8 (replica set, ACID transactions, aggregation pipelines, text indexes) + Redis 7 (Sorted Set, List, HyperLogLog, Hash, String).',
  },
  servers: [{ url: '/api/v1', description: 'Local dev' }],
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Product: {
        type: 'object',
        properties: {
          _id:           { type: 'string' },
          name:          { type: 'string' },
          sku:           { type: 'string' },
          price:         { type: 'number' },
          stock:         { type: 'integer' },
          category:      { type: 'string' },
          description:   { type: 'string' },
          averageRating: { type: 'number' },
          numReviews:    { type: 'integer' },
          tags:          { type: 'array', items: { type: 'string' } },
        },
      },
      Order: {
        type: 'object',
        properties: {
          _id:        { type: 'string' },
          user:       { type: 'string' },
          items:      { type: 'array', items: { type: 'object' } },
          totalPrice: { type: 'number' },
          status:     { type: 'string', enum: ['pending','confirmed','processing','shipped','delivered','cancelled'] },
          isPaid:     { type: 'boolean' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          status:  { type: 'string', example: 'error' },
          message: { type: 'string' },
        },
      },
    },
  },
  tags: [
    { name: 'Auth',      description: 'JWT registration, login, token rotation' },
    { name: 'Products',  description: 'Catalogue — full-text search, filters, Redis view tracking' },
    { name: 'Categories',description: 'Product categories (Redis cached)' },
    { name: 'Reviews',   description: 'Per-product reviews — compound unique index, auto-sync rating' },
    { name: 'Cart',      description: 'Guest cart (Redis String) + authenticated cart (MongoDB)' },
    { name: 'Orders',    description: 'ACID multi-doc transaction: stock lock + order + cart clear' },
    { name: 'Users',     description: 'Profile, embedded addresses, wishlist' },
    { name: 'Analytics', description: 'Aggregation pipelines, Redis trending & leaderboard' },
  ],
  paths: {
    // ── Auth ──────────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name:     { type: 'string', example: 'Jane Doe' },
                  email:    { type: 'string', example: 'jane@example.com' },
                  password: { type: 'string', example: 'Password1!' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Access token returned; refresh token set as httpOnly cookie' },
          400: { description: 'Validation error' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login — rate limited (10 req / 15 min)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email:    { type: 'string', example: 'carol@xyzshope.com' },
                  password: { type: 'string', example: 'Customer1!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'accessToken + user object' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Issue new access token (reads refresh cookie)',
        responses: {
          200: { description: 'New accessToken' },
          401: { description: 'Invalid / reused refresh token' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke refresh token',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current authenticated user',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'User object (no password)' } },
      },
    },

    // ── Products ─────────────────────────────────────────────────────────────
    '/products': {
      get: {
        tags: ['Products'],
        summary: 'List products — full-text search, filters, pagination (Redis cached)',
        parameters: [
          { name: 'search',   in: 'query', schema: { type: 'string' }, description: 'Full-text search (name + description + tags)' },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Category ObjectId' },
          { name: 'minPrice', in: 'query', schema: { type: 'number' } },
          { name: 'maxPrice', in: 'query', schema: { type: 'number' } },
          { name: 'sort',     in: 'query', schema: { type: 'string', enum: ['price_asc','price_desc','newest','rating'] } },
          { name: 'page',     in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',    in: 'query', schema: { type: 'integer', default: 12 } },
        ],
        responses: { 200: { description: 'Paginated product list' } },
      },
      post: {
        tags: ['Products'],
        summary: 'Create product (admin)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'sku', 'price', 'stock', 'category'],
                properties: {
                  name:        { type: 'string', example: 'New Laptop' },
                  sku:         { type: 'string', example: 'LAP-099' },
                  price:       { type: 'number', example: 799.99 },
                  stock:       { type: 'integer', example: 10 },
                  category:    { type: 'string', example: '<category ObjectId>' },
                  description: { type: 'string', example: 'A great laptop.' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created product' } },
      },
    },
    '/products/recently-viewed': {
      get: {
        tags: ['Products'],
        summary: 'My recently viewed products — Redis List (LIFO, capped 20)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Array of products in recency order' } },
      },
    },
    '/products/{id}': {
      get: {
        tags: ['Products'],
        summary: 'Single product — fires Redis: trending +1, HyperLogLog PFADD, List LPUSH',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Product object (served from Redis cache if warm)' },
          404: { description: 'Not found' },
        },
      },
      patch: {
        tags: ['Products'],
        summary: 'Update product + invalidate Redis cache (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated product' } },
      },
      delete: {
        tags: ['Products'],
        summary: 'Soft-delete product (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/products/{id}/unique-visitors': {
      get: {
        tags: ['Products'],
        summary: 'Estimated unique visitors — Redis HyperLogLog PFCOUNT (O(1), ~0.81% error)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: '{ productId, uniqueVisitors }' } },
      },
    },

    // ── Categories ───────────────────────────────────────────────────────────
    '/categories': {
      get: {
        tags: ['Categories'],
        summary: 'All active categories (Redis cached, 300 s TTL)',
        responses: { 200: { description: 'Array of categories with parent refs' } },
      },
      post: {
        tags: ['Categories'],
        summary: 'Create category (admin)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name:        { type: 'string', example: 'Tablets' },
                  description: { type: 'string' },
                  parent:      { type: 'string', description: 'Parent category ObjectId' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created category' } },
      },
    },
    '/categories/{id}': {
      get: {
        tags: ['Categories'],
        summary: 'Single category (Redis cached)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Category object' } },
      },
      patch: {
        tags: ['Categories'],
        summary: 'Update + invalidate cache (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Soft-delete (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },

    // ── Reviews ──────────────────────────────────────────────────────────────
    '/products/{productId}/reviews': {
      get: {
        tags: ['Reviews'],
        summary: 'List reviews — sorted by rating, paginated, Redis cached 120 s',
        parameters: [
          { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page',      in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',     in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: { 200: { description: 'Paginated reviews' } },
      },
      post: {
        tags: ['Reviews'],
        summary: 'Create review — compound unique index enforces 1 review/user/product',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rating', 'title', 'body'],
                properties: {
                  rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                  title:  { type: 'string', example: 'Amazing product!' },
                  body:   { type: 'string', example: 'Exceeded all expectations.' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Review created; averageRating auto-updated on Product via post-save hook' },
          409: { description: 'Duplicate — already reviewed this product' },
        },
      },
    },
    '/products/{productId}/reviews/{reviewId}': {
      patch: {
        tags: ['Reviews'],
        summary: 'Update own review',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'reviewId',  in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Reviews'],
        summary: 'Delete review (owner or admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'reviewId',  in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/products/{productId}/reviews/{reviewId}/helpful': {
      post: {
        tags: ['Reviews'],
        summary: 'Mark review as helpful (+1 helpfulCount)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'reviewId',  in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Updated helpfulCount' } },
      },
    },

    // ── Cart ─────────────────────────────────────────────────────────────────
    '/cart/guest': {
      get: {
        tags: ['Cart'],
        summary: 'Guest cart — Redis String, 24 h TTL, cookie-tracked',
        responses: { 200: { description: 'Cart JSON or empty array' } },
      },
      delete: {
        tags: ['Cart'],
        summary: 'Clear guest cart',
        responses: { 200: { description: 'Cleared' } },
      },
    },
    '/cart/guest/items': {
      post: {
        tags: ['Cart'],
        summary: 'Add item to guest cart (no login required)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                  productId: { type: 'string' },
                  quantity:  { type: 'integer', example: 1 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated guest cart' } },
      },
    },
    '/cart': {
      get: {
        tags: ['Cart'],
        summary: 'Get authenticated cart (MongoDB)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Cart with populated product refs' } },
      },
      delete: {
        tags: ['Cart'],
        summary: 'Clear authenticated cart',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Cleared' } },
      },
    },
    '/cart/items': {
      post: {
        tags: ['Cart'],
        summary: 'Add item to authenticated cart',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                  productId: { type: 'string' },
                  quantity:  { type: 'integer', example: 2 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated cart' } },
      },
    },

    // ── Orders ───────────────────────────────────────────────────────────────
    '/orders': {
      post: {
        tags: ['Orders'],
        summary: 'Place order — ACID multi-doc transaction (rate limited: 20 req/hr)',
        description:
          'Wraps in a MongoDB session: (1) lock stock with $inc, (2) insert Order, (3) clear Cart. All-or-nothing. Post-commit fires inventory event + Redis leaderboard + trending score.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['shippingAddress', 'paymentMethod'],
                properties: {
                  shippingAddress: {
                    type: 'object',
                    properties: {
                      fullName:   { type: 'string', example: 'Carol Customer' },
                      address:    { type: 'string', example: '123 Main St' },
                      city:       { type: 'string', example: 'Singapore' },
                      postalCode: { type: 'string', example: '600001' },
                      country:    { type: 'string', example: 'Singapore' },
                      phone:      { type: 'string', example: '+6598765432' },
                    },
                  },
                  paymentMethod: { type: 'string', example: 'cod' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Order created; stock atomically decremented' },
          400: { description: 'Cart empty or insufficient stock' },
        },
      },
    },
    '/orders/my': {
      get: {
        tags: ['Orders'],
        summary: 'My orders (paginated)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page',  in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: { 200: { description: 'Paginated orders' } },
      },
    },
    '/orders/{id}': {
      get: {
        tags: ['Orders'],
        summary: 'Single order',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Order object' } },
      },
    },
    '/orders/{id}/cancel': {
      patch: {
        tags: ['Orders'],
        summary: 'Cancel order — restores stock, appends inventory return event',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Cancelled' } },
      },
    },
    '/orders/{id}/status': {
      patch: {
        tags: ['Orders'],
        summary: 'Update order status (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status:        { type: 'string', enum: ['confirmed','processing','shipped','delivered'] },
                  trackingNumber:{ type: 'string', example: 'SG123456789' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' } },
      },
    },

    // ── Users ─────────────────────────────────────────────────────────────────
    '/users/profile': {
      get: {
        tags: ['Users'],
        summary: 'Full profile with populated wishlist',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'User document' } },
      },
      patch: {
        tags: ['Users'],
        summary: 'Update name / payment preferences',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name:               { type: 'string' },
                  paymentPreferences: { type: 'object' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated user' } },
      },
    },
    '/users/addresses': {
      get: {
        tags: ['Users'],
        summary: 'Get addresses (embedded array on User document)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Addresses array' } },
      },
      post: {
        tags: ['Users'],
        summary: 'Add address ($push to embedded array)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['label', 'fullName', 'address', 'city', 'postalCode', 'country'],
                properties: {
                  label:      { type: 'string', example: 'Home' },
                  fullName:   { type: 'string', example: 'Carol Customer' },
                  address:    { type: 'string', example: '456 Orchard Rd' },
                  city:       { type: 'string', example: 'Singapore' },
                  postalCode: { type: 'string', example: '238888' },
                  country:    { type: 'string', example: 'Singapore' },
                  phone:      { type: 'string', example: '+6591234567' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Address added' } },
      },
    },
    '/users/addresses/{addressId}': {
      patch: {
        tags: ['Users'],
        summary: 'Update address (MongoDB positional $ operator)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'addressId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Users'],
        summary: 'Remove address ($pull from embedded array)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'addressId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Removed' } },
      },
    },
    '/users/wishlist': {
      get: {
        tags: ['Users'],
        summary: 'Wishlist — populated product refs',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Array of products' } },
      },
    },
    '/users/wishlist/{productId}': {
      post: {
        tags: ['Users'],
        summary: 'Add to wishlist ($addToSet — no duplicates)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated wishlist' } },
      },
      delete: {
        tags: ['Users'],
        summary: 'Remove from wishlist ($pull)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Removed' } },
      },
    },

    // ── Analytics ─────────────────────────────────────────────────────────────
    '/analytics/trending': {
      get: {
        tags: ['Analytics'],
        summary: 'Top 10 trending — Redis Sorted Set ZREVRANGE (public)',
        responses: { 200: { description: 'Array of { product, score }' } },
      },
    },
    '/analytics/sales/monthly': {
      get: {
        tags: ['Analytics'],
        summary: 'Monthly revenue — MongoDB aggregation pipeline (admin)',
        description: '$match delivered/shipped → $group by year/month → $sort',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Array of { year, month, revenue, orderCount }' } },
      },
    },
    '/analytics/sales/daily': {
      get: {
        tags: ['Analytics'],
        summary: 'Daily sales last 30 days — aggregation with $dateFromParts (admin)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Array of { date, revenue, orders }' } },
      },
    },
    '/analytics/products/top': {
      get: {
        tags: ['Analytics'],
        summary: 'Top products by revenue — $unwind + $group + $lookup (admin)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Array of { name, totalRevenue, unitsSold }' } },
      },
    },
    '/analytics/products/low-stock': {
      get: {
        tags: ['Analytics'],
        summary: 'Products at or below stock threshold (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'threshold', in: 'query', schema: { type: 'integer', default: 10 } }],
        responses: { 200: { description: 'Array of low-stock products' } },
      },
    },
    '/analytics/leaderboard/buyers': {
      get: {
        tags: ['Analytics'],
        summary: 'Top buyers — Redis Sorted Set ZREVRANGE leaderboard:buyers:{month} (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'month', in: 'query', schema: { type: 'string', example: '2026-06' }, description: 'YYYY-MM — defaults to current month' }],
        responses: { 200: { description: 'Array of { userId, amount }' } },
      },
    },
    '/analytics/inventory/{productId}': {
      get: {
        tags: ['Analytics'],
        summary: 'Inventory event history — append-only log (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Paginated inventory events' } },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'XYZ Shope API — DBS302',
      swaggerOptions: { persistAuthorization: true },
    })
  );
}
