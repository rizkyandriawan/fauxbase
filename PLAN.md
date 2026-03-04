# Fauxbase

**Start with fake. Ship with real. Change nothing.**

A frontend backend simulator that mirrors real backend contracts — structured entities, services with business logic, 13 query operators, auth, role-based access — all running in the browser. When your backend is ready, swap one config line.

```
npm install @fauxbase/core @fauxbase/react
```

---

## Why

Every frontend project does this:

1. Backend not ready → write ad-hoc mock data
2. Mock data has no structure → spaghetti grows
3. Backend arrives → rewrite all data fetching
4. Some endpoints not ready → half mock, half real, chaos

Fauxbase fixes this by formalizing the mock layer into the **same contract** your backend will use.

```
Week 1-4 (no backend):
  React → Fauxbase (local driver) → localStorage
                ↕ same code
Week 5+ (backend ready):
  React → Fauxbase (http driver) → REST API

Week 5-8 (gradual migration):
  React → Fauxbase (mixed) → some local, some API
```

---

## Core Concepts

### 1. Entity — your data shape (like a POJO/model)

```typescript
import { Entity, field, relation, computed } from '@fauxbase/core';

export class Product extends Entity {
  @field({ required: true })          name!: string;
  @field({ required: true, min: 0 })  price!: number;
  @field({ default: 0 })              stock!: number;
  @field({ default: true })           isActive!: boolean;
  @field()                            imageUrl?: string;

  @relation('category')               categoryId!: string;

  @computed(p => p.stock > 0 && p.isActive)
  available!: boolean;
}

// Entity base class gives you:
//   id: string          (auto-generated UUID)
//   createdAt: Date     (auto-set on create)
//   updatedAt: Date     (auto-set on update)
//   isDeleted: boolean  (soft delete flag)
```

### 2. Service — business logic + CRUD

```typescript
import { Service, beforeCreate, beforeUpdate } from '@fauxbase/core';
import { Product } from '../entities/product';

export class ProductService extends Service<Product> {
  entity = Product;
  endpoint = '/products';

  @beforeCreate()
  validateSlug(data: Partial<Product>, existing: Product[]) {
    const slug = data.name!.toLowerCase().replace(/\s+/g, '-');
    if (existing.some(p => p.slug === slug)) {
      throw new ConflictError(`Slug "${slug}" exists`);
    }
  }

  @beforeUpdate()
  preventNegativeStock(_id: string, data: Partial<Product>) {
    if (data.stock !== undefined && data.stock < 0) {
      throw new ValidationError('Stock cannot be negative');
    }
  }

  // Custom methods — available on both drivers
  async getByCategory(categoryId: string, page = 1) {
    return this.list({
      filter: { categoryId, isActive: true },
      sort: { field: 'name', direction: 'asc' },
      page, size: 20,
    });
  }

  async adjustStock(id: string, delta: number) {
    const { data: product } = await this.get(id);
    return this.update(id, { stock: product.stock + delta });
  }
}

// Service base class gives you:
//   list(query)        — filtered, sorted, paginated
//   get(id)            — by ID
//   create(data)       — with hooks + validation
//   update(id, data)   — with hooks
//   delete(id)         — soft delete
//   count(filter)      — count matching
//   bulk.create([])    — batch insert
//   bulk.update([])    — batch update
//   bulk.delete([])    — batch delete
```

### 3. QueryEngine — 13 operators, works everywhere

```typescript
// Same syntax in components, local driver processes in-memory,
// http driver translates to query params

const result = await fb.product.list({
  filter: {
    price__gte: 100000,             // price >= 100000
    name__contains: 'pomade',       // case-insensitive contains
    categoryId__in: ['cat-1','cat-2'], // in list
    stock__between: [10, 100],      // 10 <= stock <= 100
    isActive: true,                 // exact match (eq implied)
    description__isnull: false,     // is not null
  },
  sort: { field: 'price', direction: 'desc' },
  page: 1,
  size: 20,
});

// All 13 operators:
// eq, ne, gt, gte, lt, lte, like, contains,
// startswith, endswith, between, in, isnull
```

### 4. Auth — login, roles, access control

```typescript
import { AuthService, roles } from '@fauxbase/core';
import { User } from '../entities/user';

export class UserService extends AuthService<User> {
  entity = User;
  endpoint = '/auth';
  tokenExpiry = '24h';

  @roles({
    product:  { list: '*', get: '*', create: 'admin', update: 'admin', delete: 'admin' },
    order:    { list: 'auth', get: 'owner', create: 'auth', update: 'admin' },
    user:     { list: 'admin', get: 'owner', update: 'owner', delete: 'admin' },
  })
  access: any;
}

// AuthService gives you:
//   login({ email, password })      → { token, user }
//   register({ name, email, ... })  → { token, user }
//   logout()
//   refresh()                       → new token
//   currentUser                     → User | null
//   isLoggedIn                      → boolean
//   hasRole(role)                   → boolean
//
// Access rules enforced on BOTH drivers:
//   '*'     = anyone (public)
//   'auth'  = logged in
//   'owner' = owns the record (createdBy === currentUser.id)
//   'admin' = role === 'admin'
//   string  = any custom role name
```

### 5. Seed — initial data, separate from logic

```typescript
import { seed } from '@fauxbase/core';
import { Product } from '../entities/product';

export const productSeed = seed(Product, [
  { name: 'Hair Clay', price: 185000, categoryId: 'cat-1', stock: 50 },
  { name: 'Beard Oil', price: 125000, categoryId: 'cat-2', stock: 30 },
]);

// Or generate fake data
import { seed, fake } from '@fauxbase/core';

export const productSeed = seed(Product, fake(50, {
  name: fake.commerce.productName,
  price: fake.number({ min: 50000, max: 500000 }),
  categoryId: fake.pick('cat-1', 'cat-2', 'cat-3'),
  stock: fake.number({ min: 0, max: 200 }),
}));
```

### 6. Client — wire it all together

```typescript
import { createClient } from '@fauxbase/core';
import { ProductService } from './services/product';
import { CategoryService } from './services/category';
import { OrderService } from './services/order';
import { UserService } from './services/user';
import { productSeed } from './seeds/product';
import { categorySeed } from './seeds/category';

export const fb = createClient({
  driver: import.meta.env.VITE_API_URL
    ? { type: 'http', baseUrl: import.meta.env.VITE_API_URL }
    : { type: 'local', persist: 'localStorage' },

  services: {
    product: ProductService,
    category: CategoryService,
    order: OrderService,
  },

  auth: UserService,

  seeds: [productSeed, categorySeed],
});

// Type-safe access:
// fb.product.list(...)    → ProductService methods
// fb.category.get(...)    → CategoryService methods
// fb.auth.login(...)      → UserService auth methods
```

---

## React Integration

```
npm install @fauxbase/react
```

### Hooks

```tsx
import { fb } from '../fauxbase';

function ProductList() {
  const [search, setSearch] = useState('');

  // useList — auto-refetch on filter change
  const { data, loading, error, refetch } = fb.product.useList({
    filter: {
      ...(search && { name__contains: search }),
      isActive: true,
    },
    sort: { field: 'createdAt', direction: 'desc' },
    page: 1,
    size: 20,
    include: ['category'],
  });

  // useMutation — create/update/delete with optimistic updates
  const { create, update, remove, loading: mutating } = fb.product.useMutation();

  const handleCreate = async () => {
    await create({ name: 'New Product', price: 0, categoryId: 'cat-1' });
    // list auto-refetches (cache invalidation)
  };

  // useGet — single record
  const { data: featured } = fb.product.useGet('product-123');

  // useInfinite — infinite scroll
  const { data: all, hasMore, loadMore } = fb.product.useInfinite({
    filter: { isActive: true },
    size: 20,
  });

  // useAuth — auth state
  const { user, isLoggedIn, login, logout } = fb.auth.useAuth();

  return (
    <div>
      <input onChange={e => setSearch(e.target.value)} placeholder="Search..." />
      {loading && <Spinner />}
      {data?.items.map(p => <ProductCard key={p.id} product={p} />)}
      <Pagination meta={data?.meta} />
    </div>
  );
}
```

### Provider

```tsx
// main.tsx
import { FauxbaseProvider } from '@fauxbase/react';
import { fb } from './fauxbase';

createRoot(document.getElementById('root')!).render(
  <FauxbaseProvider client={fb}>
    <App />
  </FauxbaseProvider>
);
```

---

## Drivers

### Local Driver (default)

Runs entirely in the browser. No server needed.

```
Component → fb.product.list({ filter }) → LocalDriver
  → reads from MemoryStore / localStorage / IndexedDB
  → applies QueryEngine (filter, sort, paginate) in-memory
  → runs hooks (@beforeCreate, etc.)
  → enforces auth rules
  → returns ApiResponse / PagedResponse
```

Storage options:

| Store | Persist | Size Limit | Speed | Use Case |
|-------|---------|-----------|-------|----------|
| `memory` | No (lost on refresh) | RAM | Fastest | Unit tests, throwaway demos |
| `localStorage` | Yes | ~5MB | Fast | Default, small-medium datasets |
| `indexedDB` | Yes | ~unlimited | Async | Large datasets (1000+ records) |

```typescript
// Choose your store
driver: { type: 'local', persist: 'memory' }       // volatile
driver: { type: 'local', persist: 'localStorage' }  // default
driver: { type: 'local', persist: 'indexedDB' }     // large data
```

### HTTP Driver

Proxies to a real REST API. Zero logic in driver — just translates calls to fetch.

```
Component → fb.product.list({ filter }) → HttpDriver
  → GET /products?name__contains=pomade&price__gte=100000&page=1&size=20
  → Authorization: Bearer <token>
  → returns response as-is (expects ApiResponse / PagedResponse format)
```

```typescript
driver: { type: 'http', baseUrl: 'https://api.example.com' }
```

### Hybrid (per-service override)

```typescript
const fb = createClient({
  driver: { type: 'local' },  // default

  services: { product: ProductService, category: CategoryService, order: OrderService },

  overrides: {
    product: { driver: { type: 'http', baseUrl: 'https://api.example.com' } },
    // category, order → still local
  },
});
```

### Custom Driver

Build your own for GraphQL, gRPC, Supabase, Firebase, whatever:

```typescript
import { Driver } from '@fauxbase/core';

export class SupabaseDriver implements Driver {
  async list<T>(resource: string, query: QueryParams): Promise<PagedResponse<T>> {
    // translate to Supabase query
    let q = supabase.from(resource).select('*', { count: 'exact' });
    for (const [key, value] of Object.entries(query.filter || {})) {
      q = applySupabaseFilter(q, key, value);
    }
    const { data, count } = await q.range(offset, offset + size - 1);
    return { success: true, data, meta: { page, size, totalItems: count, totalPages: ... } };
  }
  // ... get, create, update, delete
}

const fb = createClient({
  driver: { type: 'custom', instance: new SupabaseDriver(supabaseClient) },
  services: { ... },
});
```

---

## Response Format

All operations return a standardized response:

```typescript
// Single item
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// List
interface PagedResponse<T> {
  success: boolean;
  items: T[];
  meta: {
    page: number;
    size: number;
    totalItems: number;
    totalPages: number;
  };
}

// Error
interface ErrorResponse {
  success: false;
  error: string;
  code: string;         // 'NOT_FOUND', 'CONFLICT', 'VALIDATION', 'FORBIDDEN'
  details?: Record<string, string>;  // field-level errors
}
```

Backend implementing this contract is automatically Fauxbase-compatible.
Any backend (Express, Spring Boot, Django, Quarkus, Go) can conform.

---

## DevTools

```
npm install -D @fauxbase/devtools
```

Floating panel in development mode:

```
┌──────────────────────────────────────────────────┐
│  Fauxbase DevTools                    [local] ▾  │
├─────────┬────────────────────────────────────────┤
│         │ products (14 records)                  │
│ Entities│ ┌────┬────────────┬────────┬────────┐  │
│─────────│ │ id │ name       │ price  │ stock  │  │
│ product │ │ 1  │ Hair Clay  │ 185000 │ 50     │  │
│ category│ │ 2  │ Beard Oil  │ 125000 │ 30     │  │
│ order   │ │ .. │            │        │        │  │
│ user    │ └────┴────────────┴────────┴────────┘  │
│         │                                        │
│ Auth    │ [+ Add] [Edit] [Delete] [Reset Seeds]  │
│         │                                        │
│ Log     │ ── Auth ──────────────────────────────  │
│         │ Logged in as: admin@test.com (admin)   │
│         │ Token: mock-jwt-abc... [Logout]        │
│         │                                        │
│ Config  │ ── Request Log ───────────────────────  │
│         │ 10:31:05 list products {contains:hair}  │
│         │   → 3 items, 0.4ms (local)             │
│         │ 10:31:08 create product                 │
│         │   → id: p-15, 0.2ms (local)            │
│         │ 10:31:10 list products                  │
│         │   → 15 items, 0.5ms (local)            │
└─────────┴────────────────────────────────────────┘
```

Features:
- View/edit/add/delete records in any entity store
- View current auth state (user, token, role)
- Request log (like Network tab but for Fauxbase operations)
- Reset to seed data
- Switch driver on the fly (local ↔ http) without code change
- Export current state as JSON
- Import JSON data

```tsx
// Enable in dev only
import { FauxbaseDevtools } from '@fauxbase/devtools';

function App() {
  return (
    <>
      <RouterProvider router={router} />
      {import.meta.env.DEV && <FauxbaseDevtools client={fb} />}
    </>
  );
}
```

---

## Project Structure (user's app)

```
src/
├── fauxbase/
│   ├── entities/
│   │   ├── product.ts        ← class Product extends Entity
│   │   ├── category.ts
│   │   ├── order.ts
│   │   └── user.ts
│   │
│   ├── services/
│   │   ├── product.ts        ← class ProductService extends Service<Product>
│   │   ├── category.ts
│   │   ├── order.ts
│   │   └── user.ts           ← class UserService extends AuthService<User>
│   │
│   ├── seeds/
│   │   ├── product.ts        ← seed(Product, [...])
│   │   └── category.ts
│   │
│   └── index.ts              ← createClient({ ... })
│
├── components/
│   └── ProductList.tsx        ← fb.product.useList({ ... })
├── pages/
└── main.tsx                   ← <FauxbaseProvider client={fb}>
```

---

## Package Architecture (internal)

```
packages/
├── core/                          @fauxbase/core (~8KB gzipped)
│   ├── src/
│   │   ├── entity.ts              — Entity base class, @field, @relation, @computed
│   │   ├── service.ts             — Service base class, hooks, CRUD
│   │   ├── auth.ts                — AuthService, token management, role checking
│   │   ├── query-engine.ts        — 13 operators, sort, pagination
│   │   ├── client.ts              — createClient factory
│   │   ├── drivers/
│   │   │   ├── types.ts           — Driver interface
│   │   │   ├── local.ts           — LocalDriver (memory/localStorage/indexedDB)
│   │   │   └── http.ts            — HttpDriver (fetch-based)
│   │   ├── errors.ts              — NotFoundError, ConflictError, ValidationError, etc.
│   │   ├── seed.ts                — seed() and fake() helpers
│   │   └── types.ts               — ApiResponse, PagedResponse, PageMeta
│   ├── package.json
│   └── tsconfig.json
│
├── react/                         @fauxbase/react (~3KB gzipped)
│   ├── src/
│   │   ├── provider.tsx           — FauxbaseProvider context
│   │   ├── use-list.ts            — useList hook
│   │   ├── use-get.ts             — useGet hook
│   │   ├── use-mutation.ts        — useMutation hook (optimistic updates)
│   │   ├── use-infinite.ts        — useInfinite hook
│   │   └── use-auth.ts            — useAuth hook
│   └── package.json
│
├── devtools/                      @fauxbase/devtools (~15KB, dev only)
│   ├── src/
│   │   ├── panel.tsx              — main devtools panel
│   │   ├── data-inspector.tsx     — entity table viewer/editor
│   │   ├── auth-inspector.tsx     — auth state viewer
│   │   ├── request-log.tsx        — operation log
│   │   └── seed-manager.tsx       — reset/reload seeds
│   └── package.json
│
├── faker/                         @fauxbase/faker (~5KB, dev only)
│   ├── src/
│   │   └── index.ts               — fake data generators
│   └── package.json
│
└── docs/                          documentation site
    ├── getting-started.md
    ├── entities.md
    ├── services.md
    ├── query-operators.md
    ├── auth.md
    ├── drivers.md
    └── migration-guide.md
```

Monorepo with pnpm workspaces. Each package published independently.

---

## Tech Stack (framework internals)

| Tool | Purpose |
|------|---------|
| TypeScript | Everything |
| pnpm workspaces | Monorepo management |
| tsup | Bundle (fast, zero-config) |
| vitest | Tests |
| TypeDoc | API docs generation |
| changesets | Version management + changelog |
| GitHub Actions | CI/CD → npm publish |

Zero runtime dependencies in `@fauxbase/core`. Only peer dep: none.
`@fauxbase/react` peer dep: `react >= 18`.

---

## Backend Compatibility

Fauxbase is backend-agnostic. Any backend that returns this format works:

```
GET /products?name__contains=hair&price__gte=100000&page=1&size=20

→ {
    "success": true,
    "items": [...],
    "meta": { "page": 1, "size": 20, "totalItems": 42, "totalPages": 3 }
  }
```

### Ready-made backend adapters:

| Backend | Adapter | Status |
|---------|---------|--------|
| **Lightwind** (Quarkus) | Native — same contract | Planned |
| **Express.js** | Middleware: `fauxbase-express` | Phase 2 |
| **Spring Boot** | Library: `fauxbase-spring` | Phase 3 |
| **Django** | Package: `django-fauxbase` | Phase 3 |
| **Go** | Module: `fauxbase-go` | Phase 3 |
| **Any REST API** | Conform to response format | Always works |

The Express adapter auto-generates endpoints from Fauxbase entity definitions:

```typescript
// server.ts (Express)
import express from 'express';
import { fauxbaseExpress } from 'fauxbase-express';
import { Product } from './shared/entities/product';
import { Category } from './shared/entities/category';

const app = express();

// Auto-generates: GET/POST/PUT/DELETE /products, /categories
// With query engine (13 operators), pagination, auth middleware
app.use('/api', fauxbaseExpress({
  entities: [Product, Category],
  database: 'sqlite://data.db',  // or postgres, mysql
}));
```

**Shared entities between frontend and backend** — define once, use everywhere.

---

## Comparison

| Tool | What | Fauxbase difference |
|------|------|-------------------|
| **MSW** | Intercepts fetch at network level | Fauxbase mocks the *data layer*, not HTTP. Has query engine, auth, relations |
| **json-server** | Fake REST from JSON | No query operators, no auth, no hooks, separate process, no React hooks |
| **MirageJS** | In-browser mock server | Closest. But: no typed entities, no 13 query operators, no auth sim, abandoned-ish |
| **TanStack Query** | Fetch + cache | Complementary. Fauxbase could use TQ internally for caching |
| **Supabase Client** | Client for Supabase | Similar DX but locked to Supabase infra. Fauxbase = any backend |
| **Firebase SDK** | Client for Firebase | Same lock-in. Fauxbase is backend-agnostic |
| **Zustand/Redux** | State management | Fauxbase replaces the "mock data in store" pattern with structured CRUD |
| **Prisma Client** | Type-safe DB client (Node) | Fauxbase is the browser equivalent — type-safe data layer for frontend |

**Fauxbase's unique angle**: structured backend simulation with a standardized query contract.
Not "mock your API" — but "run your backend logic in the browser, then swap to the real one."

---

## Implementation Plan

### Phase 1: Core (v0.1) — 2 weeks

Goal: usable for basic CRUD apps.

```
Week 1:
  [x] Project setup (monorepo, tsup, vitest)
  [ ] Entity base class + @field decorator
  [ ] Service base class + CRUD methods
  [ ] QueryEngine (13 operators, sort, pagination)
  [ ] LocalDriver (memory store)
  [ ] LocalDriver (localStorage store)
  [ ] createClient factory
  [ ] ApiResponse / PagedResponse types

Week 2:
  [ ] @beforeCreate, @beforeUpdate hooks
  [ ] @relation decorator + include/populate
  [ ] @computed decorator
  [ ] seed() helper
  [ ] Soft delete (isDeleted filtering)
  [ ] Error types (NotFound, Conflict, Validation, Forbidden)
  [ ] Tests (>90% coverage on core)
  [ ] npm publish @fauxbase/core
```

### Phase 2: React + Auth (v0.2) — 2 weeks

```
Week 3:
  [ ] FauxbaseProvider
  [ ] useList hook (auto-refetch on param change)
  [ ] useGet hook
  [ ] useMutation hook (optimistic updates)
  [ ] useInfinite hook
  [ ] npm publish @fauxbase/react

Week 4:
  [ ] AuthService base class
  [ ] Login / register / logout / refresh
  [ ] Mock JWT token generation
  [ ] Role-based access enforcement (local driver)
  [ ] useAuth hook
  [ ] Authorization header injection (http driver)
  [ ] Tests
```

### Phase 3: HTTP Driver + DevTools (v0.3) — 2 weeks

```
Week 5:
  [ ] HttpDriver (fetch-based)
  [ ] Query param serialization (filter → URL params)
  [ ] Hybrid mode (per-service driver override)
  [ ] Error handling (network errors, 4xx/5xx)
  [ ] Retry + timeout configuration
  [ ] npm publish update

Week 6:
  [ ] DevTools panel (data inspector)
  [ ] DevTools: auth inspector
  [ ] DevTools: request log
  [ ] DevTools: seed manager (reset/reload)
  [ ] DevTools: driver switcher (local ↔ http live toggle)
  [ ] npm publish @fauxbase/devtools
```

### Phase 4: Ecosystem (v0.4+) — ongoing

```
  [ ] IndexedDB store (large datasets)
  [ ] @fauxbase/faker (data generation)
  [ ] fauxbase-express adapter (auto-generate endpoints)
  [ ] CLI tool: `npx fauxbase init` (scaffold entities/services)
  [ ] Documentation site
  [ ] Lightwind backend integration (shared entity definitions)
  [ ] Vue adapter (@fauxbase/vue)
  [ ] Svelte adapter (@fauxbase/svelte)
```

---

## Naming Convention

```
User-facing:
  Fauxbase            — the project/brand
  @fauxbase/core      — npm package
  fb                  — conventional client variable name

Internal classes:
  Entity              — base entity (not "FauxEntity" — keep it clean)
  Service             — base service
  AuthService         — auth service
  QueryEngine         — query processor
  LocalDriver         — local driver
  HttpDriver          — http driver

Decorators:
  @field()            — mark entity field
  @relation()         — foreign key relation
  @computed()         — derived value
  @beforeCreate()     — pre-create hook
  @beforeUpdate()     — pre-update hook
  @validate()         — custom validation
  @roles()            — access rules

Functions:
  createClient()      — factory
  seed()              — seed data helper
  fake()              — faker helper
```

No prefix soup. No `FBEntity`, no `FauxService`. Just clean names under the `@fauxbase` scope.

---

## Example: SJATI on Fauxbase

Full e-commerce frontend, zero backend:

```typescript
// fauxbase/entities/product.ts
export class Product extends Entity {
  @field({ required: true })          name!: string;
  @field({ required: true, min: 0 })  price!: number;
  @field({ default: 0 })              stock!: number;
  @field({ default: true })           isActive!: boolean;
  @field()                            description?: string;
  @field()                            imageUrl?: string;
  @field({ default: 0 })              rating!: number;
  @relation('category')               categoryId!: string;
}

// fauxbase/entities/order.ts
export class Order extends Entity {
  @field({ required: true })          status!: 'pending' | 'paid' | 'shipped' | 'delivered';
  @field({ required: true, min: 0 })  total!: number;
  @field()                            items!: OrderItem[];
  @relation('user')                   userId!: string;
}

// fauxbase/services/order.ts
export class OrderService extends Service<Order> {
  entity = Order;
  endpoint = '/orders';

  @beforeCreate()
  setDefaults(data: Partial<Order>) {
    data.status = 'pending';
  }

  async getMyOrders(page = 1) {
    const userId = this.client.auth.currentUser?.id;
    if (!userId) throw new ForbiddenError('Not logged in');
    return this.list({
      filter: { userId, isDeleted: false },
      sort: { field: 'createdAt', direction: 'desc' },
      page, size: 10,
    });
  }

  async markPaid(orderId: string) {
    return this.update(orderId, { status: 'paid' });
  }
}

// fauxbase/index.ts
export const fb = createClient({
  driver: import.meta.env.VITE_API_URL
    ? { type: 'http', baseUrl: import.meta.env.VITE_API_URL }
    : { type: 'local', persist: 'localStorage' },

  services: {
    product: ProductService,
    category: CategoryService,
    order: OrderService,
    promo: PromoService,
  },

  auth: UserService,

  seeds: [categorySeed, productSeed, promoSeed],
});
```

14 produk, 4 kategori, auth, orders, promo codes — all running in the browser with full CRUD, query engine, and auth. Deploy to S3, done.

---

## License

MIT
