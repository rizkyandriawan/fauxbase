# Fauxbase

**Start with fake. Ship with real. Change nothing.**

Fauxbase is a frontend data layer that simulates your backend during development, then connects to your real API without changing your components.

```
npm install fauxbase
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
  (memory / localStorage)            ↓
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
- Seed data with deterministic IDs
- Local driver (memory / localStorage)
- HTTP driver for real backends
- Hybrid mode for gradual migration
- Backend presets (Spring Boot, NestJS, Laravel, Django, Rails, ...)
- Zero runtime dependencies (~8KB gzipped)

---

## Hybrid Mode

This is the killer feature. Migrate one service at a time:

```ts
const fb = createClient({
  driver: { type: 'local' },

  overrides: {
    product: { driver: { type: 'http', baseUrl: '/api', preset: 'spring-boot' } },
  },
});
```

Products use the real API. Everything else stays local. Migrate at your own pace.

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

Every service gets: `list`, `get`, `create`, `update`, `delete`, `count`, `bulk.create`, `bulk.update`, `bulk.delete`.

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

## Backend Presets

Works with any REST backend. Presets tell the HTTP driver how to serialize queries and parse responses.

| Preset | Framework | Filter Style |
|--------|-----------|-------------|
| `lightwind` | Lightwind (Quarkus) | `?price__gte=100` |
| `spring-boot` | Spring Boot | `?price.gte=100` |
| `nestjs` | NestJS | `?filter.price.$gte=100` |
| `laravel` | Laravel | `?filter[price_gte]=100` |
| `django` | Django REST Framework | `?price__gte=100` |
| `express` | Express.js | `?price__gte=100` |
| `fastapi` | FastAPI | `?price__gte=100` |
| `rails` | Ruby on Rails | `?q[price_gteq]=100` |
| `go-gin` | Go (Gin) | `?price__gte=100` |

Custom presets supported via `definePreset()`.

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
- [ ] **v0.2** — React hooks (`useList`, `useGet`, `useMutation`) + Auth simulation
- [ ] **v0.3** — HTTP Driver + Backend Presets + DevTools
- [ ] **v0.4** — IndexedDB, CLI (`npx fauxbase init`), Vue/Svelte adapters

---

## License

MIT
