# 💾 Cache Swapping Example - The Killer Feature 🔥

Same code, different cache: in-memory for testing, Redis for production. No mocks needed.

## What You'll Learn

- Swappable implementations with identical interfaces
- Testing without infrastructure
- Dependency injection done right
- Production-ready caching patterns

## Quick Start

### In-Memory (No Dependencies!)

```bash
npm install
npm run start:memory  # No Docker, no Redis!
```

### Redis (Production)

```bash
npm run docker:up  # Start Redis
npm run start:redis
```

### Run Tests

```bash
npm test  # Uses in-memory cache - no Redis required!
```

## The Magic

```javascript
function createSystemConfig(cacheType = "memory") {
  const cacheResource = cacheType === "redis" 
    ? redisCacheResource 
    : memoryCacheResource;

  return {
    cache: cacheResource,  // ← Swap point!
    apiService: apiServiceResource,  // Doesn't know which cache!
  };
}
```

**Same API code, different runtime.** Test with in-memory, deploy with Redis - zero code changes.

## System Structure

```
config → cache (Redis OR In-Memory) → apiService → httpServer
```

The `apiService` uses the cache interface without knowing if it's Redis or in-memory.

## API Endpoints

Once running (copy-paste ready):

```bash
# Get user (cache miss → cache hit on second call)
curl http://localhost:3000/users/123

# View cache statistics
curl http://localhost:3000/cache/stats

# Invalidate user cache
curl -X DELETE http://localhost:3000/users/123/cache

# Clear entire cache
curl -X DELETE http://localhost:3000/cache
```

**Pro tip**: Run the first command twice to see cache miss → cache hit!

## Watch It Work

### First Request (Cache Miss)
```json
{
  "id": "123",
  "name": "User 123",
  "source": "database"  ← From database
}
```

### Second Request (Cache Hit)
```json
{
  "id": "123",
  "name": "User 123",
  "source": "cache"  ← From cache!
}
```

### Cache Statistics
```json
{
  "hits": 5,
  "misses": 3,
  "hitRate": 0.625,
  "type": "memory"
}
```

## The Cache Interface

Both implementations provide:

```javascript
{
  type: "redis" | "memory",
  async set(key, value, ttl),  // TTL in seconds
  async get(key),
  async has(key),
  async delete(key),
  async clear(),
  async size(),
  async stats(),
}
```

## Testing Example

```javascript
const systemConfig = createSystemConfig("memory");
const { system } = await startSystem(systemConfig);

// Test cache miss
const user1 = await system.apiService.getUser("123");
assert(user1.source === "database");

// Test cache hit
const user2 = await system.apiService.getUser("123");
assert(user2.source === "cache");

await haltSystem(systemConfig, system);
```

**No Redis needed. No mocks. Just works.** ✨

## Production Deployment

```bash
# Environment variables
export CACHE_TYPE=redis
export REDIS_HOST=your-redis-host
export REDIS_PORT=6379

node system.js
```

## Key Features

### 1. Interface Consistency
- `cache-memory.js` - In-memory Map with TTL
- `cache-redis.js` - Redis with JSON serialization

### 2. TTL Support
```javascript
await cache.set("key", value, 60); // Expires in 60 seconds
```

### 3. Statistics Tracking
```javascript
const stats = await cache.stats();
// { hits, misses, sets, deletes, size, hitRate }
```

### 4. Graceful Cleanup
- Memory: Clears Map and stops TTL cleanup
- Redis: Disconnects gracefully

## Monitoring Redis

**Redis Commander**: http://localhost:8081

View cached keys, inspect values, monitor TTLs.

## Performance Comparison

```bash
# In-memory (fast, no network)
npm run start:memory

# Redis (network overhead, but distributed)
npm run start:redis

# Benchmark
ab -n 1000 -c 10 http://localhost:3000/users/123
```

## Key Takeaways

1. **No Framework Needed**: Braided provides DI without complexity
2. **Testing is Trivial**: Swap Redis with in-memory - no mocks
3. **Production-Ready**: Use Redis in production with same code
4. **Type-Safe**: Both implementations follow same contract
5. **No Vendor Lock-In**: Easy to switch cache providers

## Cleanup

```bash
npm run docker:down
```

## Next Steps

- **More Redis patterns?** → [Queue Worker](../queue-worker)
- **Connection management?** → [WebSocket Server](../websocket-server)

---

**Built with Braided** 🧶

**This is the power of data-driven system composition.**
