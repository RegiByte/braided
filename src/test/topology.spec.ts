import { describe, test, expect } from "vitest";
import {
  defineResource,
  startSystem,
  buildTopology,
  formatTopology,
  toMermaid,
  toDot,
  toJSON,
} from "../core";
import { topologicalSort } from "../topological-sort";
import type { Resource } from "../resource";

describe("System Topology", () => {
  describe("buildTopology", () => {
    test("should build topology for simple linear chain", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });

      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });

      const api = defineResource({
        dependencies: ["database"],
        start: ({ database }: { database: any }) => ({ value: "api" }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
        api: { ...api, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      expect(topology.totalResources).toBe(3);
      expect(topology.maxDepth).toBe(2);
      expect(topology.startupOrder).toEqual(["config", "database", "api"]);
      expect(topology.shutdownOrder).toEqual(["api", "database", "config"]);

      expect(topology.layers).toHaveLength(3);
      expect(topology.layers[0].depth).toBe(0);
      expect(topology.layers[0].resources).toHaveLength(1);
      expect(topology.layers[0].resources[0].id).toBe("config");

      expect(topology.layers[1].depth).toBe(1);
      expect(topology.layers[1].resources[0].id).toBe("database");

      expect(topology.layers[2].depth).toBe(2);
      expect(topology.layers[2].resources[0].id).toBe("api");
    });

    test("should build topology for diamond dependency", () => {
      //     config
      //      /  \
      //   cache  db
      //      \  /
      //       api

      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });

      const cache = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "cache" }),
        halt: () => {},
      });

      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });

      const api = defineResource({
        dependencies: ["cache", "database"],
        start: ({ cache, database }: { cache: any; database: any }) => ({
          value: "api",
        }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        cache: { ...cache, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
        api: { ...api, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      expect(topology.totalResources).toBe(4);
      expect(topology.maxDepth).toBe(2);

      // Layer 0: config
      expect(topology.layers[0].resources).toHaveLength(1);
      expect(topology.layers[0].resources[0].id).toBe("config");
      expect(topology.layers[0].resources[0].dependencies).toEqual([]);
      expect(topology.layers[0].resources[0].dependents).toContain("cache");
      expect(topology.layers[0].resources[0].dependents).toContain("database");

      // Layer 1: cache and database
      expect(topology.layers[1].resources).toHaveLength(2);
      const layer1Ids = topology.layers[1].resources.map((r) => r.id);
      expect(layer1Ids).toContain("cache");
      expect(layer1Ids).toContain("database");

      // Layer 2: api
      expect(topology.layers[2].resources).toHaveLength(1);
      expect(topology.layers[2].resources[0].id).toBe("api");
      expect(topology.layers[2].resources[0].dependencies).toContain("cache");
      expect(topology.layers[2].resources[0].dependencies).toContain(
        "database"
      );
    });

    test("should build topology for complex multi-layer system", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });

      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });

      const cache = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "cache" }),
        halt: () => {},
      });

      const api = defineResource({
        dependencies: ["database", "cache"],
        start: ({ database, cache }: { database: any; cache: any }) => ({
          value: "api",
        }),
        halt: () => {},
      });

      const httpServer = defineResource({
        dependencies: ["api"],
        start: ({ api }: { api: any }) => ({ value: "httpServer" }),
        halt: () => {},
      });

      const resources: Record<string, Resource> = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
        cache: { ...cache, _status: "stopped" } as Resource<any>,
        api: { ...api, _status: "stopped" } as Resource<any>,
        httpServer: { ...httpServer, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      expect(topology.totalResources).toBe(5);
      expect(topology.maxDepth).toBe(3);
      expect(topology.layers).toHaveLength(4);

      // Verify depths
      expect(topology.depths.config).toBe(0);
      expect(topology.depths.database).toBe(1);
      expect(topology.depths.cache).toBe(1);
      expect(topology.depths.api).toBe(2);
      expect(topology.depths.httpServer).toBe(3);
    });

    test("should handle independent resources", () => {
      const resource1 = defineResource({
        start: () => ({ value: "resource1" }),
        halt: () => {},
      });

      const resource2 = defineResource({
        start: () => ({ value: "resource2" }),
        halt: () => {},
      });

      const resource3 = defineResource({
        start: () => ({ value: "resource3" }),
        halt: () => {},
      });

      const resources: Record<string, Resource> = {
        resource1: { ...resource1, _status: "stopped" },
        resource2: { ...resource2, _status: "stopped" },
        resource3: { ...resource3, _status: "stopped" },
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      expect(topology.totalResources).toBe(3);
      expect(topology.maxDepth).toBe(0);
      expect(topology.layers).toHaveLength(1);
      expect(topology.layers[0].resources).toHaveLength(3);

      // All resources should have no dependencies or dependents
      for (const resource of topology.layers[0].resources) {
        expect(resource.dependencies).toEqual([]);
        expect(resource.dependents).toEqual([]);
        expect(resource.depth).toBe(0);
      }
    });

    test("should build correct adjacency lists", () => {
      const a = defineResource({
        start: () => ({ value: "a" }),
        halt: () => {},
      });

      const b = defineResource({
        dependencies: ["a"],
        start: ({ a }: { a: any }) => ({ value: "b" }),
        halt: () => {},
      });

      const c = defineResource({
        dependencies: ["a"],
        start: ({ a }: { a: any }) => ({ value: "c" }),
        halt: () => {},
      });

      const d = defineResource({
        dependencies: ["b", "c"],
        start: ({ b, c }: { b: any; c: any }) => ({ value: "d" }),
        halt: () => {},
      });

      const resources = {
        a: { ...a, _status: "stopped" } as Resource<any>,
        b: { ...b, _status: "stopped" } as Resource<any>,
        c: { ...c, _status: "stopped" } as Resource<any>,
        d: { ...d, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      // Forward graph (dependencies)
      expect(topology.graph.a).toEqual([]);
      expect(topology.graph.b).toEqual(["a"]);
      expect(topology.graph.c).toEqual(["a"]);
      expect(topology.graph.d).toEqual(["b", "c"]);

      // Reverse graph (dependents)
      expect(topology.dependents.a).toContain("b");
      expect(topology.dependents.a).toContain("c");
      expect(topology.dependents.b).toEqual(["d"]);
      expect(topology.dependents.c).toEqual(["d"]);
      expect(topology.dependents.d).toEqual([]);
    });
  });

  describe("Integration with startSystem", () => {
    test("should include topology in startSystem result", async () => {
      const config = defineResource({
        start: () => ({ port: 3000 }),
        halt: () => {},
      });

      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ connected: true }),
        halt: () => {},
      });

      const systemConfig = {
        config,
        database,
      };

      const { system, errors, topology } = await startSystem(systemConfig);

      expect(errors.size).toBe(0);
      expect(system.config.port).toBe(3000);
      expect(system.database.connected).toBe(true);

      // Verify topology
      expect(topology).toBeDefined();
      expect(topology.totalResources).toBe(2);
      expect(topology.maxDepth).toBe(1);
      expect(topology.startupOrder).toEqual(["config", "database"]);
      expect(topology.shutdownOrder).toEqual(["database", "config"]);
    });

    test("should work with complex real-world system", async () => {
      const configResource = defineResource({
        start: () => ({
          dbUrl: "postgres://localhost",
          cacheUrl: "redis://localhost",
          port: 3000,
        }),
        halt: () => {},
      });

      const databaseResource = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({
          url: config.dbUrl,
          query: () => {},
        }),
        halt: () => {},
      });

      const cacheResource = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({
          url: config.cacheUrl,
          get: () => {},
          set: () => {},
        }),
        halt: () => {},
      });

      const apiResource = defineResource({
        dependencies: ["database", "cache"],
        start: ({ database, cache }: { database: any; cache: any }) => ({
          getUsers: () => {},
        }),
        halt: () => {},
      });

      const httpServerResource = defineResource({
        dependencies: ["api", "config"],
        start: ({ api, config }: { api: any; config: any }) => ({
          port: config.port,
          listen: () => {},
        }),
        halt: () => {},
      });

      const systemConfig = {
        config: configResource,
        database: databaseResource,
        cache: cacheResource,
        api: apiResource,
        httpServer: httpServerResource,
      };

      const { topology } = await startSystem(systemConfig);

      expect(topology.totalResources).toBe(5);
      expect(topology.maxDepth).toBe(3);

      // Verify layer structure
      expect(topology.layers[0].resources[0].id).toBe("config");
      expect(topology.layers[0].resources[0].dependents).toContain("database");
      expect(topology.layers[0].resources[0].dependents).toContain("cache");

      const layer1Ids = topology.layers[1].resources.map((r) => r.id);
      expect(layer1Ids).toContain("database");
      expect(layer1Ids).toContain("cache");

      expect(topology.layers[2].resources[0].id).toBe("api");
      expect(topology.layers[3].resources[0].id).toBe("httpServer");
    });
  });

  describe("formatTopology", () => {
    test("should format topology as readable string", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });

      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);
      const formatted = formatTopology(topology);

      expect(formatted).toContain("System Topology");
      expect(formatted).toContain("2 resources");
      expect(formatted).toContain("max depth: 1");
      expect(formatted).toContain("Layer 0:");
      expect(formatted).toContain("config");
      expect(formatted).toContain("(no dependencies)");
      expect(formatted).toContain("Layer 1:");
      expect(formatted).toContain("database");
      expect(formatted).toContain("← [config]");
      expect(formatted).toContain("Startup order: config → database");
      expect(formatted).toContain("Shutdown order: database → config");
    });

    test("should format topology as readable string with complex graph", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });
      const cache = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "cache" }),
        halt: () => {},
      });
      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });
      const serviceA = defineResource({
        dependencies: ["database", "cache"],
        start: ({ database, cache }: { database: any; cache: any }) => ({
          value: "service",
        }),
        halt: () => {},
      });
      const serviceB = defineResource({
        dependencies: ["database", "cache"],
        start: ({ database, cache }: { database: any; cache: any }) => ({
          value: "service",
        }),
        halt: () => {},
      });
      const expressApp = defineResource({
        dependencies: ["serviceA", "serviceB"],
        start: ({ serviceA, serviceB }: { serviceA: any; serviceB: any }) => ({
          value: "expressApp",
        }),
        halt: () => {},
      });
      const httpServer = defineResource({
        dependencies: ["expressApp"],
        start: ({ expressApp }: { expressApp: any }) => ({
          value: "httpServer",
        }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        cache: { ...cache, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
        serviceA: { ...serviceA, _status: "stopped" } as Resource<any>,
        serviceB: { ...serviceB, _status: "stopped" } as Resource<any>,
        httpServer: { ...httpServer, _status: "stopped" } as Resource<any>,
        expressApp: { ...expressApp, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      console.log(topology);

      const formatted = formatTopology(topology);

      console.log(formatted);

      expect(formatted).toContain("System Topology");
      expect(formatted).toContain("7 resources");
      expect(formatted).toContain("max depth: 4");
      expect(formatted).toContain("Layer 0:");
      expect(formatted).toContain("config");
      expect(formatted).toContain("(no dependencies)");
      expect(formatted).toContain("Layer 1:");
      expect(formatted).toContain("database");
    });
  });

  describe("toMermaid", () => {
    test("should generate Mermaid diagram", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });

      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });

      const api = defineResource({
        dependencies: ["database"],
        start: ({ database }: { database: any }) => ({ value: "api" }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
        api: { ...api, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);
      const mermaid = toMermaid(topology);

      expect(mermaid).toContain("graph TB");
      expect(mermaid).toContain("config");
      expect(mermaid).toContain("config --> database");
      expect(mermaid).toContain("database --> api");
    });

    test("should support different directions", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      const mermaidTB = toMermaid(topology, "TB");
      expect(mermaidTB).toContain("graph TB");

      const mermaidLR = toMermaid(topology, "LR");
      expect(mermaidLR).toContain("graph LR");
    });

    test("complex dependency graph", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });
      const cache = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "cache" }),
        halt: () => {},
      });
      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });
      const serviceA = defineResource({
        dependencies: ["database", "cache"],
        start: ({ database, cache }: { database: any; cache: any }) => ({
          value: "service",
        }),
        halt: () => {},
      });
      const serviceB = defineResource({
        dependencies: ["database", "cache"],
        start: ({ database, cache }: { database: any; cache: any }) => ({
          value: "service",
        }),
        halt: () => {},
      });
      const expressApp = defineResource({
        dependencies: ["serviceA", "serviceB"],
        start: ({ serviceA, serviceB }: { serviceA: any; serviceB: any }) => ({
          value: "expressApp",
        }),
        halt: () => {},
      });
      const httpServer = defineResource({
        dependencies: ["expressApp"],
        start: ({ expressApp }: { expressApp: any }) => ({
          value: "httpServer",
        }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        cache: { ...cache, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
        serviceA: { ...serviceA, _status: "stopped" } as Resource<any>,
        serviceB: { ...serviceB, _status: "stopped" } as Resource<any>,
        httpServer: { ...httpServer, _status: "stopped" } as Resource<any>,
        expressApp: { ...expressApp, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      const mermaidTB = toMermaid(topology, "TB");
      expect(mermaidTB).toContain("graph TB");

      console.log(mermaidTB);

      const mermaidLR = toMermaid(topology, "LR");
      expect(mermaidLR).toContain("graph LR");
      console.log(mermaidLR);
    });
  });

  describe("toDot", () => {
    test("should generate GraphViz DOT format", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });

      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);
      const dot = toDot(topology);

      expect(dot).toContain("digraph SystemTopology");
      expect(dot).toContain("rankdir=TB");
      expect(dot).toContain("node [shape=box, style=rounded]");
      expect(dot).toContain("{ rank=same; config }");
      expect(dot).toContain("{ rank=same; database }");
      expect(dot).toContain("config -> database");
    });

    test("should support different directions", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      const dotTB = toDot(topology, "TB");
      expect(dotTB).toContain("rankdir=TB");

      const dotLR = toDot(topology, "LR");
      console.log(dotLR);
      expect(dotLR).toContain("rankdir=LR");
    });

    test("complex dependency graph", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });
      const cache = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "cache" }),
        halt: () => {},
      });
      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });
      const serviceA = defineResource({
        dependencies: ["database", "cache"],
        start: ({ database, cache }: { database: any; cache: any }) => ({
          value: "service",
        }),
        halt: () => {},
      });
      const serviceB = defineResource({
        dependencies: ["database", "cache"],
        start: ({ database, cache }: { database: any; cache: any }) => ({
          value: "service",
        }),
        halt: () => {},
      });
      const expressApp = defineResource({
        dependencies: ["serviceA", "serviceB"],
        start: ({ serviceA, serviceB }: { serviceA: any; serviceB: any }) => ({
          value: "expressApp",
        }),
        halt: () => {},
      });
      const httpServer = defineResource({
        dependencies: ["expressApp"],
        start: ({ expressApp }: { expressApp: any }) => ({
          value: "httpServer",
        }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        cache: { ...cache, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
        serviceA: { ...serviceA, _status: "stopped" } as Resource<any>,
        serviceB: { ...serviceB, _status: "stopped" } as Resource<any>,
        httpServer: { ...httpServer, _status: "stopped" } as Resource<any>,
        expressApp: { ...expressApp, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);

      const dot = toDot(topology);
      console.log(dot);
      expect(dot).toContain("digraph SystemTopology");
      expect(dot).toContain("rankdir=TB");
      expect(dot).toContain("node [shape=box, style=rounded]");
      expect(dot).toContain("{ rank=same; config }");
      expect(dot).toContain("{ rank=same; cache; database }");
    });
  });

  describe("toJSON", () => {
    test("should convert topology to JSON-friendly format", () => {
      const config = defineResource({
        start: () => ({ value: "config" }),
        halt: () => {},
      });

      const database = defineResource({
        dependencies: ["config"],
        start: ({ config }: { config: any }) => ({ value: "database" }),
        halt: () => {},
      });

      const resources = {
        config: { ...config, _status: "stopped" } as Resource<any>,
        database: { ...database, _status: "stopped" } as Resource<any>,
      };

      const order = topologicalSort(resources);
      const topology = buildTopology(resources, order);
      const json = toJSON(topology);

      expect(json.totalResources).toBe(2);
      expect(json.maxDepth).toBe(1);
      expect(json.startupOrder).toEqual(["config", "database"]);
      expect(json.shutdownOrder).toEqual(["database", "config"]);
      expect(json.layers).toHaveLength(2);
      expect(json.graph).toEqual({
        config: [],
        database: ["config"],
      });

      // Should be serializable
      const jsonString = JSON.stringify(json, null, 2);
      expect(jsonString).toBeTruthy();
      const parsed = JSON.parse(jsonString);
      expect(parsed.totalResources).toBe(2);
    });
  });
});
