<p align="center">
  <img src="logo.png" alt="Fauxbase" width="200" />
</p>

<h1 align="center">Fauxbase</h1>

<p align="center"><strong>Build the frontend first. The backend can come later.</strong></p>

<p align="center">
  <a href="https://fauxbase.kakrizky.dev/docs/introduction">Docs</a> ·
  <a href="https://github.com/rizkyandriawan/fauxbase">GitHub</a> ·
  <a href="https://www.npmjs.com/package/fauxbase">npm</a>
</p>

---

Fauxbase is a drop-in fake backend for frontend development. It gives you CRUD, filtering, auth, and real-time events — all running locally in the browser. When your real API is ready, change one config line. No component changes. No `if (isDev)` anywhere.

```
npm install fauxbase
```

## 30-Second Example

```ts
import { Entity, field, Service, createClient, seed } from 'fauxbase';

class Product extends Entity {
  @field({ required: true })  name!: string;
  @field({ min: 0 })          price!: number;
  @field({ default: 0 })      stock!: number;
}

class ProductService extends Service<Product> {
  entity = Product;
  endpoint = '/products';
}

const fb = createClient({
  services: { product: ProductService },
  seeds: [seed(Product, [
    { name: 'Hair Clay', price: 185000, stock: 50 },
    { name: 'Beard Oil', price: 125000, stock: 30 },
  ])],
});

// This works right now. No backend needed.
const result = await fb.product.list({
  filter: { price__gte: 100000 },
  sort: { field: 'price', direction: 'desc' },
  page: 1, size: 20,
});
```

Later, when your API is ready:

```ts
const fb = createClient({
  driver: { type: 'http', baseUrl: '/api', preset: 'spring-boot' },
  services: { product: ProductService },
});

// Same code. Same components. Real backend.
```

---

## Why Fauxbase

**The old way:**

```
AI generates your UI
  → fetch('/api/products') — backend doesn't exist yet
  → hardcode mock data
  → hack Array.filter() for search
  → fake auth with useState
  → backend arrives → rewrite everything
```

**With Fauxbase:**

```
AI generates your UI
  → Fauxbase handles it all locally
  → backend arrives → change one line
  → done
```

Your app code never knows whether the backend is fake. No `if (isDev)`. No mock files. No rewrite.

---

## How It Works

```
  Development                     Production

  Your App                        Your App
     ↓                               ↓
  Fauxbase                        Fauxbase
     ↓                               ↓
  Local Driver                    HTTP Driver
  (memory/localStorage/IndexedDB)    ↓
                                  Your Backend API
```

Components always talk to Fauxbase. Fauxbase talks to a driver. The driver is swappable.

---

## Features

### Query Engine — 13 Operators

Every operator works identically on local and HTTP drivers.

```ts
const result = await fb.product.list({
  filter: {
    price__gte: 100000,
    name__contains: 'pomade',
    categoryId__in: ['cat-1', 'cat-2'],
    stock__between: [10, 100],
    isActive: true,
  },
  sort: { field: 'price', direction: 'desc' },
  page: 1,
  size: 20,
});
```

| Operator | Syntax | Example |
|----------|--------|---------|
| `eq` | `field` or `field__eq` | `{ isActive: true }` |
| `ne` | `field__ne` | `{ status__ne: 'deleted' }` |
| `gt` | `field__gt` | `{ price__gt: 100 }` |
| `gte` | `field__gte` | `{ price__gte: 100 }` |
| `lt` | `field__lt` | `{ stock__lt: 10 }` |
| `lte` | `field__lte` | `{ stock__lte: 100 }` |
| `like` | `field__like` | `{ name__like: 'hair' }` |
| `contains` | `field__contains` | `{ name__contains: 'hair' }` |
| `startswith` | `field__startswith` | `{ name__startswith: 'ha' }` |
| `endswith` | `field__endswith` | `{ email__endswith: '@gmail.com' }` |
| `between` | `field__between` | `{ price__between: [100, 500] }` |
| `in` | `field__in` | `{ status__in: ['active', 'pending'] }` |
| `isnull` | `field__isnull` | `{ deletedAt__isnull: true }` |

### Services & Lifecycle Hooks

```ts
class ProductService extends Service<Product> {
  entity = Product;
  endpoint = '/products';

  @beforeCreate()
  ensureUniqueName(data: Partial<Product>, existing: Product[]) {
    if (existing.some(p => p.name === data.name)) {
      throw new ConflictError(`Product "${data.name}" already exists`);
    }
  }
}
```

Every service gets: `list`, `get`, `create`, `update`, `delete`, `count`, `bulk.create`, `bulk.update`, `bulk.delete`, `request`.

### Auth Simulation

```ts
const fb = createClient({
  services: { product: ProductService },
  auth: UserAuth,
});

await fb.auth.register({ name: 'Alice', email: 'alice@test.com', password: 'secret' });
await fb.auth.login({ email: 'alice@test.com', password: 'secret' });

fb.auth.isLoggedIn;       // true
fb.auth.currentUser;      // { id, email, name }
fb.auth.hasRole('admin'); // false
fb.auth.token;            // mock JWT

// Auto-injection — createdById set automatically on every create
const { data } = await fb.product.create({ name: 'Pomade', price: 150000 });
data.createdByName; // → 'Alice'
```

Auth state persists to `localStorage` — survives page refresh. With HTTP driver, `login()` and `register()` POST to your real auth endpoints. The token is injected into all subsequent requests.

#### Refresh Token

```ts
// Local driver: tokens auto-refresh before expiry (1h TTL)
fb.auth.token;          // current access token
fb.auth.refreshToken;   // refresh token
fb.auth.expiresAt;      // expiry timestamp
fb.auth.isExpired;      // true if token expired

// Manual refresh
await fb.auth.refresh();

// HTTP driver: auto-refreshes on 401
// Configure refresh URL in preset:
const myPreset = definePreset({
  auth: {
    loginUrl: '/auth/login',
    registerUrl: '/auth/register',
    refreshUrl: '/auth/refresh',       // POST with { refreshToken }
    tokenField: 'token',
    refreshTokenField: 'refreshToken', // field in refresh response
    expiresInField: 'expiresIn',       // seconds until expiry
    userField: 'user',
    headerFormat: 'Bearer {token}',
  },
  // ...
});
```

On 401, the HTTP driver automatically calls the refresh endpoint, gets a new token, and retries the failed request. If refresh fails, it logs the user out.

### Latency & Error Simulation

Test how your UI handles slow networks and failures:

```ts
const fb = createClient({
  driver: {
    type: 'local',
    latency: 200,                   // fixed 200ms delay
    // latency: { min: 50, max: 500 }, // random range
    errorRate: 0.1,                 // 10% of requests fail randomly
  },
  services: { product: ProductService },
});
```

Your loading spinners, error boundaries, and retry logic — test them all without touching the network.

### React / Vue / Svelte Hooks

```
npm install fauxbase-react    # or fauxbase-vue, fauxbase-svelte
```

```tsx
import { useList, useMutation } from 'fauxbase-react';

function ProductList() {
  const { items, loading, meta } = useList(fb.product, {
    filter: { isActive: true },
    sort: { field: 'price', direction: 'desc' },
  });
  const { create } = useMutation(fb.product);

  if (loading) return <p>Loading...</p>;
  return items.map(p => <div key={p.id}>{p.name}</div>);
}
```

Same API across React (`useList`), Vue (`useList` returning `Ref<>`), and Svelte (`useList` returning `Readable<>`). Mutations auto-invalidate queries.

### Real-Time Events

```ts
const fb = createClient({
  services: { todo: TodoService },
  events: true, // local events on mutations
});

fb._eventBus.on('todo', (event) => {
  console.log(event.action, event.data); // 'created', { id, ... }
});
```

For server-pushed events, connect via SSE or STOMP (WebSocket):

```ts
events: {
  source: {
    type: 'sse',
    url: '/api/events',
    eventMap: { 'todo-changed': 'todo' },
  },
}
```

Remote events auto-invalidate `useList`/`useGet` hooks. No manual wiring.

### Custom Endpoints

Call non-CRUD endpoints. Method defaults to GET (no body) or POST (with body):

```ts
class PaymentService extends Service<Payment> {
  entity = Payment;
  endpoint = '/payments';

  async charge(amount: number) {
    return this.request<{ transactionId: string }>('/charge', {
      body: { amount },  // has body → POST
      local: () => ({ transactionId: `fake-${Date.now()}` }),
    });
  }

  async stats() {
    return this.request<{ revenue: number }>('/stats');  // no body → GET
  }
}

await fb.payment.charge(50000);
// Local  → runs the callback
// HTTP   → POST /payments/charge

await fb.payment.stats();
// HTTP   → GET /payments/stats
```

All presets auto-unwrap `{ success, data: { ... } }` response wrappers — works with both flat and wrapped responses.

### HTTP Driver + Backend Presets

```ts
const fb = createClient({
  driver: {
    type: 'http',
    baseUrl: 'https://api.example.com',
    preset: 'spring-boot',
    timeout: 10000,
    retry: { maxRetries: 3, baseDelay: 300 },
  },
  services: { product: ProductService },
});
```

| Preset | Framework | Filter Style |
|--------|-----------|-------------|
| `default` | Generic REST | `?price__gte=100` |
| `spring-boot` | Spring Boot | `?price.gte=100` |
| `nestjs` | NestJS | `?filter.price.$gte=100` |
| `laravel` | Laravel | `?filter[price_gte]=100` |
| `django` | Django REST | `?price__gte=100` |
| `express` | Express.js | `?price__gte=100` |

Custom presets supported via `definePreset()`.

### Hybrid Mode

Migrate one service at a time:

```ts
const fb = createClient({
  driver: { type: 'local' },
  services: { product: ProductService, order: OrderService, cart: CartService },
  overrides: {
    product: { driver: { type: 'http', baseUrl: '/api', preset: 'spring-boot' } },
  },
});
// Products → real API. Orders & cart → still local.
```

### DevTools

```tsx
import { FauxbaseDevtools } from 'fauxbase-devtools';

<FauxbaseDevtools client={fb} />
```

Floating panel to inspect data, auth state, request logs, and seed data. Proxy-based — zero overhead when not rendered.

### CLI

```
npx fauxbase-cli init
```

Scaffolds entities, services, seeds, and framework-specific setup in seconds.

---

## Perfect for AI-Generated Apps

AI tools (Claude, Cursor, v0) generate frontends that call APIs. But the API doesn't exist yet.

```
Claude generates:  fetch('/api/products')
                   fetch('/api/users')
                   fetch('/api/orders')
```

These fail immediately. The usual fix: mock data, `if (isDev)` blocks, mock servers.

With Fauxbase:

```ts
const fb = createClient({
  services: { product: ProductService, user: UserService, order: OrderService },
});
// Everything works. Locally. Right now.
```

When the real backend arrives:

```ts
driver: { type: 'http', baseUrl: '/api' }
// Done. No code changes.
```

**Your app code should not know whether the backend is fake.** That's the entire philosophy.

---

## Migration Timeline

```
Week 1     Install Fauxbase, define entities/services/seeds.
           Build UI with local driver. Everything works.

Week 2-4   Build features at full speed.
           No blocking on backend. No mock data spaghetti.

Week 5     "Products API is ready"
           → Switch products to HTTP driver (hybrid mode)
           → Zero component changes

Week 6     "All APIs ready"
           → Set driver to HTTP → done
```

---

## Packages

```
npm install fauxbase          # core (required)
npm install fauxbase-react    # react hooks
npm install fauxbase-vue      # vue composables
npm install fauxbase-svelte   # svelte stores
npm install fauxbase-devtools # devtools panel
npm install fauxbase-cli      # project scaffolder
```

---

## Roadmap

- [x] **v0.1** — Core: Entity, Service, QueryEngine, LocalDriver, Seeds
- [x] **v0.2** — React hooks + Auth simulation
- [x] **v0.3** — HTTP Driver + Backend Presets + Hybrid Mode + DevTools
- [x] **v0.4** — IndexedDB + CLI + Vue/Svelte adapters
- [x] **v0.5** — Real-Time Events + Custom Endpoints + Latency/Error Simulation

---

## License

MIT
