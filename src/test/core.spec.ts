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
const loggerResource = defineResource({
  dependencies: ["counter"],
  start: ({
    counter,
  }: {
    counter: StartedResource<typeof counterResource>;
  }) => {
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
const dependsOnFailingResource = defineResource({
  // Optional dependency: this resource can run in degraded mode
  dependencies: { optional: ["failing"] },
  start: ({
    failing,
  }: {
    failing?: StartedResource<typeof failingResource>;
  }) => {
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

    const dependent = defineResource({
      dependencies: ["base"],
      start: ({
        base: baseInstance,
      }: {
        base: StartedResource<typeof base>;
      }) => {
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

    const dependentResource = defineResource({
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

    const b = defineResource({
      dependencies: ["a"],
      start: () => {
        startOrder.push("b");
        return { value: "b" };
      },
      halt: () => {},
    });

    const c = defineResource({
      dependencies: ["a"],
      start: () => {
        startOrder.push("c");
        return { value: "c" };
      },
      halt: () => {},
    });

    const d = defineResource({
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
    const a = defineResource({
      dependencies: ["b"],
      start: () => ({ value: "a" }),
      halt: () => {},
    });

    const b = defineResource({
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

    const b = defineResource({
      dependencies: ["a"],
      start: () => {
        startOrder.push("b");
        return { value: "b" };
      },
      halt: () => {},
    });

    const c = defineResource({
      dependencies: ["a"],
      start: () => {
        startOrder.push("c");
        return { value: "c" };
      },
      halt: () => {},
    });

    const d = defineResource({
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

describe("Resource System - Required vs Optional Dependencies", () => {
  test("resource with required dependency (array form) blocks when dependency fails", async () => {
    // Array form means all deps are required by default
    const requiredDependent = defineResource({
      dependencies: ["failing"],
      start: ({ failing }: { failing: any }) => ({
        value: "should not start",
      }),
      halt: () => {},
    });

    const config = {
      failing: failingResource,
      requiredDependent,
    };

    const { system, errors } = await startSystem(config);

    // Resource should not start because required dependency failed
    expect(system.requiredDependent).toBeUndefined();
    expect(errors.size).toBe(2); // Both failing and requiredDependent
    expect(errors.has("failing")).toBe(true);
    expect(errors.has("requiredDependent")).toBe(true);
    expect(errors.get("requiredDependent")?.message).toContain(
      "Missing required dependencies"
    );
    expect(errors.get("requiredDependent")?.message).toContain("failing");

    await haltSystem(config, system);
  });

  test("resource with required dependency (object form) blocks when dependency fails", async () => {
    // Explicit object form with required key
    const requiredDependent = defineResource({
      dependencies: { required: ["failing"] },
      start: ({ failing }: { failing: any }) => ({
        value: "should not start",
      }),
      halt: () => {},
    });

    const config = {
      failing: failingResource,
      requiredDependent,
    };

    const { system, errors } = await startSystem(config);

    // Resource should not start because required dependency failed
    expect(system.requiredDependent).toBeUndefined();
    expect(errors.size).toBe(2);
    expect(errors.has("requiredDependent")).toBe(true);
    expect(errors.get("requiredDependent")?.message).toContain(
      "Missing required dependencies"
    );

    await haltSystem(config, system);
  });

  test("resource with optional dependency starts when dependency fails", async () => {
    // This is already tested with dependsOnFailingResource, but let's be explicit
    const optionalDependent = defineResource({
      dependencies: { optional: ["failing"] },
      start: ({ failing }: { failing?: any }) => ({
        mode: failing ? "normal" : "degraded",
      }),
      halt: () => {},
    });

    const config = {
      failing: failingResource,
      optionalDependent,
    };

    const { system, errors } = await startSystem(config);

    // Resource should start in degraded mode
    expect(system.optionalDependent).toBeDefined();
    expect(system.optionalDependent.mode).toBe("degraded");

    // Only failing resource should have an error
    expect(errors.size).toBe(1);
    expect(errors.has("failing")).toBe(true);
    expect(errors.has("optionalDependent")).toBe(false);

    await haltSystem(config, system);
  });

  test("resource with mixed required and optional dependencies", async () => {
    const mixedDependent = defineResource({
      dependencies: {
        required: ["counter"], // Must be available
        optional: ["failing"], // Can be undefined
      },
      start: ({
        counter,
        failing,
      }: {
        counter: StartedResource<typeof counterResource>;
        failing?: any;
      }) => ({
        hasCounter: !!counter,
        hasFailing: !!failing,
        counterValue: counter.getCount(),
      }),
      halt: () => {},
    });

    const config = {
      counter: counterResource,
      failing: failingResource,
      mixedDependent,
    };

    const { system, errors } = await startSystem(config);

    // Should start because required dep (counter) is available
    expect(system.mixedDependent).toBeDefined();
    expect(system.mixedDependent.hasCounter).toBe(true);
    expect(system.mixedDependent.hasFailing).toBe(false);
    expect(system.mixedDependent.counterValue).toBe(0);

    // Only failing resource should error
    expect(errors.size).toBe(1);
    expect(errors.has("failing")).toBe(true);
    expect(errors.has("mixedDependent")).toBe(false);

    await haltSystem(config, system);
  });

  test("resource with mixed deps blocks when required dependency fails", async () => {
    const mixedDependent = defineResource({
      dependencies: {
        required: ["failing"], // Must be available - but it fails!
        optional: ["counter"], // Can be undefined
      },
      start: ({
        failing,
        counter,
      }: {
        failing: any;
        counter?: StartedResource<typeof counterResource>;
      }) => ({
        value: "should not start",
      }),
      halt: () => {},
    });

    const config = {
      counter: counterResource,
      failing: failingResource,
      mixedDependent,
    };

    const { system, errors } = await startSystem(config);

    // Should NOT start because required dep (failing) failed
    expect(system.mixedDependent).toBeUndefined();
    expect(system.counter).toBeDefined(); // Counter should still start

    // Both failing and mixedDependent should error
    expect(errors.size).toBe(2);
    expect(errors.has("failing")).toBe(true);
    expect(errors.has("mixedDependent")).toBe(true);
    expect(errors.get("mixedDependent")?.message).toContain(
      "Missing required dependencies"
    );

    await haltSystem(config, system);
  });

  test("resource with only optional dependencies (no required)", async () => {
    const allOptional = defineResource({
      dependencies: { optional: ["failing", "counter"] },
      start: ({
        failing,
        counter,
      }: {
        failing?: any;
        counter?: StartedResource<typeof counterResource>;
      }) => ({
        hasFailing: !!failing,
        hasCounter: !!counter,
      }),
      halt: () => {},
    });

    const config = {
      counter: counterResource,
      failing: failingResource,
      allOptional,
    };

    const { system, errors } = await startSystem(config);

    // Should start with whatever is available
    expect(system.allOptional).toBeDefined();
    expect(system.allOptional.hasFailing).toBe(false);
    expect(system.allOptional.hasCounter).toBe(true);

    // Only failing resource should error
    expect(errors.size).toBe(1);
    expect(errors.has("failing")).toBe(true);

    await haltSystem(config, system);
  });

  test("resource with empty dependencies object", async () => {
    const noDeps = defineResource({
      dependencies: { required: [], optional: [] },
      start: () => ({ value: "standalone" }),
      halt: () => {},
    });

    const config = { noDeps };
    const { system, errors } = await startSystem(config);

    expect(system.noDeps).toBeDefined();
    expect(system.noDeps.value).toBe("standalone");
    expect(errors.size).toBe(0);

    await haltSystem(config, system);
  });

  test("resource with duplicate in required and optional (required takes precedence)", async () => {
    // Edge case: same dep in both arrays
    // According to normalizeDependencies, it deduplicates with required first
    const duplicateDep = defineResource({
      dependencies: {
        required: ["counter"],
        optional: ["counter"], // Duplicate - should be treated as required
      },
      start: ({ counter }: { counter: StartedResource<typeof counterResource> }) => ({
        count: counter.getCount(),
      }),
      halt: () => {},
    });

    const config = {
      counter: counterResource,
      duplicateDep,
    };

    const { system, errors } = await startSystem(config);

    expect(system.duplicateDep).toBeDefined();
    expect(system.duplicateDep.count).toBe(0);
    expect(errors.size).toBe(0);

    await haltSystem(config, system);
  });

  test("chain of resources with mixed dependency types", async () => {
    // A -> B (required) -> C (optional)
    const resourceA = defineResource({
      start: () => ({ value: "A" }),
      halt: () => {},
    });

    const resourceB = defineResource({
      dependencies: { required: ["a"] },
      start: ({ a }: { a: { value: string } }) => ({
        value: `B-depends-on-${a.value}`,
      }),
      halt: () => {},
    });

    const resourceC = defineResource({
      dependencies: { optional: ["b"] },
      start: ({ b }: { b?: { value: string } }) => ({
        value: b ? `C-depends-on-${b.value}` : "C-standalone",
      }),
      halt: () => {},
    });

    const config = { a: resourceA, b: resourceB, c: resourceC };
    const { system, errors } = await startSystem(config);

    expect(errors.size).toBe(0);
    expect(system.a.value).toBe("A");
    expect(system.b.value).toBe("B-depends-on-A");
    expect(system.c.value).toBe("C-depends-on-B-depends-on-A");

    await haltSystem(config, system);
  });

  test("chain breaks at required dependency but continues with optional", async () => {
    // failing -> B (required, should fail) -> C (optional, should succeed)
    const resourceB = defineResource({
      dependencies: { required: ["failing"] },
      start: ({ failing }: { failing: any }) => ({
        value: "B should not start",
      }),
      halt: () => {},
    });

    const resourceC = defineResource({
      dependencies: { optional: ["b"] },
      start: ({ b }: { b?: any }) => ({
        value: b ? "C with B" : "C without B",
      }),
      halt: () => {},
    });

    const config = {
      failing: failingResource,
      b: resourceB,
      c: resourceC,
    };

    const { system, errors } = await startSystem(config);

    // failing and B should fail, C should succeed in degraded mode
    expect(system.failing).toBeUndefined();
    expect(system.b).toBeUndefined();
    expect(system.c).toBeDefined();
    expect(system.c.value).toBe("C without B");

    expect(errors.size).toBe(2);
    expect(errors.has("failing")).toBe(true);
    expect(errors.has("b")).toBe(true);
    expect(errors.has("c")).toBe(false);

    await haltSystem(config, system);
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

    const apiResource = defineResource({
      dependencies: ["database"],
      start: ({
        database,
      }: {
        database: StartedResource<typeof dbResource>;
      }) => {
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

    const messageHandlerResource = defineResource({
      dependencies: ["wsServer"],
      start: ({
        wsServer,
      }: {
        wsServer: StartedResource<typeof wsServerResource>;
      }) => {
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
    const typedResource = defineResource({
      dependencies: ["counter"],
      start: ({ counter }: { counter: { getCount: () => number } }) => {
        // TypeScript should know counter has getCount method
        const count = counter.getCount();
        return { doubled: count * 2 };
      },
      halt: () => {},
    });

    expect(typedResource.dependencies).toEqual(["counter"]);
  });
});
