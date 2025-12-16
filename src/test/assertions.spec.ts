import { describe, expect, test, vi } from "vitest";
import { defineResource, startSystem, haltSystem } from "../core";
import type { StartedResource } from "../resource";

/**
 * Tests for the assertion capability in resources.
 *
 * The `assert` function allows resources to validate their dependencies
 * before starting, ensuring that preconditions are met (e.g., database
 * is connected, configuration is valid, etc.).
 */

describe("Resource System - Assertions", () => {
  test("assertion passes when dependencies are valid", async () => {
    const dbResource = defineResource({
      start: () => ({
        connected: true,
        query: (sql: string) => `Result: ${sql}`,
      }),
      halt: () => {},
    });

    const apiResource = defineResource({
      dependencies: ["database"],
      assert: ({ database }: { database: StartedResource<typeof dbResource> }) => {
        if (!database.connected) {
          throw new Error("Database must be connected before starting API");
        }
      },
      start: ({ database }: { database: StartedResource<typeof dbResource> }) => ({
        getUsers: () => database.query("SELECT * FROM users"),
      }),
      halt: () => {},
    });

    const config = { database: dbResource, api: apiResource };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.database.connected).toBe(true);
    expect(system.api.getUsers()).toBe("Result: SELECT * FROM users");

    await haltSystem(config, system);
  });

  test("assertion fails when dependencies are invalid", async () => {
    const dbResource = defineResource({
      start: () => ({
        connected: false, // Not connected!
        query: (sql: string) => `Result: ${sql}`,
      }),
      halt: () => {},
    });

    const apiResource = defineResource({
      dependencies: ["database"],
      assert: ({ database }: { database: StartedResource<typeof dbResource> }) => {
        if (!database.connected) {
          throw new Error("Database must be connected before starting API");
        }
      },
      start: ({ database }: { database: StartedResource<typeof dbResource> }) => ({
        getUsers: () => database.query("SELECT * FROM users"),
      }),
      halt: () => {},
    });

    const config = { database: dbResource, api: apiResource };
    const { system, errors } = await startSystem(config);

    // Database should start successfully
    expect(system.database.connected).toBe(false);

    // API should fail to start due to assertion
    expect(system.api).toBeUndefined();

    // Error should be collected
    expect(errors.size).toBe(1);
    expect(errors.has("api")).toBe(true);
    expect(errors.get("api")?.message).toBe('Invalid dependencies for resource "api"');

    await haltSystem(config, system);
  });

  test("async assertion passes when dependencies are valid", async () => {
    const configResource = defineResource({
      start: async () => {
        // Simulate loading config
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          apiKey: "secret-key-123",
          timeout: 5000,
        };
      },
      halt: () => {},
    });

    const serviceResource = defineResource({
      dependencies: ["config"],
      assert: async ({
        config,
      }: {
        config: StartedResource<typeof configResource>;
      }) => {
        // Simulate async validation (e.g., checking with external service)
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (!config.apiKey || config.apiKey.length < 10) {
          throw new Error("Invalid API key");
        }
      },
      start: ({ config }: { config: StartedResource<typeof configResource> }) => ({
        makeRequest: () => `Request with key: ${config.apiKey}`,
      }),
      halt: () => {},
    });

    const config = { config: configResource, service: serviceResource };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.config.apiKey).toBe("secret-key-123");
    expect(system.service.makeRequest()).toBe(
      "Request with key: secret-key-123"
    );

    await haltSystem(config, system);
  });

  test("async assertion fails when validation fails", async () => {
    const configResource = defineResource({
      start: () => ({
        apiKey: "short", // Too short!
        timeout: 5000,
      }),
      halt: () => {},
    });

    const serviceResource = defineResource({
      dependencies: ["config"],
      assert: async ({
        config,
      }: {
        config: StartedResource<typeof configResource>;
      }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (!config.apiKey || config.apiKey.length < 10) {
          throw new Error("Invalid API key: must be at least 10 characters");
        }
      },
      start: ({ config }: { config: StartedResource<typeof configResource> }) => ({
        makeRequest: () => `Request with key: ${config.apiKey}`,
      }),
      halt: () => {},
    });

    const config = { config: configResource, service: serviceResource };
    const { system, errors } = await startSystem(config);

    expect(system.config.apiKey).toBe("short");
    expect(system.service).toBeUndefined();

    expect(errors.size).toBe(1);
    expect(errors.has("service")).toBe(true);
    const serviceError = errors.get("service");
    expect(serviceError?.message).toBe('Invalid dependencies for resource "service"');
    expect((serviceError as any)?.cause?.message).toContain("Invalid API key");

    await haltSystem(config, system);
  });

  test("assertion can validate multiple dependencies", async () => {
    const dbResource = defineResource({
      start: () => ({
        connected: true,
        version: "14.5",
      }),
      halt: () => {},
    });

    const cacheResource = defineResource({
      start: () => ({
        connected: true,
        type: "redis",
      }),
      halt: () => {},
    });

    const apiResource = defineResource({
      dependencies: ["database", "cache"],
      assert: ({
        database,
        cache,
      }: {
        database: StartedResource<typeof dbResource>;
        cache: StartedResource<typeof cacheResource>;
      }) => {
        if (!database.connected) {
          throw new Error("Database must be connected");
        }
        if (!cache.connected) {
          throw new Error("Cache must be connected");
        }
        // Check version compatibility
        const dbVersion = parseFloat(database.version);
        if (dbVersion < 14) {
          throw new Error("Database version must be at least 14");
        }
      },
      start: ({
        database,
        cache,
      }: {
        database: StartedResource<typeof dbResource>;
        cache: StartedResource<typeof cacheResource>;
      }) => ({
        getUsers: () => `Users from ${database.version} via ${cache.type}`,
      }),
      halt: () => {},
    });

    const config = {
      database: dbResource,
      cache: cacheResource,
      api: apiResource,
    };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.api.getUsers()).toBe("Users from 14.5 via redis");

    await haltSystem(config, system);
  });

  test("assertion fails when one of multiple dependencies is invalid", async () => {
    const dbResource = defineResource({
      start: () => ({
        connected: true,
        version: "13.2", // Too old!
      }),
      halt: () => {},
    });

    const cacheResource = defineResource({
      start: () => ({
        connected: true,
        type: "redis",
      }),
      halt: () => {},
    });

    const apiResource = defineResource({
      dependencies: ["database", "cache"],
      assert: ({
        database,
        cache,
      }: {
        database: StartedResource<typeof dbResource>;
        cache: StartedResource<typeof cacheResource>;
      }) => {
        if (!database.connected) {
          throw new Error("Database must be connected");
        }
        if (!cache.connected) {
          throw new Error("Cache must be connected");
        }
        const dbVersion = parseFloat(database.version);
        if (dbVersion < 14) {
          throw new Error("Database version must be at least 14");
        }
      },
      start: ({
        database,
        cache,
      }: {
        database: StartedResource<typeof dbResource>;
        cache: StartedResource<typeof cacheResource>;
      }) => ({
        getUsers: () => `Users from ${database.version} via ${cache.type}`,
      }),
      halt: () => {},
    });

    const config = {
      database: dbResource,
      cache: cacheResource,
      api: apiResource,
    };
    const { system, errors } = await startSystem(config);

    expect(system.database.connected).toBe(true);
    expect(system.cache.connected).toBe(true);
    expect(system.api).toBeUndefined();

    expect(errors.size).toBe(1);
    expect(errors.has("api")).toBe(true);
    const apiError = errors.get("api");
    expect(apiError?.message).toBe('Invalid dependencies for resource "api"');
    expect((apiError as any)?.cause?.message).toContain("Database version must be at least 14");

    await haltSystem(config, system);
  });

  test("assertion handles failed dependencies gracefully", async () => {
    const failingDbResource = defineResource({
      start: (): any => {
        throw new Error("Database connection failed");
      },
      halt: () => {},
    });

    const apiResource = defineResource({
      dependencies: ["database"],
      assert: ({
        database,
      }: {
        database?: StartedResource<typeof failingDbResource>;
      }) => {
        // This assertion should handle undefined gracefully
        if (!database) {
          throw new Error("Database dependency is required");
        }
        if (!database.connected) {
          throw new Error("Database must be connected");
        }
      },
      start: ({
        database,
      }: {
        database: StartedResource<typeof failingDbResource>;
      }) => ({
        getUsers: () => database.query("SELECT * FROM users"),
      }),
      halt: () => {},
    });

    const config = { database: failingDbResource, api: apiResource };
    const { system, errors } = await startSystem(config);

    // Both should fail
    expect(system.database).toBeUndefined();
    expect(system.api).toBeUndefined();

    // Both errors should be collected
    expect(errors.size).toBe(2);
    expect(errors.has("database")).toBe(true);
    expect(errors.has("api")).toBe(true);
    expect(errors.get("database")?.message).toBe("Database connection failed");
    const apiError = errors.get("api");
    expect(apiError?.message).toContain(
      'Missing required dependencies for resource "api"'
    );
    expect((apiError as any)?.cause?.message).toContain("Database dependency is required");

    await haltSystem(config, system);
  });

  test("resource without assertion starts normally", async () => {
    const simpleResource = defineResource({
      start: () => ({ value: "test" }),
      halt: () => {},
    });

    const config = { simple: simpleResource };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.simple.value).toBe("test");

    await haltSystem(config, system);
  });

  test("assertion with complex validation logic", async () => {
    type Permission = "read" | "write" | "admin";

    const authResource = defineResource({
      start: () => ({
        permissions: ["read", "write"] as Permission[],
        isAuthenticated: true,
      }),
      halt: () => {},
    });

    const adminPanelResource = defineResource({
      dependencies: ["auth"],
      assert: ({ auth }: { auth: StartedResource<typeof authResource> }) => {
        if (!auth.isAuthenticated) {
          throw new Error("User must be authenticated");
        }
        if (!auth.permissions.includes("admin")) {
          throw new Error(
            "Admin panel requires admin permissions. " +
              `Current permissions: ${auth.permissions.join(", ")}`
          );
        }
      },
      start: () => ({
        managedUsers: () => "Admin panel loaded",
      }),
      halt: () => {},
    });

    const config = { auth: authResource, adminPanel: adminPanelResource };
    const { system, errors } = await startSystem(config);

    expect(system.auth.isAuthenticated).toBe(true);
    expect(system.adminPanel).toBeUndefined();

    expect(errors.size).toBe(1);
    expect(errors.has("adminPanel")).toBe(true);
    const adminError = errors.get("adminPanel");
    expect(adminError?.message).toBe('Invalid dependencies for resource "adminPanel"');
    expect((adminError as any)?.cause?.message).toContain("Admin panel requires admin permissions");

    await haltSystem(config, system);
  });

  test("assertion runs before start function", async () => {
    const executionOrder: string[] = [];

    const baseResource = defineResource({
      start: () => {
        executionOrder.push("base-start");
        return { value: "base" };
      },
      halt: () => {},
    });

    const dependentResource = defineResource({
      dependencies: ["base"],
      assert: ({ base }: { base: StartedResource<typeof baseResource> }) => {
        executionOrder.push("dependent-assert");
        if (!base.value) {
          throw new Error("Base must have a value");
        }
      },
      start: () => {
        executionOrder.push("dependent-start");
        return { value: "dependent" };
      },
      halt: () => {},
    });

    const config = { base: baseResource, dependent: dependentResource };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(executionOrder).toEqual([
      "base-start",
      "dependent-assert",
      "dependent-start",
    ]);

    await haltSystem(config, system);
  });

  test("assertion failure prevents start from being called", async () => {
    const startSpy = vi.fn();

    const baseResource = defineResource({
      start: () => ({ ready: false }),
      halt: () => {},
    });

    const dependentResource = defineResource({
      dependencies: ["base"],
      assert: ({ base }: { base: StartedResource<typeof baseResource> }) => {
        if (!base.ready) {
          throw new Error("Base is not ready");
        }
      },
      start: () => {
        startSpy();
        return { value: "dependent" };
      },
      halt: () => {},
    });

    const config = { base: baseResource, dependent: dependentResource };
    const { system, errors } = await startSystem(config);

    expect(system.dependent).toBeUndefined();
    expect(startSpy).not.toHaveBeenCalled();
    expect(errors.size).toBe(1);
    expect(errors.has("dependent")).toBe(true);

    await haltSystem(config, system);
  });

  test("real-world example: server with database and cache", async () => {
    // Simulate a real-world scenario with database, cache, and HTTP server

    const databaseResource = defineResource({
      start: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          connected: true,
          host: "localhost:5432",
          pool: { size: 10, available: 10 },
        };
      },
      halt: async (db) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        db.connected = false;
      },
    });

    const cacheResource = defineResource({
      start: async () => {
        await new Promise((resolve) => setTimeout(resolve, 8));
        return {
          connected: true,
          host: "localhost:6379",
          ping: () => "PONG",
        };
      },
      halt: async (cache) => {
        await new Promise((resolve) => setTimeout(resolve, 3));
        cache.connected = false;
      },
    });

    const httpServerResource = defineResource({
      dependencies: ["database", "cache"],
      assert: async ({
        database,
        cache,
      }: {
        database: StartedResource<typeof databaseResource>;
        cache: StartedResource<typeof cacheResource>;
      }) => {
        // Validate database
        if (!database.connected) {
          throw new Error("Database must be connected before starting server");
        }
        if (database.pool.available < 5) {
          throw new Error(
            "Database pool must have at least 5 available connections"
          );
        }

        // Validate cache
        if (!cache.connected) {
          throw new Error("Cache must be connected before starting server");
        }

        // Test cache connectivity
        await new Promise((resolve) => setTimeout(resolve, 5));
        const pong = cache.ping();
        if (pong !== "PONG") {
          throw new Error("Cache health check failed");
        }
      },
      start: ({
        database,
        cache,
      }: {
        database: StartedResource<typeof databaseResource>;
        cache: StartedResource<typeof cacheResource>;
      }) => {
        return {
          listening: true,
          port: 3000,
          handleRequest: (path: string) =>
            `Handling ${path} with DB:${database.host} and Cache:${cache.host}`,
        };
      },
      halt: async (server) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        server.listening = false;
      },
    });

    const config = {
      database: databaseResource,
      cache: cacheResource,
      httpServer: httpServerResource,
    };

    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.database.connected).toBe(true);
    expect(system.cache.connected).toBe(true);
    expect(system.httpServer.listening).toBe(true);
    expect(system.httpServer.handleRequest("/users")).toContain(
      "localhost:5432"
    );
    expect(system.httpServer.handleRequest("/users")).toContain(
      "localhost:6379"
    );

    await haltSystem(config, system);

    expect(system.database.connected).toBe(false);
    expect(system.cache.connected).toBe(false);
    expect(system.httpServer.listening).toBe(false);
  });
});
