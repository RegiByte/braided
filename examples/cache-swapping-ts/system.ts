import {
  defineResource,
  startSystem,
  haltSystem,
  StartedResource,
} from "braided";
import express from "express";
import type { CacheInterface } from "./cache-interface.js";
import { memoryCacheResource } from "./cache-memory.js";
import { redisCacheResource } from "./cache-redis.js";
import { ConfigInterface } from "./config-interface.js";

/**
 * Configuration Resource
 */
const configResource = defineResource({
  start: () => {
    const cacheType = process.env.CACHE_TYPE || "memory";

    return {
      port: parseInt(process.env.PORT || "3000", 10),
      cacheType,
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
      },
    };
  },
  halt: () => {
    console.log("📋 Config disposed");
  },
});

/**
 * API Service Resource
 *
 * This is the key: the API uses the cache interface without knowing
 * whether it's Redis or in-memory. Same code, different implementations!
 *
 * Notice: We only type 'cache' as CacheInterface - TypeScript handles the rest!
 */
const apiServiceResource = defineResource({
  dependencies: ["cache"] as const,
  assert: ({ cache }: { cache: CacheInterface }) => {
    if (!cache) {
      throw new Error("Cache is required for this API to work");
    }
  },
  start: ({ cache }: { cache: CacheInterface }) => {
    console.log(`🚀 API service starting with ${cache.type} cache`);

    return {
      // Simulate fetching user data (with caching)
      async getUser(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        fetchedAt: string;
        source: string;
      }> {
        const cacheKey = `user:${userId}`;

        // Try cache first
        const cached = await cache.get(cacheKey);
        if (cached) {
          console.log(`✅ Cache hit for ${cacheKey}`);
          return { ...cached, source: "cache" };
        }

        console.log(`❌ Cache miss for ${cacheKey}`);

        // Simulate database fetch
        const user = {
          id: userId,
          name: `User ${userId}`,
          email: `user${userId}@example.com`,
          fetchedAt: new Date().toISOString(),
        };

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Store in cache with 60s TTL
        await cache.set(cacheKey, user, 60);

        return { ...user, source: "database" };
      },

      // Simulate fetching posts (with caching)
      async getPosts(userId: string): Promise<{
        posts: { id: number; title: string; userId: string }[];
        source: string;
      }> {
        const cacheKey = `posts:${userId}`;

        const cached = await cache.get(cacheKey);
        if (cached) {
          console.log(`✅ Cache hit for ${cacheKey}`);
          return { ...cached, source: "cache" };
        }

        console.log(`❌ Cache miss for ${cacheKey}`);

        const posts = [
          { id: 1, title: "First Post", userId },
          { id: 2, title: "Second Post", userId },
        ];

        await cache.set(cacheKey, posts, 30);

        return { posts, source: "database" };
      },

      // Invalidate user cache
      async invalidateUser(userId: string) {
        await cache.delete(`user:${userId}`);
        await cache.delete(`posts:${userId}`);
        console.log(`🗑️  Invalidated cache for user ${userId}`);
      },
    };
  },
  halt: () => {
    console.log("🚀 API service disposed");
  },
});

/**
 * HTTP Server Resource
 */
const httpServerResource = defineResource({
  dependencies: ["config", "cache", "apiService"] as const,
  start: ({
    config,
    cache,
    apiService,
  }: {
    config: ConfigInterface;
    cache: CacheInterface;
    apiService: StartedResource<typeof apiServiceResource>;
  }) => {
    const app = express();
    app.use(express.json());

    // Health check
    app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        cacheType: cache.type,
      });
    });

    // Get user endpoint
    app.get("/users/:id", async (req, res) => {
      try {
        const user = await apiService.getUser(req.params.id);
        res.json(user);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get user posts
    app.get("/users/:id/posts", async (req, res) => {
      try {
        const posts = await apiService.getPosts(req.params.id);
        res.json(posts);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Invalidate user cache
    app.delete("/users/:id/cache", async (req, res) => {
      try {
        await apiService.invalidateUser(req.params.id);
        res.json({ message: "Cache invalidated" });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Cache stats
    app.get("/cache/stats", async (req, res) => {
      try {
        const stats = await cache.stats();
        res.json({ ...stats, type: cache.type });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Clear cache
    app.delete("/cache", async (req, res) => {
      try {
        await cache.clear();
        res.json({ message: "Cache cleared" });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    return new Promise((resolve) => {
      const server = app.listen(config.port, (error?: Error) => {
        if (error) {
          console.error("Error starting HTTP server", error);
          resolve(null);
          return;
        }
        console.log(`🌐 HTTP server listening on port ${config.port}`);
        resolve(server);
      });
    }) as Promise<ReturnType<typeof app.listen> | null>;
  },
  halt: (server) => {
    return new Promise<void>((resolve) => {
      console.log("🌐 Closing HTTP server...");
      server?.close((error?: Error) => {
        if (error) {
          console.error("Error closing HTTP server", error);
          resolve();
          return;
        }
        console.log("🌐 HTTP server closed");
        resolve();
      });
    });
  },
});

/**
 * Create System Configuration
 *
 * This function allows us to choose which cache implementation to use.
 * The beauty: Everything is fully typed, no matter which cache we choose!
 */
export function createSystemConfig(cacheType: "memory" | "redis" = "memory") {
  // Choose cache implementation based on type
  const cacheResource =
    cacheType === "redis" ? redisCacheResource : memoryCacheResource;

  return {
    config: configResource,
    cache: cacheResource, // This is the swap point!
    apiService: apiServiceResource,
    httpServer: httpServerResource,
  };
}

/**
 * Main Entry Point
 */
async function main() {
  console.log("🧶 Starting Braided Cache Swapping Example (TypeScript)...\n");

  const cacheType = (process.env.CACHE_TYPE || "memory") as "memory" | "redis";
  const systemConfig = createSystemConfig(cacheType);

  const { system, errors } = await startSystem(systemConfig);

  if (errors.size > 0) {
    console.error("❌ Errors starting system:");
    for (const [resource, error] of errors) {
      console.error(`   - ${resource}:`, error.message);
      if (error.cause) {
        console.error(`      - Cause:`, (error.cause as Error).message);
      }
    }
    await haltSystem(systemConfig, system);
    process.exit(1);
  }

  console.log("\n✨ System started successfully!");
  console.log(`📍 Server: http://localhost:${system.config.port}`);
  console.log(`💾 Cache type: ${system.cache.type}`);
  console.log(
    "\n📖 Try these commands in another terminal (copy-paste ready):"
  );
  console.log(
    `\n   # Get user (first time: cache miss, second time: cache hit)`
  );
  console.log(`   curl http://localhost:${system.config.port}/users/123`);
  console.log(`\n   # Get user posts`);
  console.log(`   curl http://localhost:${system.config.port}/users/123/posts`);
  console.log(`\n   # View cache statistics`);
  console.log(`   curl http://localhost:${system.config.port}/cache/stats`);
  console.log(`\n   # Invalidate user cache`);
  console.log(
    `   curl -X DELETE http://localhost:${system.config.port}/users/123/cache`
  );
  console.log(`\n   # Clear all cache`);
  console.log(`   curl -X DELETE http://localhost:${system.config.port}/cache`);
  console.log("\n🛑 Press Ctrl+C for graceful shutdown\n");

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log(`\n\n🛑 Received ${signal}, shutting down...\n`);

    const stats = await system.cache.stats();
    console.log("📊 Final Cache Stats:");
    console.log(`   - Type: ${system.cache.type}`);
    console.log(`   - Size: ${stats.size} keys`);
    console.log(`   - Hits: ${stats.hits}`);
    console.log(`   - Misses: ${stats.misses}`);
    console.log(`   - Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%\n`);

    const { errors: haltErrors } = await haltSystem(systemConfig, system);

    if (haltErrors.size > 0) {
      console.error("\n❌ Errors during shutdown:");
      for (const [resource, error] of haltErrors) {
        console.error(`   - ${resource}:`, error.message);
      }
      process.exit(1);
    }

    console.log("\n✅ System halted successfully. Goodbye! 👋\n");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  });
}
