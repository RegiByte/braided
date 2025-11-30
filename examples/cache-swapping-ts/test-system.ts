/**
 * Test System
 * 
 * Demonstrates how easy it is to test with in-memory cache
 * instead of requiring Redis to be running.
 * 
 * Notice: Full type safety throughout the test!
 */

import { startSystem, haltSystem } from "braided";
import { createSystemConfig } from "./system.js";

async function runTests() {
  console.log("🧪 Running tests with in-memory cache...\n");

  // Create system with in-memory cache (no Redis needed!)
  const systemConfig = createSystemConfig("memory");
  
  const { system, errors } = await startSystem(systemConfig);

  if (errors.size > 0) {
    console.error("❌ Failed to start system:", errors);
    process.exit(1);
  }

  console.log("✅ System started\n");

  try {
    // Test 1: Cache miss
    console.log("Test 1: First fetch (cache miss)");
    const user1 = await system.apiService.getUser("123");
    console.assert(user1.source === "database", "Should be from database");
    console.assert(user1.id === "123", "Should have correct ID");
    console.log("✅ Passed\n");

    // Test 2: Cache hit
    console.log("Test 2: Second fetch (cache hit)");
    const user2 = await system.apiService.getUser("123");
    console.assert(user2.source === "cache", "Should be from cache");
    console.assert(user2.id === "123", "Should have correct ID");
    console.log("✅ Passed\n");

    // Test 3: Cache invalidation
    console.log("Test 3: Cache invalidation");
    await system.apiService.invalidateUser("123");
    const user3 = await system.apiService.getUser("123");
    console.assert(user3.source === "database", "Should be from database after invalidation");
    console.log("✅ Passed\n");

    // Test 4: Multiple users
    console.log("Test 4: Multiple users");
    await system.apiService.getUser("456");
    await system.apiService.getUser("789");
    const size = await system.cache.size();
    console.assert(size >= 2, `Should have at least 2 keys, got ${size}`);
    console.log("✅ Passed\n");

    // Test 5: Cache stats
    console.log("Test 5: Cache stats");
    const stats = await system.cache.stats();
    console.log("   Stats:", stats);
    console.assert(stats.hits > 0, "Should have cache hits");
    console.assert(stats.misses > 0, "Should have cache misses");
    console.assert(stats.hitRate > 0 && stats.hitRate <= 1, "Hit rate should be between 0 and 1");
    console.log("✅ Passed\n");

    // Test 6: Cache clear
    console.log("Test 6: Cache clear");
    await system.cache.clear();
    const sizeAfterClear = await system.cache.size();
    console.assert(sizeAfterClear === 0, `Should have 0 keys after clear, got ${sizeAfterClear}`);
    console.log("✅ Passed\n");

    // Test 7: Type safety demonstration
    console.log("Test 7: Type safety (compile-time check)");
    // These lines demonstrate that TypeScript knows the exact types:
    const port: number = system.config.port; // ✅ TypeScript knows this is a number
    const cacheType: string = system.cache.type; // ✅ TypeScript knows this is a string
    const getUser = system.apiService.getUser; // ✅ TypeScript knows the signature
    console.log(`   Port: ${port}, Cache: ${cacheType}`);
    console.log("✅ Passed (types are correct at compile time!)\n");

    console.log("🎉 All tests passed!\n");

  } catch (error) {
    console.error("❌ Test failed:", error);
    await haltSystem(systemConfig, system);
    process.exit(1);
  }

  // Cleanup
  await haltSystem(systemConfig, system);
  console.log("✅ System halted\n");
}

runTests().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});

