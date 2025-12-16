/**
 * Type tests for braided
 *
 * These tests validate TypeScript type inference and type safety.
 * They run at compile-time and ensure the library's types work as expected.
 */

import { describe, test, expectTypeOf } from "vitest";
import {
  defineResource,
  StartedResource,
  SystemConfig,
  StartedSystem,
  startSystem,
  haltSystem,
} from "../core";

describe("Type inference and safety", () => {
  describe("Resource type inference", () => {
    test("should infer resource type from start return value", () => {
      const resource = defineResource({
        start: () => ({
          value: 42,
          getValue: () => 42,
        }),
        halt: (instance) => {
          // Type test: instance should have inferred properties
          expectTypeOf(instance).toHaveProperty("value");
          expectTypeOf(instance).toHaveProperty("getValue");
          expectTypeOf(instance.value).toBeNumber();
          expectTypeOf(instance.getValue).toBeFunction();
          expectTypeOf(instance.getValue).returns.toBeNumber();
        },
      });

      expectTypeOf(resource).toMatchTypeOf<{
        start: (deps: any) => any;
        halt: (instance: any) => void | Promise<void>;
      }>();
    });

    test("should infer dependencies from start parameter", () => {
      const dbResource = defineResource({
        start: () => ({ query: (sql: string) => "result" }),
        halt: () => {},
      });

      const apiResource = defineResource({
        dependencies: ["database"],
        start: ({
          database,
        }: {
          database: StartedResource<typeof dbResource>;
        }) => {
          // Type test: database should have query method
          expectTypeOf(database.query).toBeFunction();
          expectTypeOf(database.query).parameter(0).toBeString();
          expectTypeOf(database.query).returns.toBeString();

          return { getUsers: () => database.query("SELECT * FROM users") };
        },
        halt: (api) => {
          // Type test: api should have getUsers method
          expectTypeOf(api.getUsers).toBeFunction();
        },
      });

      // Type test: apiResource should have the correct structure
      expectTypeOf(apiResource).toHaveProperty("dependencies");
      expectTypeOf(apiResource).toHaveProperty("start");
      expectTypeOf(apiResource).toHaveProperty("halt");
      expectTypeOf(apiResource.start).toBeFunction();
      expectTypeOf(apiResource.halt).toBeFunction();
    });

    test("should expand complex types in tooltips", () => {
      type ComplexAPI = {
        query: (sql: string) => Promise<unknown>;
        transaction: <T>(fn: () => T) => Promise<T>;
        close: () => void;
      };

      const resource = defineResource({
        start: (): ComplexAPI => ({
          query: async () => ({}),
          transaction: async (fn) => fn(),
          close: () => {},
        }),
        halt: (api) => {
          // Type test: api should show full ComplexAPI structure
          expectTypeOf(api).toHaveProperty("query");
          expectTypeOf(api).toHaveProperty("transaction");
          expectTypeOf(api).toHaveProperty("close");
          expectTypeOf(api.query).toBeFunction();
          expectTypeOf(api.transaction).toBeFunction();
          expectTypeOf(api.close).toBeFunction();
        },
      });
    });

    test("should handle async start functions", () => {
      const resource = defineResource({
        start: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { connected: true, disconnect: () => {} };
        },
        halt: (instance) => {
          // Type test: instance should be awaited type
          expectTypeOf(instance.connected).toBeBoolean();
          expectTypeOf(instance.disconnect).toBeFunction();
        },
      });
    });

    test("should handle resources with no dependencies", () => {
      const resource = defineResource({
        start: () => ({ value: "test" }),
        halt: () => {},
      });

      expectTypeOf(resource).toMatchTypeOf<{
        start: (deps: any) => any;
        halt: (instance: any) => void | Promise<void>;
      }>();
    });
  });

  describe("StartedResource type extraction", () => {
    test("should extract correct type from resource config", () => {
      const counterResource = defineResource({
        start: () => ({
          count: 0,
          increment: () => {},
          getCount: () => 0,
        }),
        halt: () => {},
      });

      type Counter = StartedResource<typeof counterResource>;

      expectTypeOf<Counter>().toHaveProperty("count");
      expectTypeOf<Counter>().toHaveProperty("increment");
      expectTypeOf<Counter>().toHaveProperty("getCount");
      expectTypeOf<Counter["count"]>().toBeNumber();
      expectTypeOf<Counter["increment"]>().toBeFunction();
      expectTypeOf<Counter["getCount"]>().toBeFunction();
    });

    test("should work with async resources", () => {
      const asyncResource = defineResource({
        start: async () => {
          return { loaded: true, data: "test" };
        },
        halt: () => {},
      });

      type AsyncData = StartedResource<typeof asyncResource>;

      expectTypeOf<AsyncData>().toHaveProperty("loaded");
      expectTypeOf<AsyncData>().toHaveProperty("data");
      expectTypeOf<AsyncData["loaded"]>().toBeBoolean();
      expectTypeOf<AsyncData["data"]>().toBeString();
    });
  });

  describe("SystemConfig and StartedSystem", () => {
    test("should infer correct system types", () => {
      const dbResource = defineResource({
        start: () => ({ query: (sql: string) => "result" }),
        halt: () => {},
      });

      const cacheResource = defineResource({
        start: () => ({ get: (key: string) => null, set: () => {} }),
        halt: () => {},
      });

      const apiResource = defineResource({
        dependencies: ["db", "cache"],
        start: ({
          db,
          cache,
        }: {
          db: { query: (sql: string) => string };
          cache: { get: (key: string) => any; set: () => void };
        }) => ({
          getUsers: () => db.query("SELECT * FROM users"),
          getCached: (key: string) => cache.get(key),
        }),
        halt: () => {},
      });

      const config = {
        db: dbResource,
        cache: cacheResource,
        api: apiResource,
      };

      type System = StartedSystem<typeof config>;

      // Type test: system should have all resources
      expectTypeOf<System>().toHaveProperty("db");
      expectTypeOf<System>().toHaveProperty("cache");
      expectTypeOf<System>().toHaveProperty("api");

      // Type test: db methods
      expectTypeOf<System["db"]["query"]>().toBeFunction();
      expectTypeOf<System["db"]["query"]>().parameter(0).toBeString();

      // Type test: cache methods
      expectTypeOf<System["cache"]["get"]>().toBeFunction();
      expectTypeOf<System["cache"]["set"]>().toBeFunction();

      // Type test: api methods
      expectTypeOf<System["api"]["getUsers"]>().toBeFunction();
      expectTypeOf<System["api"]["getCached"]>().toBeFunction();
    });

    test("should work with startSystem and haltSystem", async () => {
      const config = {
        counter: defineResource({
          start: () => ({ count: 0, increment: () => {} }),
          halt: () => {},
        }),
      };

      const { system, errors } = await startSystem(config);

      // Type test: system should have counter
      expectTypeOf(system).toHaveProperty("counter");
      expectTypeOf(system.counter.count).toBeNumber();
      expectTypeOf(system.counter.increment).toBeFunction();

      // Type test: errors should be Map
      expectTypeOf(errors).toEqualTypeOf<Map<string, Error>>();

      // Type test: haltSystem should accept config and system
      const haltResult = await haltSystem(config, system);
      expectTypeOf(haltResult.errors).toEqualTypeOf<Map<string, Error>>();
    });
  });

  describe("Dependency chain type safety", () => {
    test("should maintain types through dependency chain", () => {
      const configResource = defineResource({
        start: () => ({
          port: 3000,
          host: "localhost",
        }),
        halt: () => {},
      });

      const databaseResource = defineResource({
        dependencies: ["config"],
        start: ({
          config,
        }: {
          config: StartedResource<typeof configResource>;
        }) => {
          // Type test: config should have port and host
          expectTypeOf(config.port).toBeNumber();
          expectTypeOf(config.host).toBeString();

          return {
            connected: true,
            query: (sql: string) => "result",
          };
        },
        halt: () => {},
      });

      const apiResource = defineResource({
        dependencies: ["config", "database"],
        start: ({
          config,
          database,
        }: {
          config: StartedResource<typeof configResource>;
          database: StartedResource<typeof databaseResource>;
        }) => {
          // Type test: both dependencies should be typed
          expectTypeOf(config.port).toBeNumber();
          expectTypeOf(database.connected).toBeBoolean();
          expectTypeOf(database.query).toBeFunction();

          return {
            listen: () => `Listening on ${config.host}:${config.port}`,
            getUsers: () => database.query("SELECT * FROM users"),
          };
        },
        halt: () => {},
      });

      type API = StartedResource<typeof apiResource>;
      expectTypeOf<API["listen"]>().toBeFunction();
      expectTypeOf<API["getUsers"]>().toBeFunction();
    });
  });

  describe("Assert function type inference", () => {
    test("should infer deps type in assert function", () => {
      const dbResource = defineResource({
        start: () => ({ connected: true, version: "14.5" }),
        halt: () => {},
      });

      const apiResource = defineResource({
        dependencies: ["database"],
        assert: ({
          database,
        }: {
          database: StartedResource<typeof dbResource>;
        }) => {
          // Type test: database should be typed in assert
          expectTypeOf(database.connected).toBeBoolean();
          expectTypeOf(database.version).toBeString();

          if (!database.connected) {
            throw new Error("Database must be connected");
          }
        },
        start: ({
          database,
        }: {
          database: StartedResource<typeof dbResource>;
        }) => ({
          getUsers: () => `Using DB version ${database.version}`,
        }),
        halt: (instance) => {
          expectTypeOf(instance.getUsers).toBeFunction();
        },
      });
    });

    test("should allow async assert functions", () => {
      const configResource = defineResource({
        start: () => ({ apiKey: "secret-key-123", timeout: 5000 }),
        halt: () => {},
      });

      const serviceResource = defineResource({
        dependencies: ["config"],
        assert: async ({
          config,
        }: {
          config: StartedResource<typeof configResource>;
        }) => {
          // Type test: async assert should work
          await new Promise((resolve) => setTimeout(resolve, 5));

          expectTypeOf(config.apiKey).toBeString();
          expectTypeOf(config.timeout).toBeNumber();

          if (config.apiKey.length < 10) {
            throw new Error("Invalid API key");
          }
        },
        start: ({
          config,
        }: {
          config: StartedResource<typeof configResource>;
        }) => ({
          makeRequest: () => `Request with key: ${config.apiKey}`,
        }),
        halt: () => {},
      });
    });
  });

  describe("Optional dependencies typing", () => {
    test("optional deps are typed as possibly-undefined when using object form", () => {
      const baseResource = defineResource({
        start: () => ({ ready: true as const }),
        halt: () => {},
      });

      const consumerResource = defineResource({
        dependencies: { optional: ["base"] as const },
        start: ({
          base,
        }: {
          base: StartedResource<typeof baseResource> | undefined;
        }) => {
          return { hasBase: () => Boolean(base?.ready) };
        },
        halt: () => {},
      });

      type Deps = Parameters<(typeof consumerResource)["start"]>[0];
      expectTypeOf<Deps["base"]>().toEqualTypeOf<
        StartedResource<typeof baseResource> | undefined
      >();
    });

    test("optional deps are still opt-in at the type level", () => {
      // Note: Braided's optional/required split is enforced at runtime.
      // For TypeScript, you should model optional deps in your deps type as `T | undefined`.
      // This test is just a compile-time “usage pattern” reminder.
      expectTypeOf(true).toBeBoolean();
    });
  });

  describe("Real-world complex scenarios", () => {
    test("should handle multi-layer dependency graph", () => {
      // Layer 1: Config
      const configResource = defineResource({
        start: () => ({
          dbUrl: "postgres://localhost",
          cacheUrl: "redis://localhost",
          port: 3000,
        }),
        halt: () => {},
      });

      // Layer 2: Database and Cache (depend on config)
      const databaseResource = defineResource({
        dependencies: ["config"],
        start: ({
          config,
        }: {
          config: StartedResource<typeof configResource>;
        }) => ({
          url: config.dbUrl,
          query: (sql: string) => Promise.resolve([]),
          close: () => {},
        }),
        halt: (db) => db.close(),
      });

      const cacheResource = defineResource({
        dependencies: ["config"],
        start: ({
          config,
        }: {
          config: StartedResource<typeof configResource>;
        }) => ({
          url: config.cacheUrl,
          get: (key: string) => null,
          set: (key: string, value: any) => {},
        }),
        halt: () => {},
      });

      // Layer 3: API (depends on database and cache)
      const apiResource = defineResource({
        dependencies: ["database", "cache"],
        start: ({
          database,
          cache,
        }: {
          database: StartedResource<typeof databaseResource>;
          cache: StartedResource<typeof cacheResource>;
        }) => {
          expectTypeOf(database.query).toBeFunction();
          expectTypeOf(cache.get).toBeFunction();

          return {
            getUsers: async () => {
              const cached = cache.get("users");
              if (cached) return cached;
              const users = await database.query("SELECT * FROM users");
              cache.set("users", users);
              return users;
            },
          };
        },
        halt: () => {},
      });

      // Layer 4: HTTP Server (depends on config and api)
      const httpServerResource = defineResource({
        dependencies: ["config", "api"],
        start: ({
          config,
          api,
        }: {
          config: StartedResource<typeof configResource>;
          api: StartedResource<typeof apiResource>;
        }) => {
          expectTypeOf(config.port).toBeNumber();
          expectTypeOf(api.getUsers).toBeFunction();

          return {
            port: config.port,
            handleRequest: (path: string) => {
              if (path === "/users") return api.getUsers();
            },
            close: () => {},
          };
        },
        halt: (server) => server.close(),
      });

      const system = {
        config: configResource,
        database: databaseResource,
        cache: cacheResource,
        api: apiResource,
        httpServer: httpServerResource,
      };

      type System = StartedSystem<typeof system>;

      // Type test: all resources should be typed
      expectTypeOf<System["config"]["port"]>().toBeNumber();
      expectTypeOf<System["database"]["query"]>().toBeFunction();
      expectTypeOf<System["cache"]["get"]>().toBeFunction();
      expectTypeOf<System["api"]["getUsers"]>().toBeFunction();
      expectTypeOf<System["httpServer"]["handleRequest"]>().toBeFunction();
    });
  });

  describe("Works with classes", () => {
    test("should work with classes", () => {
      class Database {
        constructor(public url: string) {}

        query(sql: string) {
          return Promise.resolve([]);
        }

        close() {
          return Promise.resolve();
        }
      }

      const databaseResource = defineResource({
        start: () => new Database("postgres://localhost"),
        halt: (instance) => {
          expectTypeOf(instance.url).toBeString();
          expectTypeOf(instance).toHaveProperty("url");
          expectTypeOf(instance).toHaveProperty("query");
          expectTypeOf(instance).toHaveProperty("close");
          expectTypeOf(instance.query).toBeFunction();
          expectTypeOf(instance.close).toBeFunction();
        },
      });

      const system = {
        database: databaseResource,
      };

      type System = StartedSystem<typeof system>;

      expectTypeOf<System["database"]["query"]>().toBeFunction();
      expectTypeOf<System["database"]["close"]>().toBeFunction();
      expectTypeOf<System["database"]["url"]>().toBeString();
      expectTypeOf<System["database"]>().toHaveProperty("url");
      expectTypeOf<System["database"]>().toHaveProperty("query");
      expectTypeOf<System["database"]>().toHaveProperty("close");
      expectTypeOf<System["database"]>().toExtend<Database>();

      class CacheManager {
        constructor(public url: string) {}

        get(key: string) {
          return Promise.resolve(null);
        }

        set(key: string, value: any) {
          return Promise.resolve();
        }

        close() {
          return Promise.resolve();
        }
      }

      const cacheManagerResource = defineResource({
        dependencies: ["database"],
        start: ({
          database,
        }: {
          database: StartedResource<typeof databaseResource>;
        }) => {
          return new CacheManager("redis://localhost");
        },
        halt: (instance) => {
          expectTypeOf(instance.url).toBeString();
          expectTypeOf(instance).toHaveProperty("url");
          expectTypeOf(instance).toHaveProperty("get");
          expectTypeOf(instance).toHaveProperty("set");
          expectTypeOf(instance).toHaveProperty("close");
        },
      });

      const system2 = {
        database: databaseResource,
        cacheManager: cacheManagerResource,
      };

      type System2 = StartedSystem<typeof system2>;

      expectTypeOf<System2["database"]["query"]>().toBeFunction();
      expectTypeOf<System2["database"]["close"]>().toBeFunction();
      expectTypeOf<System2["database"]["url"]>().toBeString();
      expectTypeOf<System2["database"]>().toHaveProperty("url");
      expectTypeOf<System2["database"]>().toHaveProperty("query");
      expectTypeOf<System2["database"]>().toHaveProperty("close");
      expectTypeOf<System2["database"]>().toExtend<Database>();
      expectTypeOf<System2["cacheManager"]["get"]>().toBeFunction();
      expectTypeOf<System2["cacheManager"]["set"]>().toBeFunction();
      expectTypeOf<System2["cacheManager"]["close"]>().toBeFunction();
      expectTypeOf<System2["cacheManager"]["url"]>().toBeString();
      expectTypeOf<System2["cacheManager"]>().toHaveProperty("url");
      expectTypeOf<System2["cacheManager"]>().toHaveProperty("get");
      expectTypeOf<System2["cacheManager"]>().toHaveProperty("set");
      expectTypeOf<System2["cacheManager"]>().toHaveProperty("close");
      expectTypeOf<System2["cacheManager"]>().toExtend<CacheManager>();
    });
  });
});
