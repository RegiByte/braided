# 🔥 Cache Swapping Example (TypeScript) - THE KILLER FEATURE

Same code, different cache implementations - with **full type safety**! This example demonstrates the true power of programming to interfaces with TypeScript.

## What You'll Learn

- **Interface-based programming** - Define contracts, swap implementations
- **Type-safe composition** - Full autocomplete and type checking throughout
- **Testing without infrastructure** - Run tests with in-memory cache, deploy with Redis
- **Fewer manual type annotations needed** - TypeScript infers everything from the interface

## The Magic

The API service depends on `CacheInterface`, not a specific implementation:

```typescript
// Define the interface once
export interface CacheInterface {
  type: string;
  set(key: string, value: any, ttl?: number): Promise<void>;
  get(key: string): Promise<any>;
  // ... more methods
}

// API service programs to the interface
const apiServiceResource = defineResource<{ cache: CacheInterface }>({
  dependencies: ["cache"] as const,
  // cache is fully typed here!
  start: ({ cache }) => {
    // 'cache' could be memory OR Redis - API doesn't care!
    // TypeScript still gives full autocomplete and type checking!
    return {
      async getUser(userId: string) {
        const cached = await cache.get(`user:${userId}`);
        // ✅ TypeScript knows all cache methods
        // ✅ Works with ANY implementation
      },
    };
  },
});
```

## Quick Start

### With In-Memory Cache (No Dependencies!)

```bash
npm install
npm start
# or explicitly:
npm run start:memory
```

### With Redis Cache (Production)

```bash
npm run docker:up  # Start Redis
npm run start:redis
```

### Run Tests (No Redis Required!)

```bash
npm test
```

## System Structure

```
config → cache (memory OR redis) → apiService → httpServer
```

**The Swap Point**: `cache` can be either implementation - everything else stays the same!

## Type Safety Highlights

### 1. Interface Definition

```typescript
// cache-interface.ts
export interface CacheInterface {
  type: string;
  set(key: string, value: any, ttl?: number): Promise<void>;
  get(key: string): Promise<any>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
  stats(): Promise<{
    hits: number;
    misses: number;
    // ... more stats
  }>;
}
```

### 2. Implementations Satisfy Interface

```typescript
// cache-memory.ts
export const memoryCacheResource = defineResource({
  start: (): CacheInterface => {
    // TypeScript ensures we implement ALL interface methods
    return {
      type: "memory",
      async set(key, value, ttl) {
        /* ... */
      },
      async get(key) {
        /* ... */
      },
      // ✅ Must implement every method from CacheInterface
    } satisfies CacheInterface;
  },
});

// cache-redis.ts
export const redisCacheResource = defineResource({
  dependencies: ["config"] as const,
  start: async ({ config }): Promise<CacheInterface> => {
    // Different implementation, same interface!
    return {
      type: "redis",
      async set(key, value, ttl) {
        /* ... */
      },
      async get(key) {
        /* ... */
      },
      // ✅ Must implement every method from CacheInterface
    } satisfies CacheInterface;
  },
});
```

### 3. Consumer Programs to Interface

```typescript
const apiServiceResource = defineResource({
  dependencies: ["cache"] as const,
  start: ({ cache }: { cache: CacheInterface }) => {
    // 'cache' is typed as CacheInterface
    // Works with BOTH memory and Redis implementations
    // Full autocomplete and type checking!

    return {
      async getUser(userId: string) {
        const cached = await cache.get(`user:${userId}`);
        // ✅ TypeScript knows cache.get() returns Promise<any>
        // ✅ TypeScript knows cache.set() signature
        // ✅ Autocomplete works perfectly

        if (cached) {
          return { ...cached, source: "cache" };
        }

        const user = { id: userId, name: `User ${userId}` };
        await cache.set(`user:${userId}`, user, 60);
        return { ...user, source: "database" };
      },
    };
  },
});
```

### 4. Swapping at Runtime

```typescript
export function createSystemConfig(cacheType: "memory" | "redis" = "memory") {
  const cacheResource =
    cacheType === "redis" ? redisCacheResource : memoryCacheResource;

  return {
    config: configResource,
    cache: cacheResource, // ✅ Both satisfy the same interface!
    apiService: apiServiceResource, // ✅ Works with either cache!
    httpServer: httpServerResource,
  };
}

// TypeScript ensures type safety regardless of which cache is chosen!
const systemConfig = createSystemConfig("memory");
const { system } = await startSystem(systemConfig);
// system.cache is typed as CacheInterface ✅
// system.apiService.getUser is fully typed ✅
```

## Features Demonstrated

### 1. No Redis Required for Development/Testing

```bash
# Development
npm run start:memory

# Testing
npm test  # Uses in-memory cache, no Docker needed!

# Production
npm run docker:up
npm run start:redis
```

### 2. Same API, Different Backend

```typescript
// In-memory cache (fast, no setup)
const devSystem = createSystemConfig("memory");

// Redis cache (persistent, production-ready)
const prodSystem = createSystemConfig("redis");

// API service code is IDENTICAL in both cases!
```

### 3. Type-Safe Testing

```typescript
const systemConfig = createSystemConfig("memory");
const { system } = await startSystem(systemConfig);

// Full type safety in tests!
const user = await system.apiService.getUser("123");
// ✅ TypeScript knows user has id, name, email, source
const stats = await system.cache.stats();
// ✅ TypeScript knows stats has hits, misses, hitRate
```

## API Endpoints

```bash
# Get user (cached)
curl http://localhost:3000/users/123

# Get user posts (cached)
curl http://localhost:3000/users/123/posts

# View cache statistics
curl http://localhost:3000/cache/stats

# Invalidate user cache
curl -X DELETE http://localhost:3000/users/123/cache

# Clear all cache
curl -X DELETE http://localhost:3000/cache

# Health check
curl http://localhost:3000/health
```

## Why This Matters

### Traditional Approach (Tightly Coupled)

```typescript
// ❌ Directly depends on Redis
import Redis from "ioredis";

class ApiService {
  constructor(private redis: Redis) {}

  async getUser(id: string) {
    const cached = await this.redis.get(`user:${id}`);
    // Now you MUST have Redis running to test this!
  }
}
```

### Braided Approach (Interface-Based)

```typescript
// ✅ Depends on interface, not implementation
const apiService = defineResource({
  dependencies: ["cache"] as const,
  start: ({ cache }: { cache: CacheInterface }) => {
    // Works with ANY cache implementation!
    // Test with memory, deploy with Redis!
  },
});
```

## Comparison with JavaScript Version

The [JavaScript version](../cache-swapping) has identical functionality. This TypeScript version adds:

- ✅ **Explicit interface definition** - Self-documenting contracts
- ✅ **Compile-time verification** - Both implementations must satisfy interface
- ✅ **Full type inference** - Autocomplete throughout the dependency chain
- ✅ **Refactoring safety** - Change interface, TypeScript finds all issues
- ✅ **Zero runtime overhead** - Types are erased at compile time

## Key Insights

1. **Program to interfaces, not implementations** - The API service never knows if it's using memory or Redis
2. **Type safety is preserved** - Despite the abstraction, TypeScript knows everything
3. **Testing is trivial** - No mocks needed, just swap the implementation
4. **Production-ready** - Same code runs in dev (memory) and prod (Redis)

## Next Steps

- **Start simple?** → Begin with [HTTP Server TS](../http-server-ts)
- **Need real-time?** → Check out [WebSocket Server TS](../websocket-server-ts)
- **Want job queues?** → See [Queue Worker TS](../queue-worker-ts)

---

**Built with Braided** 🧶 **+ TypeScript** 💙 **= Interface-Based Heaven** 🔥
