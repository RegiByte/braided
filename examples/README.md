# 🧶 Braided Examples

Production-ready examples showing how to manage stateful resources with dependency-aware lifecycle management.

## Examples

All examples are available in both **JavaScript** (CommonJS) and **TypeScript** (ESM) versions.

### [HTTP Server](./http-server) | [TypeScript](./http-server-ts) - Start Here ⭐
Basic Express server with graceful shutdown.

```bash
# JavaScript
cd http-server && npm install && npm start

# TypeScript (with full type safety!)
cd http-server-ts && npm install && npm start
```

**Shows**: Config → Router → HTTP Server dependency chain  
**TypeScript bonus**: Full type inference through dependency chain

---

### [WebSocket Server](./websocket-server) | [TypeScript](./websocket-server-ts) - Real-time Connections ⭐⭐
Socket.IO server that notifies clients before shutdown.

```bash
# JavaScript
cd websocket-server && npm install && npm start

# TypeScript
cd websocket-server-ts && npm install && npm start
# Open http://localhost:3000 in multiple tabs
```

**Shows**: Connection management, coordinated shutdown  
**TypeScript bonus**: Type-safe event handlers and connection tracking

---

### [Queue Worker](./queue-worker) | [TypeScript](./queue-worker-ts) - Job Processing ⭐⭐⭐
BullMQ worker that completes active jobs before shutdown.

```bash
# JavaScript
cd queue-worker
npm run docker:up  # Start Redis
npm install && npm start

# TypeScript
cd queue-worker-ts
npm run docker:up  # Start Redis
npm install && npm start
# Press Ctrl+C and watch jobs complete
```

**Shows**: External dependencies (Redis), job completion guarantees  
**TypeScript bonus**: Type-safe job data and processor functions

---

### [Cache Swapping](./cache-swapping) | [TypeScript](./cache-swapping-ts) - The Killer Feature 🔥 ⭐⭐
Same code, different cache: in-memory for testing, Redis for production.

```bash
# JavaScript
cd cache-swapping
npm install && npm run start:memory  # No Redis needed!
npm test  # Tests run without Redis

# TypeScript (THE SHOWCASE!)
cd cache-swapping-ts
npm install && npm run start:memory
npm test  # Full type safety, no Redis needed!
```

**Shows**: Swappable implementations, testing without infrastructure  
**TypeScript bonus**: Interface-based programming with compile-time verification 🎯

## Which Example Should I Start With?

| If you want to... | JavaScript | TypeScript |
|-------------------|------------|------------|
| Learn the basics | [HTTP Server](./http-server) | [HTTP Server TS](./http-server-ts) |
| See graceful shutdown | [WebSocket Server](./websocket-server) | [WebSocket Server TS](./websocket-server-ts) |
| Understand the power | [Cache Swapping](./cache-swapping) 🤯 | [Cache Swapping TS](./cache-swapping-ts) 🔥 |
| Build production systems | [Queue Worker](./queue-worker) | [Queue Worker TS](./queue-worker-ts) |
| See interface-based programming | N/A | [Cache Swapping TS](./cache-swapping-ts) 🎯 |

## Common Patterns

### 1. Define Resources

**JavaScript:**
```javascript
const resource = defineResource({
  dependencies: ["other"],  // Optional
  start: ({ other }) => {
    // Create and return your resource
  },
  halt: (instance) => {
    // Clean up
  },
});
```

**TypeScript:**
```typescript
const resource = defineResource({
  dependencies: ["other"] as const,  // 'as const' enables type inference
  start: ({ other }) => {
    // 'other' is fully typed automatically!
    // TypeScript knows all its properties and methods
  },
  halt: (instance) => {
    // 'instance' is typed as the return value from start()
  },
});
```

### 2. Compose System
```typescript
const system = {
  config: configResource,
  database: databaseResource,
  api: apiResource,
};

const { system } = await startSystem(systemConfig);
// In TypeScript: system.api, system.database are all fully typed!
```

### 3. Start & Stop
```typescript
const { system, errors } = await startSystem(config);
// Use system.api, system.database, etc.
// TypeScript knows the exact type of each resource!

await haltSystem(config, system);
// Everything stops in reverse order
```

### 4. Handle Shutdown
```typescript
let isShuttingDown = false;
process.on("SIGINT", async () => {
  if (isShuttingDown) { // if we're already shutting down, wait for it to complete
    return;
  }
  isShuttingDown = true;
  await haltSystem(systemConfig, system);
  console.log("System halted successfully");
  process.exit(0);
});
```

## Why Braided?

**Traditional approach:**
```javascript
// ❌ Implicit dependencies, brittle order
const db = await connectDB();
const cache = await connectCache();
const api = createAPI(db, cache);
const server = startServer(api);

// ❌ Manual shutdown, easy to mess up
server.close();
api.cleanup();
cache.disconnect();
db.close();
```

**With Braided:**
```javascript
// ✅ Explicit dependencies, automatic ordering
const systemConfig = {
  db: dbResource,
  cache: cacheResource,
  api: apiResource,      // depends on db, cache
  server: serverResource, // depends on api
};

const { system } = await startSystem(systemConfig);
// ✅ One call, proper order guaranteed
await haltSystem(systemConfig, system);
```

## Testing Philosophy

No mocks needed - just swap resources:

**JavaScript:**
```javascript
// Production
const system = { cache: redisCacheResource };

// Testing
const system = { cache: memoryCacheResource };
```

**TypeScript (with interface-based programming):**
```typescript
// Define the interface
interface CacheInterface {
  set(key: string, value: any): Promise<void>;
  get(key: string): Promise<any>;
  // ... more methods
}

// Both implementations satisfy the interface
const memoryCache: CacheInterface = { /* ... */ };
const redisCache: CacheInterface = { /* ... */ };

// API depends on interface, not implementation
const apiResource = defineResource({
  dependencies: ["cache"] as const,
  start: ({ cache }: { cache: CacheInterface }) => {
    // Works with BOTH implementations!
    // Full type safety maintained!
  }
});
```

Same code, different implementation. See [Cache Swapping](./cache-swapping) or [Cache Swapping TS](./cache-swapping-ts) for details.

## Tips

1. **Copy-paste friendly**: Each example is self-contained
2. **Modify freely**: These are templates, adapt them
3. **Combine patterns**: Mix resources from different examples
4. **Run them**: Don't just read - experiment!

## Learning Path

### JavaScript Track
1. **Day 1**: [HTTP Server](./http-server) - understand basics
2. **Day 2**: [WebSocket Server](./websocket-server) - see connections
3. **Day 3**: [Queue Worker](./queue-worker) - handle jobs
4. **Day 4**: [Cache Swapping](./cache-swapping) - mind blown 🤯
5. **Day 5**: Build your own!

### TypeScript Track (Recommended for new projects!)
1. **Day 1**: [HTTP Server TS](./http-server-ts) - understand basics + type inference
2. **Day 2**: [WebSocket Server TS](./websocket-server-ts) - see type-safe connections
3. **Day 3**: [Queue Worker TS](./queue-worker-ts) - handle type-safe jobs
4. **Day 4**: [Cache Swapping TS](./cache-swapping-ts) - interface-based programming 🔥
5. **Day 5**: Build your own with full type safety!

## TypeScript Benefits

The TypeScript examples demonstrate:

✅ **Zero manual typing** - Types are inferred from the system configuration  
✅ **Interface-based programming** - Depend on contracts, not implementations  
✅ **Compile-time safety** - Catch errors before runtime  
✅ **Full autocomplete** - IDE knows everything about your dependencies  
✅ **Refactoring confidence** - Change interfaces, TypeScript finds all issues  
✅ **Self-documenting** - Types serve as inline documentation

---

**Untangle your code. Compose your systems. Ship with confidence.** 🧶

[Main Docs](../README.md) • [npm](https://www.npmjs.com/package/braided) • [GitHub](https://github.com/RegiByte/braided)
