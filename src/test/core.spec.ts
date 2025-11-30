import { beforeEach, describe, expect, test, vi } from "vitest";
import { defineResource, startSystem, haltSystem } from "../core";
import type { StartedResource } from "../resource";

/**
 * Mock Resources for Testing
 */

// Simple counter resource with no dependencies
const counterResource = defineResource({
  start: () => {
    let count = 0;
    return {
      count,
      increment: () => {
        count++;
      },
      getCount: () => count,
    };
  },
  halt: (instance) => {
    // Reset count on halt
    instance.count = 0;
  },
});

// Logger resource that depends on counter
const loggerResource = defineResource<{
  counter: StartedResource<typeof counterResource>;
}>({
  dependencies: ["counter"],
  start: ({ counter }) => {
    const logs: Array<string> = [];
    return {
      logs,
      log: (message: string) => {
        logs.push(message);
      },
      logCount: () => {
        logs.push(`Counter is at: ${counter.getCount()}`);
      },
    };
  },
  halt: (instance) => {
    instance.logs = [];
  },
});

// Resource that fails on start
const failingResource = defineResource({
  start: (): any => {
    throw new Error("Intentional failure");
  },
  halt: () => {
    // Never called since start fails
  },
});

// Resource that depends on a failing resource
const dependsOnFailingResource = defineResource<{
  failing: StartedResource<typeof failingResource>;
}>({
  dependencies: ["failing"],
  start: ({ failing }) => {
    if (!failing) {
      return { value: "degraded mode" };
    }
    return { value: "normal mode" };
  },
  halt: () => {},
});

describe("Resource System - Basic Lifecycle", () => {
  test("starts and halts a single resource", async () => {
    const config = { counter: counterResource };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.counter).toBeDefined();
    expect(system.counter.count).toBe(0);

    system.counter.increment();
    expect(system.counter.getCount()).toBe(1);

    await haltSystem(config, system);
    expect(system.counter.count).toBe(0); // Reset by halt
  });

  test("starts multiple independent resources", async () => {
    const halt1 = vi.fn();
    const halt2 = vi.fn();

    const resource1 = defineResource({
      start: () => ({ value: 1 }),
      halt: halt1,
    });

    const resource2 = defineResource({
      start: () => ({ value: 2 }),
      halt: halt2,
    });

    const config = { r1: resource1, r2: resource2 };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.r1.value).toBe(1);
    expect(system.r2.value).toBe(2);

    await haltSystem(config, system);

    expect(halt1).toHaveBeenCalled();
    expect(halt2).toHaveBeenCalled();
  });

  test("handles async start functions", async () => {
    const asyncResource = defineResource({
      start: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { loaded: true };
      },
      halt: () => {},
    });

    const config = { async: asyncResource };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.async.loaded).toBe(true);

    await haltSystem(config, system);
  });

  test("handles async halt functions", async () => {
    const haltSpy = vi.fn();
    const asyncHaltResource = defineResource({
      start: () => ({ value: "test" }),
      halt: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        haltSpy();
      },
    });

    const config = { asyncHalt: asyncHaltResource };
    const { system } = await startSystem(config);

    const { errors } = await haltSystem(config, system);

    expect(errors.size).toBe(0);
    expect(haltSpy).toHaveBeenCalled();
  });
});

describe("Resource System - Dependency Ordering", () => {
  test("starts resources in dependency order", async () => {
    const startOrder: Array<string> = [];

    const base = defineResource({
      start: () => {
        startOrder.push("base");
        return { value: "base" };
      },
      halt: () => {},
    });

    const dependent = defineResource<{ base: StartedResource<typeof base> }>({
      dependencies: ["base"],
      start: ({ base: baseInstance }) => {
        startOrder.push("dependent");
        return { value: `depends on ${baseInstance.value}` };
      },
      halt: () => {},
    });

    const config = {
      base,
      dependent,
    };

    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(startOrder).toEqual(["base", "dependent"]);
    expect(system.dependent.value).toBe("depends on base");

    await haltSystem(config, system);
  });

  test("halts resources in reverse dependency order", async () => {
    const haltOrder: Array<string> = [];

    const baseResource = defineResource({
      start: () => ({ value: "base" }),
      halt: () => {
        haltOrder.push("base");
      },
    });

    const dependentResource = defineResource<{
      base: StartedResource<typeof baseResource>;
    }>({
      dependencies: ["base"],
      start: () => ({ value: "dependent" }),
      halt: () => {
        haltOrder.push("dependent");
      },
    });

    const config = { base: baseResource, dependent: dependentResource };
    const { system } = await startSystem(config);

    await haltSystem(config, system);

    expect(haltOrder).toEqual(["dependent", "base"]);
  });

  test("handles complex dependency chains", async () => {
    const startOrder: Array<string> = [];

    const a = defineResource({
      start: () => {
        startOrder.push("a");
        return { value: "a" };
      },
      halt: () => {},
    });

    const b = defineResource<{ a: StartedResource<typeof a> }>({
      dependencies: ["a"],
      start: () => {
        startOrder.push("b");
        return { value: "b" };
      },
      halt: () => {},
    });

    const c = defineResource<{ a: StartedResource<typeof a> }>({
      dependencies: ["a"],
      start: () => {
        startOrder.push("c");
        return { value: "c" };
      },
      halt: () => {},
    });

    const d = defineResource<{
      b: StartedResource<typeof b>;
      c: StartedResource<typeof c>;
    }>({
      dependencies: ["b", "c"],
      start: () => {
        startOrder.push("d");
        return { value: "d" };
      },
      halt: () => {},
    });

    const config = { a, b, c, d };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    // 'a' must be first, 'd' must be last
    expect(startOrder[0]).toBe("a");
    expect(startOrder[3]).toBe("d");

    // 'b' and 'c' can be in any order (both depend only on 'a')
    expect(startOrder.slice(1, 3)).toContain("b");
    expect(startOrder.slice(1, 3)).toContain("c");

    await haltSystem(config, system);
  });

  test("detects circular dependencies", async () => {
    const a = defineResource<{ b: any }>({
      dependencies: ["b"],
      start: () => ({ value: "a" }),
      halt: () => {},
    });

    const b = defineResource<{ a: StartedResource<typeof a> }>({
      dependencies: ["a"],
      start: () => ({ value: "b" }),
      halt: () => {},
    });

    const config = { a, b };

    await expect(startSystem(config)).rejects.toThrow(
      "Circular dependency detected"
    );
  });

  test("throws error for missing dependency", async () => {
    const dependent = defineResource({
      dependencies: ["missing"],
      start: () => ({ value: "dependent" }),
      halt: () => {},
    });

    const config = { dependent };

    await expect(startSystem(config)).rejects.toThrow(
      'depends on "missing" which doesn\'t exist'
    );
  });

  test("handles diamond dependency pattern", async () => {
    const startOrder: Array<string> = [];

    //     A
    //    / \
    //   B   C
    //    \ /
    //     D

    const a = defineResource({
      start: () => {
        startOrder.push("a");
        return { value: "a" };
      },
      halt: () => {},
    });

    const b = defineResource<{ a: StartedResource<typeof a> }>({
      dependencies: ["a"],
      start: () => {
        startOrder.push("b");
        return { value: "b" };
      },
      halt: () => {},
    });

    const c = defineResource<{ a: StartedResource<typeof a> }>({
      dependencies: ["a"],
      start: () => {
        startOrder.push("c");
        return { value: "c" };
      },
      halt: () => {},
    });

    const d = defineResource<{
      b: StartedResource<typeof b>;
      c: StartedResource<typeof c>;
    }>({
      dependencies: ["b", "c"],
      start: () => {
        startOrder.push("d");
        return { value: "d" };
      },
      halt: () => {},
    });

    const config = { a, b, c, d };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(startOrder[0]).toBe("a");
    expect(startOrder[3]).toBe("d");

    await haltSystem(config, system);
  });
});

describe("Resource System - Error Handling", () => {
  test("continues system startup when one resource fails", async () => {
    const config = {
      counter: counterResource,
      failing: failingResource,
    };

    const { system, errors } = await startSystem(config);

    // Counter should start successfully
    expect(system.counter).toBeDefined();
    expect(system.counter.count).toBe(0);

    // Failing resource should be undefined
    expect(system.failing).toBeUndefined();

    // Error should be collected
    expect(errors.size).toBe(1);
    expect(errors.has("failing")).toBe(true);
    expect(errors.get("failing")?.message).toBe("Intentional failure");

    await haltSystem(config, system);
  });

  test("dependent resources receive undefined for failed dependencies", async () => {
    const config = {
      failing: failingResource,
      dependsOnFailing: dependsOnFailingResource,
    };

    const { system, errors } = await startSystem(config);

    // Dependent should start in degraded mode
    expect(system.dependsOnFailing).toBeDefined();
    expect(system.dependsOnFailing.value).toBe("degraded mode");

    // Only the failing resource should have an error
    expect(errors.size).toBe(1);
    expect(errors.has("failing")).toBe(true);

    await haltSystem(config, system);
  });

  test("collects halt errors but continues halting other resources", async () => {
    const errorOnHalt = defineResource({
      start: () => ({ value: "test" }),
      halt: () => {
        throw new Error("Halt failed");
      },
    });

    const normal = defineResource({
      start: () => ({ value: "normal" }),
      halt: () => {},
    });

    const config = { errorOnHalt, normal };
    const { system } = await startSystem(config);

    const { errors } = await haltSystem(config, system);

    // Error should be collected
    expect(errors.size).toBe(1);
    expect(errors.has("errorOnHalt")).toBe(true);
    expect(errors.get("errorOnHalt")?.message).toBe("Halt failed");
  });

  test("handles async errors in start", async () => {
    const asyncFailingResource = defineResource({
      start: async (): Promise<any> => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("Async failure");
      },
      halt: () => {},
    });

    const config = { asyncFailing: asyncFailingResource };
    const { system, errors } = await startSystem(config);

    expect(system.asyncFailing).toBeUndefined();
    expect(errors.size).toBe(1);
    expect(errors.has("asyncFailing")).toBe(true);
    expect(errors.get("asyncFailing")?.message).toBe("Async failure");
  });
});

describe("Resource System - Integration Examples", () => {
  test("counter and logger work together", async () => {
    const config = {
      counter: counterResource,
      logger: loggerResource,
    };

    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);

    // Use counter
    system.counter.increment();
    system.counter.increment();
    expect(system.counter.getCount()).toBe(2);

    // Logger can access counter
    system.logger.log("Starting test");
    system.logger.logCount();
    system.logger.log("Ending test");

    expect(system.logger.logs).toEqual([
      "Starting test",
      "Counter is at: 2",
      "Ending test",
    ]);

    await haltSystem(config, system);

    // After halt, state is reset
    expect(system.counter.count).toBe(0);
    expect(system.logger.logs).toEqual([]);
  });

  test("simulates database connection with dependent API service", async () => {
    const dbResource = defineResource({
      start: async () => {
        // Simulate connection delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          connected: true,
          query: (sql: string) => `Result for: ${sql}`,
        };
      },
      halt: async (db) => {
        // Simulate cleanup
        await new Promise((resolve) => setTimeout(resolve, 5));
        db.connected = false;
      },
    });

    const apiResource = defineResource<{
      database: StartedResource<typeof dbResource>;
    }>({
      dependencies: ["database"],
      start: ({ database }) => {
        return {
          getUsers: () => database.query("SELECT * FROM users"),
        };
      },
      halt: () => {},
    });

    const config = { database: dbResource, api: apiResource };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.database.connected).toBe(true);
    expect(system.api.getUsers()).toBe("Result for: SELECT * FROM users");

    await haltSystem(config, system);

    expect(system.database.connected).toBe(false);
  });

  test("simulates WebSocket server with message handler", async () => {
    const messages: Array<string> = [];

    const wsServerResource = defineResource({
      start: () => {
        return {
          clients: new Set<string>(),
          broadcast: (msg: string) => {
            messages.push(msg);
          },
          addClient: (id: string) => {
            messages.push(`Client ${id} connected`);
          },
        };
      },
      halt: (server) => {
        server.clients.clear();
        messages.push("Server closed");
      },
    });

    const messageHandlerResource = defineResource<{
      wsServer: StartedResource<typeof wsServerResource>;
    }>({
      dependencies: ["wsServer"],
      start: ({ wsServer }) => {
        return {
          handleMessage: (msg: string) => {
            wsServer.broadcast(`Handled: ${msg}`);
          },
        };
      },
      halt: () => {},
    });

    const config = {
      wsServer: wsServerResource,
      messageHandler: messageHandlerResource,
    };

    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);

    system.wsServer.addClient("client-1");
    system.messageHandler.handleMessage("Hello");

    expect(messages).toEqual(["Client client-1 connected", "Handled: Hello"]);

    await haltSystem(config, system);

    expect(messages).toContain("Server closed");
  });

  test("multiple start/halt cycles work correctly", async () => {
    const config = { counter: counterResource };

    // First cycle
    const result1 = await startSystem(config);
    expect(result1.errors.size).toBe(0);
    result1.system.counter.increment();
    expect(result1.system.counter.getCount()).toBe(1);
    await haltSystem(config, result1.system);

    // Second cycle - should get a fresh instance
    const result2 = await startSystem(config);
    expect(result2.errors.size).toBe(0);
    expect(result2.system.counter.getCount()).toBe(0);
    expect(result2.system.counter).not.toBe(result1.system.counter);
    await haltSystem(config, result2.system);

    // Third cycle
    const result3 = await startSystem(config);
    expect(result3.errors.size).toBe(0);
    expect(result3.system.counter.getCount()).toBe(0);
    await haltSystem(config, result3.system);
  });

  test("system state is isolated between instances", async () => {
    const config = {
      counter: counterResource,
      logger: loggerResource,
    };

    // Start first system and use it
    const result1 = await startSystem(config);
    expect(result1.errors.size).toBe(0);
    result1.system.counter.increment();
    result1.system.counter.increment();
    result1.system.logger.log("System 1 message");

    expect(result1.system.counter.getCount()).toBe(2);
    expect(result1.system.logger.logs).toHaveLength(1);

    // Start second system - should have clean state
    const result2 = await startSystem(config);
    expect(result2.errors.size).toBe(0);
    expect(result2.system.counter.getCount()).toBe(0);
    expect(result2.system.logger.logs).toHaveLength(0);

    // Modify second system
    result2.system.counter.increment();
    result2.system.logger.log("System 2 message");

    // First system should be unchanged
    expect(result1.system.counter.getCount()).toBe(2);
    expect(result1.system.logger.logs).toHaveLength(1);

    // Second system has its own state
    expect(result2.system.counter.getCount()).toBe(1);
    expect(result2.system.logger.logs).toHaveLength(1);

    await haltSystem(config, result1.system);
    await haltSystem(config, result2.system);
  });
});

describe("Resource System - Type Safety", () => {
  test("provides correct types for started resources", async () => {
    const config = {
      counter: counterResource,
      logger: loggerResource,
    };

    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);

    // TypeScript should infer these correctly
    const count: number = system.counter.getCount();
    const logs: Array<string> = system.logger.logs;

    expect(typeof count).toBe("number");
    expect(Array.isArray(logs)).toBe(true);

    await haltSystem(config, system);
  });

  test("defineResource helper provides type inference", async () => {
    // This test mainly validates TypeScript compilation
    const typedResource = defineResource<{
      counter: { getCount: () => number };
    }>({
      dependencies: ["counter"],
      start: ({ counter }) => {
        // TypeScript should know counter has getCount method
        const count = counter.getCount();
        return { doubled: count * 2 };
      },
      halt: () => {},
    });

    expect(typedResource.dependencies).toEqual(["counter"]);
  });
});
