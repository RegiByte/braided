import { describe, expect, test } from "vitest";
import { defineResource, reconcileSystem, startSystem } from "../core";
import type { SystemConfig } from "../resource";

type Instance = { id: string; generation: number; deps: Record<string, Instance | undefined> };

/**
 * A system whose resources record every start and halt in `log`, and whose
 * instances carry the dependency instances they were started with.
 */
const tracked = () => {
  const log: string[] = [];
  const generations: Record<string, number> = {};
  const resource = (
    id: string,
    dependencies: string[] | { required?: string[]; optional?: string[] } = [],
    options: { failStart?: boolean; failHalt?: boolean } = {}
  ) =>
    defineResource({
      dependencies,
      start: (deps: Record<string, Instance | undefined>): Instance => {
        log.push(`start ${id}`);
        if (options.failStart) throw new Error(`${id} failed`);
        generations[id] = (generations[id] ?? 0) + 1;
        return { id, generation: generations[id]!, deps };
      },
      halt: () => {
        log.push(`halt ${id}`);
        if (options.failHalt) throw new Error(`${id} halt failed`);
      },
    });
  return { log, resource };
};

/** A copy of one entry: the same resource, a new identity, so it restarts */
const restart = <T extends SystemConfig>(config: T, id: keyof T): T => ({
  ...config,
  [id]: { ...config[id] },
});

/** A -> B -> C, and A -> D */
const chain = () => {
  const t = tracked();
  const config = {
    a: t.resource("a"),
    b: t.resource("b", ["a"]),
    c: t.resource("c", ["b"]),
    d: t.resource("d", ["a"]),
  };
  return { ...t, config };
};

describe("reconcileSystem - restarting part of a system", () => {
  test("restarting a resource in the middle of a chain restarts its dependents, not its dependencies or siblings", async () => {
    const { log, config } = chain();
    const { system } = await startSystem(config);
    log.length = 0;

    const next = restart(config, "b");
    const result = await reconcileSystem(config, system, next);

    expect(log).toEqual(["halt c", "halt b", "start b", "start c"]);
    expect(result.halted).toEqual(["c", "b"]);
    expect(result.started).toEqual(["b", "c"]);
    expect(result.system.a).toBe(system.a);
    expect(result.system.d).toBe(system.d);
    expect(result.system.b).not.toBe(system.b);
    expect(result.system.c.deps["b"]).toBe(result.system.b);
    expect(result.system.b.deps["a"]).toBe(system.a);
  });

  test("restarting a root restarts everything that depends on it, halting in reverse order", async () => {
    const { log, config } = chain();
    const { system } = await startSystem(config);
    log.length = 0;

    const result = await reconcileSystem(config, system, restart(config, "a"));

    expect(log).toEqual(["halt c", "halt d", "halt b", "halt a", "start a", "start b", "start d", "start c"]);
    expect(result.system.d.deps["a"]).toBe(result.system.a);
    expect(result.system.c.deps["b"]).toBe(result.system.b);
  });

  test("an unchanged configuration moves nothing", async () => {
    const { log, config } = chain();
    const { system } = await startSystem(config);
    log.length = 0;

    const result = await reconcileSystem(config, system, { ...config });

    expect(log).toEqual([]);
    expect(result.halted).toEqual([]);
    expect(result.started).toEqual([]);
    expect(result.system).toEqual(system);
  });

  test("the previous system is never mutated", async () => {
    const { config } = chain();
    const { system } = await startSystem(config);
    const before = { ...system };

    await reconcileSystem(config, system, restart(config, "a"));

    expect(system).toEqual(before);
    expect(system.b).toBe(before.b);
  });
});

describe("reconcileSystem - adding and removing resources", () => {
  test("an added resource starts, with a changed dependent restarted on it", async () => {
    const t = chain();
    const { system } = await startSystem(t.config);
    t.log.length = 0;

    const next = { ...t.config, e: t.resource("e", ["a"]), c: t.resource("c", ["b", "e"]) };
    const result = await reconcileSystem(t.config, system, next);

    expect(t.log).toEqual(["halt c", "start e", "start c"]);
    expect(result.system.c.deps["e"]).toBe(result.system.e);
    expect(result.system.b).toBe(system.b);
  });

  test("a removed optional dependency restarts its dependent without it", async () => {
    const t = tracked();
    const config = {
      a: t.resource("a"),
      b: t.resource("b", { required: ["a"], optional: ["c"] }),
      c: t.resource("c"),
    };
    const { system } = await startSystem(config);
    t.log.length = 0;

    const { c, ...next } = config;
    const result = await reconcileSystem(config, system, next);

    expect(t.log).toEqual(["halt b", "halt c", "start b"]);
    expect(result.errors.size).toBe(0);
    expect(result.system.b.deps).toEqual({ a: system.a, c: undefined });
    expect(result.topology.graph["b"]).toEqual(["a"]);
  });

  test("an added optional dependency restarts its dependent on it", async () => {
    const t = tracked();
    const full = {
      a: t.resource("a"),
      b: t.resource("b", { required: ["a"], optional: ["c"] }),
      c: t.resource("c"),
    };
    const { c, ...config } = full;
    const { system } = await startSystem(config);
    t.log.length = 0;

    const result = await reconcileSystem(config, system, full);

    expect(t.log).toEqual(["halt b", "start c", "start b"]);
    expect(result.system.b.deps["c"]).toBe(result.system.c);
    expect(result.system.a).toBe(system.a);
  });

  test("a removed resource is halted with its dependents", async () => {
    const t = chain();
    const { system } = await startSystem(t.config);
    t.log.length = 0;

    const { b, c, ...next } = t.config;
    const result = await reconcileSystem(t.config, system, next);

    expect(t.log).toEqual(["halt c", "halt b"]);
    expect(Object.keys(result.system).sort()).toEqual(["a", "d"]);
    expect(result.system.a).toBe(system.a);
  });

  test("a next configuration with a missing dependency throws before halting anything", async () => {
    const t = chain();
    const { system } = await startSystem(t.config);
    t.log.length = 0;

    const { b, ...next } = t.config;
    await expect(reconcileSystem(t.config, system, next)).rejects.toThrow(/doesn't exist/);
    expect(t.log).toEqual([]);
  });

  test("a next configuration with a cycle throws before halting anything", async () => {
    const t = chain();
    const { system } = await startSystem(t.config);
    t.log.length = 0;

    const next = { ...t.config, a: t.resource("a", ["c"]) };
    await expect(reconcileSystem(t.config, system, next)).rejects.toThrow(/Circular dependency/);
    expect(t.log).toEqual([]);
  });
});

describe("reconcileSystem - failures", () => {
  test("a restart that fails skips its required dependents and degrades its optional ones", async () => {
    const t = tracked();
    const config = {
      a: t.resource("a"),
      b: t.resource("b", ["a"]),
      c: t.resource("c", { optional: ["a"] }),
    };
    const { system } = await startSystem(config);

    const result = await reconcileSystem(config, system, { ...config, a: t.resource("a", [], { failStart: true }) });

    expect(result.errors.get("a")?.message).toBe("a failed");
    expect(result.errors.get("b")?.message).toMatch(/Missing required dependencies/);
    expect(result.system.a).toBeUndefined();
    expect(result.system.b).toBeUndefined();
    expect(result.system.c.deps["a"]).toBeUndefined();
  });

  test("a halt that fails is collected, and the resource still starts again", async () => {
    const t = tracked();
    const config = { a: t.resource("a", [], { failHalt: true }) };
    const { system } = await startSystem(config);

    const result = await reconcileSystem(config, system, restart(config, "a"));

    expect(result.haltErrors.get("a")?.message).toBe("a halt failed");
    expect(result.system.a.generation).toBe(2);
  });

  test("a resource that failed stays unavailable until it is changed", async () => {
    const t = tracked();
    let attempts = 0;
    const flaky = defineResource({
      start: () => {
        attempts++;
        if (attempts === 1) throw new Error("first start fails");
        return { attempts };
      },
      halt: () => {},
    });
    const config = { flaky, other: t.resource("other") };
    const { system } = await startSystem(config);

    const untouched = await reconcileSystem(config, system, restart(config, "other"));
    expect(untouched.system.flaky).toBeUndefined();
    expect(untouched.started).toEqual(["other"]);

    const retried = await reconcileSystem(config, untouched.system, restart(config, "flaky"));
    expect(retried.system.flaky).toEqual({ attempts: 2 });
  });
});
