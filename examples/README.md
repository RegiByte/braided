# 🧶 Braided Examples

Production-ready examples showing how to manage stateful resources with dependency-aware lifecycle management.

## Examples

### [HTTP Server](./http-server) - Start Here ⭐
Basic Express server with graceful shutdown.

```bash
cd http-server && npm install && npm start
```

**Shows**: Config → Router → HTTP Server dependency chain

---

### [WebSocket Server](./websocket-server) - Real-time Connections ⭐⭐
Socket.IO server that notifies clients before shutdown.

```bash
cd websocket-server && npm install && npm start
# Open http://localhost:3000 in multiple tabs
```

**Shows**: Connection management, coordinated shutdown

---

### [Queue Worker](./queue-worker) - Job Processing ⭐⭐⭐
BullMQ worker that completes active jobs before shutdown.

```bash
cd queue-worker
npm run docker:up  # Start Redis
npm install && npm start
# Press Ctrl+C and watch jobs complete
```

**Shows**: External dependencies (Redis), job completion guarantees

---

### [Cache Swapping](./cache-swapping) - The Killer Feature 🔥 ⭐⭐
Same code, different cache: in-memory for testing, Redis for production.

```bash
cd cache-swapping
npm install && npm run start:memory  # No Redis needed!
npm test  # Tests run without Redis
```

**Shows**: Swappable implementations, testing without infrastructure

## Which Example Should I Start With?

| If you want to... | Start with |
|-------------------|------------|
| Learn the basics | [HTTP Server](./http-server) |
| See graceful shutdown | [WebSocket Server](./websocket-server) |
| Understand the power | [Cache Swapping](./cache-swapping) 🤯 |
| Build production systems | [Queue Worker](./queue-worker) |

## Common Patterns

### 1. Define Resources
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

### 2. Compose System
```javascript
const system = {
  config: configResource,
  database: databaseResource,
  api: apiResource,
};
```

### 3. Start & Stop
```javascript
const { system, errors } = await startSystem(config);
// Use system.api, system.database, etc.

await haltSystem(config, system);
// Everything stops in reverse order
```

### 4. Handle Shutdown
```javascript
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

```javascript
// Production
const system = { cache: redisCacheResource };

// Testing
const system = { cache: memoryCacheResource };
```

Same code, different implementation. See [Cache Swapping](./cache-swapping) for details.

## Tips

1. **Copy-paste friendly**: Each example is self-contained
2. **Modify freely**: These are templates, adapt them
3. **Combine patterns**: Mix resources from different examples
4. **Run them**: Don't just read - experiment!

## Learning Path

1. **Day 1**: [HTTP Server](./http-server) - understand basics
2. **Day 2**: [WebSocket Server](./websocket-server) - see connections
3. **Day 3**: [Queue Worker](./queue-worker) - handle jobs
4. **Day 4**: [Cache Swapping](./cache-swapping) - mind blown 🤯
5. **Day 5**: Build your own!

---

**Untangle your code. Compose your systems. Ship with confidence.** 🧶

[Main Docs](../README.md) • [npm](https://www.npmjs.com/package/braided) • [GitHub](https://github.com/RegiByte/braided)
