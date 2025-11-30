const { defineResource } = require("braided");
const Redis = require("ioredis");

/**
 * Redis Cache Resource
 * 
 * Production-ready cache using Redis.
 * Provides the same interface as the in-memory cache.
 */
const redisCacheResource = defineResource({
  dependencies: ["config"],
  start: async ({ config }) => {
    console.log("🔴 Connecting to Redis for cache...");
    
    const redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error("🔴 Redis connection failed after 3 retries");
          return null;
        }
        return Math.min(times * 100, 2000);
      },
    });

    const stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };

    // Wait for connection
    await new Promise((resolve, reject) => {
      redis.on("ready", () => {
        console.log("🔴 Redis cache connected");
        resolve();
      });
      redis.on("error", (err) => {
        console.error("🔴 Redis error:", err.message);
        reject(err);
      });
    });

    return {
      type: "redis",

      async set(key, value, ttl) {
        const serialized = JSON.stringify(value);
        if (ttl) {
          await redis.setex(key, ttl, serialized);
        } else {
          await redis.set(key, serialized);
        }
        stats.sets++;
      },

      async get(key) {
        const value = await redis.get(key);
        if (value === null) {
          stats.misses++;
          return null;
        }
        stats.hits++;
        return JSON.parse(value);
      },

      async has(key) {
        const exists = await redis.exists(key);
        return exists === 1;
      },

      async delete(key) {
        await redis.del(key);
        stats.deletes++;
      },

      async clear() {
        await redis.flushdb();
      },

      async size() {
        return await redis.dbsize();
      },

      async stats() {
        const size = await redis.dbsize();
        return {
          ...stats,
          size,
          hitRate: stats.hits / (stats.hits + stats.misses) || 0,
        };
      },

      _redis: redis,
    };
  },
  halt: async (cache) => {
    console.log("🔴 Disconnecting Redis cache...");
    await cache._redis.quit();
    console.log("🔴 Redis cache disconnected");
  },
});

module.exports = { redisCacheResource };

