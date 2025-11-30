const { defineResource } = require("braided");

/**
 * In-Memory Cache Resource
 * 
 * A simple in-memory cache implementation for testing and development.
 * Perfect for unit tests where you don't want to run Redis.
 */
const memoryCacheResource = defineResource({
  start: () => {
    const cache = new Map();
    const ttls = new Map(); // Track TTLs
    const stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };

    // Clean up expired entries
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of ttls.entries()) {
        if (expiry <= now) {
          cache.delete(key);
          ttls.delete(key);
        }
      }
    }, 1000);

    console.log("💾 In-memory cache initialized");

    return {
      type: "memory",

      async set(key, value, ttl) {
        cache.set(key, value);
        stats.sets++;

        if (ttl) {
          ttls.set(key, Date.now() + ttl * 1000);
        }
      },

      async get(key) {
        // Check if expired
        const expiry = ttls.get(key);
        if (expiry && expiry <= Date.now()) {
          cache.delete(key);
          ttls.delete(key);
          stats.misses++;
          return null;
        }

        const value = cache.get(key);
        if (value === undefined) {
          stats.misses++;
          return null;
        }

        stats.hits++;
        return value;
      },

      async has(key) {
        const expiry = ttls.get(key);
        if (expiry && expiry <= Date.now()) {
          cache.delete(key);
          ttls.delete(key);
          return false;
        }
        return cache.has(key);
      },

      async delete(key) {
        cache.delete(key);
        ttls.delete(key);
        stats.deletes++;
      },

      async clear() {
        cache.clear();
        ttls.clear();
      },

      async size() {
        // Clean expired first
        const now = Date.now();
        for (const [key, expiry] of ttls.entries()) {
          if (expiry <= now) {
            cache.delete(key);
            ttls.delete(key);
          }
        }
        return cache.size;
      },

      async stats() {
        return {
          ...stats,
          size: cache.size,
          hitRate: stats.hits / (stats.hits + stats.misses) || 0,
        };
      },

      _cleanup: () => {
        clearInterval(cleanupInterval);
      },
    };
  },
  halt: async (cache) => {
    cache._cleanup();
    await cache.clear();
    console.log("💾 In-memory cache disposed");
  },
});

module.exports = { memoryCacheResource };

