<p align="center">
  <img src="logo.png" alt="Fauxbase" width="200" />
</p>

<h1 align="center">Fauxbase</h1>

<p align="center"><strong>Start with fake. Ship with real. Change nothing.</strong></p>

Fauxbase is a frontend data layer that simulates your backend during development, then connects to your real API without changing your components.

```
npm install fauxbase          # core
npm install fauxbase-react    # react hooks (optional)
npm install fauxbase-vue      # vue composables (optional)
npm install fauxbase-svelte   # svelte stores (optional)
npm install fauxbase-devtools # devtools panel (optional)
```

Or scaffold a new project instantly:

```
npx fauxbase-cli init
```

---

## 15-Second Example

Define your data:

```ts
class Product extends Entity {
  @field({ required: true })  name!: string;
  @field({ min: 0 })          price!: number;
  @field({ default: 0 })      stock!: number;
}
```

Use it:

```ts
const fb = createClient({
  services: { product: ProductService },
  seeds: [seed(Product, [
    { name: 'Hair Clay', price: 185000, stock: 50 },
    { name: 'Beard Oil', price: 125000, stock: 30 },
  ])],
});

// Filter, sort, paginate — all work locally
const result = await fb.product.list({
  filter: { price__gte: 100000 },
  sort: { field: 'price', direction: 'desc' },
  page: 1, size: 20,
});
```

That's it.

- Works locally with fake data
- Switch to real backend later
- No component changes

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

Components always talk to Fauxbase. Fauxbase talks to a driver. The driver is swappable. Your components never know whether they're hitting localStorage or a REST API.

---

## The Problem

Every frontend project does this:

```
Step 1: Backend not ready         → hardcode mock data
Step 2: Mock data grows           → copy-paste everywhere
Step 3: Need filtering            → hack together Array.filter()
Step 4: Need pagination           → hack together Array.slice()
Step 5: Need auth                 → fake login with useState
Step 6: Backend arrives           → rewrite everything
```

Existing tools don't solve this:

| Tool | What it does | The gap |
|------|-------------|---------|
| **MSW** | Intercepts HTTP | No query engine, no auth, mocks transport not data |
| **json-server** | Fake REST from JSON | No query operators, no hooks, separate process |
| **MirageJS** | In-browser server | Limited operators, no typed entities, largely abandoned |
| **Zustand/Redux** | State management | No CRUD contract, no query engine, no migration path |

**Fauxbase removes the rewrite.**

---

## The Key Idea

Fauxbase runs your backend contract in the browser.

Entities define your data model. Services define business logic. A query engine handles filtering, sorting, and pagination.

During development, it runs locally. When your backend is ready, it forwards the same calls to your API.

---

## Core Features

- Entity system with decorators (`@field`, `@relation`, `@computed`)
- Service layer with lifecycle hooks (`@beforeCreate`, `@afterUpdate`, ...)
- 13 query operators (`eq`, `gte`, `contains`, `between`, `in`, ...)
- Auth simulation (`AuthService`, login/register/logout, role checks)
- Auto-injection of `createdById`/`updatedById` when authenticated
- React hooks (`useList`, `useGet`, `useMutation`, `useAuth`, `useEvent`)
- Vue 3 composables (same API as React hooks)
- Svelte stores (same API, uses `writable`/`readable`)
- Real-time events (EventBus, SSE, STOMP/WebSocket)
- Custom endpoints (`service.request()` for non-CRUD calls)
- CLI scaffolder (`npx fauxbase-cli init`)
- Seed data with deterministic IDs
- Local driver (memory / localStorage / IndexedDB)
- HTTP driver for real backends (with retry, timeout, error mapping)
- Hybrid mode for gradual migration
- Backend presets (Spring Boot, NestJS, Laravel, Django, Express)
- DevTools panel for inspecting data, auth, and requests
- Zero runtime dependencies (~8KB gzipped)

---

## Switching to Real Backend

When your API is ready, change one line:

```ts
// Before: local driver (default)
const fb = createClient({
  services: { product: ProductService },
});

// After: HTTP driver
const fb = createClient({
  driver: { type: 'http', baseUrl: '/api', preset: 'spring-boot' },
  services: { product: ProductService },
});
```

Every component stays the same. Every query operator maps to your backend's filter syntax.

---

## Hybrid Mode

Migrate one service at a time:

```ts
const fb = createClient({
  driver: { type: 'local' },
  services: { product: ProductService, order: OrderService, cart: CartService },

  overrides: {
    product: { driver: { type: 'http', baseUrl: '/api', preset: 'spring-boot' } },
  },
});
```

Products use the real API. Orders and cart stay local. Migrate at your own pace.

---

## Backend Presets

Presets tell the HTTP driver how to serialize queries and parse responses for your backend framework.

| Preset | Framework | Filter Style | Page Indexing |
|--------|-----------|-------------|---------------|
| `default` | Generic REST | `?price__gte=100` | 1-indexed |
| `spring-boot` | Spring Boot | `?price.gte=100` | 0-indexed |
| `nestjs` | NestJS | `?filter.price.$gte=100` | 1-indexed |
| `laravel` | Laravel | `?filter[price_gte]=100` | 1-indexed |
| `django` | Django REST | `?price__gte=100` | 1-indexed |
| `express` | Express.js | `?price__gte=100` | 1-indexed |

### Custom Presets

```ts
import { definePreset } from 'fauxbase';

const myPreset = definePreset({
  name: 'my-backend',
  response: {
    single: (raw) => ({ data: raw.result }),
    list: (raw) => ({ items: raw.results, meta: raw.pagination }),
    error: (raw) => ({ error: raw.message, code: raw.code }),
  },
  meta: { page: 'page', size: 'limit', totalItems: 'total', totalPages: 'pages' },
  query: {
    filterStyle: 'django',
    pageParam: 'page',
    sizeParam: 'limit',
    sortParam: 'order_by',
    sortFormat: 'field,direction',
  },
  auth: {
    loginUrl: '/auth/login',
    registerUrl: '/auth/register',
    tokenField: 'access_token',
    userField: 'user',
    headerFormat: 'Bearer {token}',
  },
});

const fb = createClient({
  driver: { type: 'http', baseUrl: '/api', preset: myPreset },
  services: { product: ProductService },
});
```

---

## HTTP Driver Options

```ts
const fb = createClient({
  driver: {
    type: 'http',
    baseUrl: 'https://api.example.com',
    preset: 'spring-boot',
    timeout: 10000,                        // 10s (default: 30s)
    retry: { maxRetries: 3, baseDelay: 300 }, // exponential backoff for 5xx
    headers: { 'X-API-Key': 'my-key' },    // custom headers on every request
  },
  services: { product: ProductService },
});
```

Error mapping:

| HTTP Status | Fauxbase Error |
|-------------|---------------|
| 400, 422 | `ValidationError` |
| 401, 403 | `ForbiddenError` |
| 404 | `NotFoundError` |
| 409 | `ConflictError` |
| 5xx | `HttpError` (with retry) |
| Network failure | `NetworkError` |
| Timeout | `TimeoutError` |

---

## AI Prototypes → Production

Many AI-generated prototypes hardcode arrays:

```ts
const products = [
  { name: 'Hair Clay', price: 185000 },
  { name: 'Beard Oil', price: 125000 },
];
```

When the prototype becomes real, engineers must rewrite the data layer.

Fauxbase lets prototypes start with a real data contract:

```
Claude / Cursor prototype
         ↓
Fauxbase local driver (works immediately)
         ↓
Real backend later (no rewrite)
```

---

## Query Engine — 13 Operators

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

---

## Services & Hooks

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

  async getByCategory(categoryId: string) {
    return this.list({
      filter: { categoryId, isActive: true },
      sort: { field: 'name', direction: 'asc' },
    });
  }
}
```

Every service gets: `list`, `get`, `create`, `update`, `delete`, `count`, `bulk.create`, `bulk.update`, `bulk.delete`, `request`.

---

## Custom Endpoints

Need to call a non-CRUD endpoint like `POST /products/import` or `POST /payment/charge`? Use `service.request()`:

```ts
// POST to /products/import
const result = await fb.product.request('/import', {
  method: 'POST',
  body: { csvUrl: 'https://example.com/products.csv' },
});

// GET with query params
const stats = await fb.product.request('/stats', {
  method: 'GET',
  query: { period: '30d' },
});

// Default method is POST
const receipt = await fb.payment.request('/charge', {
  body: { amount: 50000, currency: 'IDR' },
});
```

The URL is built from the service's registered endpoint + the path you provide. Auth headers are injected automatically.

### Local mode — `local` handler

On local driver there's no backend to call. Provide a `local` callback as a fallback:

```ts
class PaymentService extends Service<Payment> {
  entity = Payment;
  endpoint = '/payments';

  async charge(amount: number) {
    return this.request<{ transactionId: string }>('/charge', {
      method: 'POST',
      body: { amount },
      local: () => ({
        transactionId: `fake-${Date.now()}`,
      }),
    });
  }
}

// Works on both drivers:
const result = await fb.payment.charge(50000);
// Local  → runs the `local` callback
// HTTP   → POST /payments/charge { amount: 50000 }
```

If no `local` handler is provided and you're on the local driver, it throws a descriptive error.

---

## Auth

Simulate login, registration, and role-based access during development. When your real auth backend is ready, the same API works over HTTP.

```ts
class User extends Entity {
  @field({ required: true }) name!: string;
  @field({ required: true }) email!: string;
  @field({ required: true }) password!: string;
  @field({ default: 'user' }) role!: string;
}

class UserAuth extends AuthService<User> {
  entity = User;
  endpoint = '/users';
}

const fb = createClient({
  services: { product: ProductService },
  auth: UserAuth,
});

// Register & login
await fb.auth.register({ name: 'Alice', email: 'alice@test.com', password: 'secret' });
await fb.auth.login({ email: 'alice@test.com', password: 'secret' });

// Check state
fb.auth.isLoggedIn;   // true
fb.auth.currentUser;  // { id, email }
fb.auth.hasRole('admin'); // false
fb.auth.token;        // mock JWT (base64)

// Auto-injection — createdById/updatedById set automatically
const { data } = await fb.product.create({ name: 'Pomade', price: 150000 });
data.createdById; // → user's ID
data.createdByName; // → 'Alice'

fb.auth.logout();
```

With HTTP driver, `login()` and `register()` POST to the preset's auth endpoints. The token from the server response is injected into all subsequent requests as `Authorization: Bearer <token>`.

---

## React Hooks

`fauxbase-react` provides hooks that connect your React components to Fauxbase services.

```
npm install fauxbase-react
```

### Setup

```tsx
import { FauxbaseProvider } from 'fauxbase-react';

function App() {
  return (
    <FauxbaseProvider client={fb}>
      <ProductList />
    </FauxbaseProvider>
  );
}
```

### useList — fetch collections

```tsx
import { useList } from 'fauxbase-react';

function ProductList() {
  const { items, loading, error, meta, refetch } = useList(fb.product, {
    filter: { isActive: true },
    sort: { field: 'price', direction: 'desc' },
    page: 1,
    size: 20,
  });

  if (loading) return <p>Loading...</p>;
  return items.map(p => <div key={p.id}>{p.name}</div>);
}
```

Options: `enabled` (skip fetch), `refetchInterval` (polling in ms).

### useGet — fetch single record

```tsx
import { useGet } from 'fauxbase-react';

function ProductDetail({ id }: { id: string }) {
  const { data, loading, error } = useGet(fb.product, id);
  if (loading) return <p>Loading...</p>;
  return <h1>{data?.name}</h1>;
}
```

Pass `null` as id to skip fetching.

### useMutation — create, update, delete

```tsx
import { useMutation } from 'fauxbase-react';

function CreateProduct() {
  const { create, loading, error } = useMutation(fb.product);

  const handleSubmit = async () => {
    await create({ name: 'New Product', price: 100000 });
    // useList hooks on the same service auto-refetch
  };
}
```

Returns `{ create, update, remove, loading, error }`. Mutations automatically invalidate all `useList` subscribers on the same service.

### useAuth — auth state in React

```tsx
import { useAuth } from 'fauxbase-react';

function LoginPage() {
  const { user, isLoggedIn, login, logout, register, hasRole, loading } = useAuth();

  const handleLogin = async () => {
    await login({ email: 'alice@test.com', password: 'secret' });
  };

  if (isLoggedIn) return <p>Welcome, {user.email}</p>;
  return <button onClick={handleLogin}>Login</button>;
}
```

### useFauxbase — raw client access

```tsx
import { useFauxbase } from 'fauxbase-react';

function Dashboard() {
  const fb = useFauxbase();
  // fb.product, fb.auth, etc.
}
```

---

## DevTools

`fauxbase-devtools` provides a floating panel for inspecting your Fauxbase instance during development.

```
npm install fauxbase-devtools
```

```tsx
import { FauxbaseDevtools } from 'fauxbase-devtools';

function App() {
  return (
    <FauxbaseProvider client={fb}>
      <ProductList />
      {process.env.NODE_ENV === 'development' && (
        <FauxbaseDevtools client={fb} />
      )}
    </FauxbaseProvider>
  );
}
```

### Panels

| Panel | What it shows |
|-------|--------------|
| **Data** | Browse records per service |
| **Auth** | Current auth state + logout button |
| **Requests** | Chronological log of all service method calls with timing |
| **Seeds** | Reset seed data per resource (LocalDriver only) |

### Configuration

```tsx
<FauxbaseDevtools
  client={fb}
  config={{
    position: 'bottom-left',     // default: 'bottom-right'
    defaultOpen: true,           // default: false
    maxLogEntries: 200,          // default: 100
  }}
/>
```

The request logger uses `Proxy` to wrap service methods — zero changes to the Service class, zero overhead when devtools is not rendered.

---

## IndexedDB Storage

For persistent local data that survives page refreshes without needing `localStorage` size limits:

```ts
const fb = createClient({
  driver: { type: 'local', persist: 'indexeddb' },
  services: { product: ProductService },
});
await fb.ready; // Wait for IndexedDB to load
```

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `persist` | `'memory'` | `'memory'`, `'localStorage'`, or `'indexeddb'` |
| `dbName` | `'fauxbase'` | Custom IndexedDB database name |

The IndexedDB backend uses a memory-cached, write-through strategy: all data is loaded into memory on init (behind `fb.ready`), then writes are synchronously reflected in memory and asynchronously persisted to IndexedDB. This means reads are always fast and the synchronous `StorageBackend` interface is preserved.

For memory and localStorage drivers, `fb.ready` resolves immediately.

---

## Vue Composables

`fauxbase-vue` provides Vue 3 Composition API equivalents of the React hooks.

```
npm install fauxbase-vue
```

### Setup

```ts
// main.ts
import { FauxbasePlugin } from 'fauxbase-vue';
import { fb } from './fauxbase';

const app = createApp(App);
app.use(FauxbasePlugin, { client: fb });
```

### Usage

```vue
<script setup>
import { useList, useMutation, useAuth } from 'fauxbase-vue';

const { items, loading, error, meta, refetch } = useList(fb.product, {
  filter: { isActive: true },
  sort: { field: 'price', direction: 'desc' },
});

const { create, update, remove } = useMutation(fb.product);

// items, loading, error, meta are Vue Ref<> values
</script>
```

All hooks: `useList`, `useGet`, `useMutation`, `useAuth`, `useFauxbase`.

Returns are `Ref<>` values — use `.value` in script, automatic unwrapping in templates. Mutations auto-invalidate `useList` subscribers.

---

## Svelte Stores

`fauxbase-svelte` provides Svelte store-based equivalents. Compatible with Svelte 4 and 5.

```
npm install fauxbase-svelte
```

### Setup

```svelte
<!-- +layout.svelte -->
<script>
  import { setFauxbaseContext } from 'fauxbase-svelte';
  import { fb } from './fauxbase';

  setFauxbaseContext(fb);
</script>

<slot />
```

### Usage

```svelte
<script>
  import { useList, useMutation } from 'fauxbase-svelte';

  const { items, loading, error } = useList(fb.product, {
    filter: { isActive: true },
  });

  const { create } = useMutation(fb.product);
</script>

{#if $loading}
  <p>Loading...</p>
{:else}
  {#each $items as product}
    <div>{product.name}</div>
  {/each}
{/if}
```

All hooks: `useList`, `useGet`, `useMutation`, `useAuth`, `useFauxbase`.

Returns are Svelte `Readable<>` stores — use `$store` syntax in templates. Mutations auto-invalidate `useList` subscribers.

---

## Real-Time Events

Fauxbase includes an opt-in event system. Local mutations auto-emit events. For server-pushed events, connect via SSE or STOMP (WebSocket).

### Enable local events

```ts
const fb = createClient({
  services: { todo: TodoService },
  events: true,
});

// Listen to events
fb._eventBus.on('todo', (event) => {
  console.log(event.action, event.data); // 'created', { id, ... }
});

// Or listen to all events
fb._eventBus.onAny((event) => {
  console.log(event.resource, event.action);
});
```

### SSE (Server-Sent Events)

```ts
const fb = createClient({
  driver: { type: 'http', baseUrl: '/api' },
  services: { todo: TodoService },
  events: {
    source: {
      type: 'sse',
      url: '/api/events',
      eventMap: { 'todo-changed': 'todo' },
    },
  },
});
```

### STOMP (WebSocket)

Requires `@stomp/stompjs` as a peer dependency.

```ts
const fb = createClient({
  driver: { type: 'http', baseUrl: '/api' },
  services: { todo: TodoService },
  events: {
    source: {
      type: 'stomp',
      brokerUrl: 'wss://api.example.com/ws',
      subscriptions: { '/topic/todos': 'todo' },
    },
  },
});
```

### Authentication

When `auth` is configured, STOMP automatically injects `Authorization: Bearer <token>` into connection headers. Both SSE and STOMP reconnect on login/logout so the connection always uses the current token.

```ts
const fb = createClient({
  driver: { type: 'http', baseUrl: '/api' },
  services: { todo: TodoService },
  auth: UserAuth,
  events: {
    source: {
      type: 'stomp',
      brokerUrl: 'wss://api.example.com/ws',
      subscriptions: { '/topic/todos': 'todo' },
      // No need to set connectHeaders — token is injected automatically
    },
  },
});

// After login, STOMP reconnects with the new token
await fb.auth.login({ email: 'alice@test.com', password: 'secret' });

// After logout, STOMP reconnects without token
fb.auth.logout();
```

### Custom handlers

```ts
const fb = createClient({
  services: { todo: TodoService },
  events: {
    handlers: {
      todo: (event) => console.log('Todo changed:', event),
    },
  },
});
```

### useEvent hook (React / Vue / Svelte)

```tsx
import { useEvent } from 'fauxbase-react'; // or fauxbase-vue, fauxbase-svelte

function TodoList() {
  useEvent('todo', (event) => {
    toast(`Todo ${event.action}!`);
  });

  // Also accepts a service instance
  useEvent(fb.todo, (event) => { ... });
}
```

### Auto-invalidation

Remote events (from SSE/STOMP) automatically trigger refetches in `useList`/`useGet` hooks. No manual wiring needed.

### Event type

```ts
interface FauxbaseEvent<T = any> {
  action: 'created' | 'updated' | 'deleted' | 'bulkCreated' | 'bulkUpdated' | 'bulkDeleted';
  resource: string;
  data?: T;
  id?: string;
  ids?: string[];
  timestamp: number;
  source: 'local' | 'remote';
}
```

### Cleanup

```ts
fb.disconnect(); // Closes SSE/STOMP connection and clears all listeners
```

---

## CLI

`fauxbase-cli` scaffolds a new Fauxbase project with entities, services, seeds, and framework-specific setup.

```
npx fauxbase-cli init
```

### Interactive prompts

1. **Framework?** — React / Vue / Svelte / None
2. **Output directory?** — default `src/fauxbase/`
3. **Sample entity (Todo)?** — Y/N
4. **Authentication?** — Y/N
5. **Storage?** — memory / localStorage / IndexedDB

### Generated structure

```
src/fauxbase/
  entities/todo.ts, user.ts
  services/todo.ts, user.ts
  seeds/todo.ts, user.ts
  index.ts              # createClient call
```

After scaffolding, the CLI prints the `npm install` command and framework-specific setup instructions.

---

## Seeding

Seed data has deterministic IDs. Runtime data has UUIDs. They never collide.

```ts
const productSeed = seed(Product, [
  { name: 'Hair Clay', price: 185000, stock: 50 },   // → seed:product:0
  { name: 'Beard Oil', price: 125000, stock: 30 },   // → seed:product:1
]);
```

- Seeds auto-apply on first load
- Fauxbase tracks a version hash — if seeds change, only seed records are re-applied
- Runtime records are never touched during re-seeding
- On HTTP driver, seeding is disabled — the backend owns the data

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
           → Set VITE_API_URL → done
```

---

## Who This Is For

- Frontend teams waiting for backend APIs
- Solo devs building full-stack apps
- Prototypers using AI coding tools
- Teams building UI before backend is ready

---

## Roadmap

- [x] **v0.1** — Core: Entity, Service, QueryEngine, LocalDriver, Seeds
- [x] **v0.2** — React hooks (`useList`, `useGet`, `useMutation`, `useAuth`) + Auth simulation
- [x] **v0.3** — HTTP Driver + Backend Presets + Hybrid Mode + DevTools
- [x] **v0.4** — IndexedDB + CLI (`npx fauxbase-cli init`) + Vue/Svelte adapters
- [x] **v0.5** — Real-Time Events (EventBus, SSE, STOMP) + `useEvent` hook + auto-invalidation + Custom Endpoints (`service.request()`)

---

## License

MIT
