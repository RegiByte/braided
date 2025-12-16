# Braided

A minimal, type-safe library for managing stateful resources in JavaScript and TypeScript applications through declarative system composition with automatic dependency resolution and lifecycle management.

Inspired by Clojure's [Integrant](https://github.com/weavejester/integrant).

## The Problem

Building applications with multiple stateful resources creates coordination challenges:

- Database connections must start before the API server
- Configuration must load before anything that depends on it
- HTTP servers need graceful shutdown to finish in-flight requests
- Cache connections should close after services that use them
- Manual ordering is error-prone and doesn't scale

Traditional approaches lead to common issues:

- Implicit dependencies through module imports
- Manual startup/shutdown ordering that breaks as systems grow
- Global singletons that make testing difficult
- Circular dependency errors discovered at runtime
- No clear system topology or dependency visualization

## The Solution

Braided provides a data-driven approach to system composition:

- Declare your system topology as plain data structures
- Define start and stop handlers for each resource
- Automatic dependency resolution via topological sorting
- Type-safe dependencies with full TypeScript inference
- Graceful startup and shutdown in correct order
- Easy testing by swapping resource implementations
- Environment agnostic (works in Node.js, browsers, edge runtimes)

## Installation

```bash
npm install braided
```

## Quick Start

```typescript
import { defineResource, startSystem, haltSystem } from "braided";

// Define a database resource
const database = defineResource({
  start: async () => {
    const conn = await connectToDatabase();
    return {
      query: (sql: string) => conn.execute(sql),
      close: () => conn.disconnect(),
    };
  },
  halt: async (db) => {
    await db.close();
  },
});

// Define an API that depends on the database
const api = defineResource({
  dependencies: ["database"],
  start: ({ database }) => {
    return {
      getUsers: () => database.query("SELECT * FROM users"),
      getOrders: () => database.query("SELECT * FROM orders"),
    };
  },
  halt: () => {
    console.log("API shutting down");
  },
});

// Compose your system
const system = {
  database,
  api,
};

// Start everything in dependency order
const { system: running, errors } = await startSystem(system);

// Use your resources
const users = running.api.getUsers();

// Shutdown in reverse order
await haltSystem(system, running);
```

## Core Concepts

### Resources

A **resource** is anything with a lifecycle or anything that needs to be managed and distributed to other parts of the system: database connections, HTTP servers, WebSocket/WebRTC connections, timers, caches, recovery mechanisms, observers, etc.
Anything that you can't dispose of immediately after spawning, that is a stateful thing, which is what you need to manage carefully.

```typescript
const resource = defineResource({
  // Optional: declare dependencies
  dependencies: ["otherResource"],

  // Optional: validate dependencies before starting
  assert: ({ otherResource }: { otherResource: TOtherResource }) => {
    if (!isValid(otherResource)) {
      throw new Error("Invalid dependency");
    }
  },

  // Required: start the resource
  start: (deps: { otherResource: TOtherResource }) => {
    // Return your resource instance
    return createMyResource(deps);
  },

  // Required: stop the resource
  halt: (instance) => {
    // Clean up
    instance.cleanup();
  },
});
```

### System Topology

Define your system as a plain object mapping resource IDs to resource configs:

```typescript
const system = {
  config: configResource,
  database: databaseResource,
  cache: cacheResource,
  api: apiResource,
  websocket: websocketResource,
};
```

The library uses **topological sorting** to determine the correct startup order based on declared dependencies.

### Lifecycle Management

```typescript
// Start system (dependencies first)
const { system: running, errors } = await startSystem(config);

// Check for startup errors
if (errors.size > 0) {
  console.error("Some resources failed:", errors);
}

// Use your system
running.api.handleRequest();

// Halt system (reverse order)
const { errors: haltErrors } = await haltSystem(config, running);
```

## Real-World Example

```typescript
import { defineResource, startSystem, haltSystem } from "braided";

// Configuration resource (no dependencies)
const config = defineResource({
  start: () => ({
    port: process.env.PORT || 3000,
    dbUrl: process.env.DATABASE_URL,
  }),
  halt: () => {},
});

// Database resource (depends on config)
const database = defineResource({
  dependencies: ["config"],
  start: async ({ config }) => {
    const pool = await createPool(config.dbUrl);
    return {
      query: (sql) => pool.query(sql),
      close: () => pool.end(),
    };
  },
  halt: async (db) => await db.close(),
});

// WebSocket server (depends on config and database)
const websocket = defineResource({
  dependencies: ["config", "database"],
  start: ({ config, database }) => {
    const wss = new WebSocketServer({ port: config.port + 1 });

    wss.on("connection", (ws) => {
      ws.on("message", async (msg) => {
        const result = await database.query("INSERT INTO messages VALUES (?)", [
          msg,
        ]);
        ws.send(JSON.stringify(result));
      });
    });

    return wss;
  },
  halt: (wss) => {
    wss.close();
  },
});

// HTTP API (depends on config, database, and websocket)
const api = defineResource({
  dependencies: ["config", "database", "websocket"],
  start: ({ config, database, websocket }) => {
    const app = express();

    app.get("/messages", async (req, res) => {
      const messages = await database.query("SELECT * FROM messages");
      res.json(messages);
    });

    const server = app.listen(config.port);
    return server;
  },
  halt: (server) => {
    server.close();
  },
});

// Define the system
const system = { config, database, websocket, api };

// Start everything
const { system: running } = await startSystem(system);

// Graceful shutdown
process.on("SIGTERM", async () => {
  await haltSystem(system, running);
  process.exit(0);
});
```

## Testing

Resources are plain functions, making testing straightforward:

```typescript
import { describe, test, expect } from "vitest";
import { startSystem, haltSystem } from "braided";

describe("API Tests", () => {
  test("handles requests with mocked database", async () => {
    // Create a mock database
    const mockDb = defineResource({
      start: () => ({
        query: () => Promise.resolve([{ id: 1, name: "Test" }]),
      }),
      halt: () => {},
    });

    // Use the real API with mock database
    const testSystem = {
      database: mockDb,
      api: apiResource, // your real api resource
    };

    const { system } = await startSystem(testSystem);

    // Test your API
    const result = await system.api.getUsers();
    expect(result).toEqual([{ id: 1, name: "Test" }]);

    await haltSystem(testSystem, system);
  });
});
```

## Advanced Features

### Graceful Degradation

Braided supports graceful degradation **when you opt in** by marking dependencies as optional.

- **Required dependencies (default)**: if a required dependency is unavailable, the dependent resource **will not start** and an error is recorded.
- **Optional dependencies**: if an optional dependency is unavailable, the dependent resource still starts and receives `undefined` for that dependency.

```typescript
const resilientApi = defineResource({
  dependencies: { optional: ["cache"] },
  start: ({ cache }) => {
    if (!cache) {
      console.warn("Cache unavailable, running without cache");
      return createApiWithoutCache();
    }
    return createApiWithCache(cache);
  },
  halt: (api) => api.close(),
});
```

### Complex Dependency Graphs

Braided handles complex dependency patterns including diamond dependencies:

```typescript
//     config
//      /  \
//   cache  db
//      \  /
//       api
```

### Multiple System Instances

Run multiple isolated system instances simultaneously, compose variations of resources:

```typescript
const server1 = await startSystem(serverConfig);
const server2 = await startSystem(serverConfig);
```

### System Topology Visualization

Every call to `startSystem` returns a `topology` object containing the complete dependency structure:

```typescript
const { system, errors, topology } = await startSystem(config);

// Print human-readable topology
console.log(formatTopology(topology));
// System Topology (5 resources, max depth: 3)
//
// Layer 0:
//   config (no dependencies) → [database, cache]
//
// Layer 1:
//   database ← [config] → [api]
//   cache ← [config] → [api]
// ...

// Generate Mermaid diagram for markdown
console.log(toMermaid(topology));
// graph TD
//   config --> database
//   config --> cache
//   database --> api
//   cache --> api
//   api --> httpServer

// Export as JSON for custom visualizations
const json = toJSON(topology);
fs.writeFileSync("topology.json", JSON.stringify(json, null, 2));

// Generate GraphViz DOT format
const dot = toDot(topology);
fs.writeFileSync("system.dot", dot);
// Render with: dot -Tpng system.dot -o system.png
```

**Topology Structure:**

```typescript
{
  layers: [
    {
      depth: 0,
      resources: [
        { id: 'config', dependencies: [], dependents: ['database', 'cache'] }
      ]
    },
    // ... more layers
  ],
  graph: { config: [], database: ['config'], ... },
  dependents: { config: ['database', 'cache'], ... },
  depths: { config: 0, database: 1, ... },
  totalResources: 5,
  maxDepth: 3,
  startupOrder: ['config', 'database', 'cache', 'api', 'httpServer'],
  shutdownOrder: ['httpServer', 'api', 'cache', 'database', 'config']
}
```

**Use Cases:**

- Debug complex dependency chains
- Auto-generate architecture documentation
- Create visual system diagrams
- Validate system structure in tests
- Analyze system complexity

## API Reference

### `defineResource(config)`

Helper to define a resource with full type inference.

**Parameters:**

- `config.dependencies?: string[]` - Array of dependency resource IDs
- `config.assert?: (deps) => void | Promise<void>` - Validate dependencies
- `config.start: (deps) => T | Promise<T>` - Start the resource
- `config.halt: (instance) => void | Promise<void>` - Stop the resource

**Returns:** `ResourceConfig<TStart>`

### `startSystem<TConfig>(config)`

Start all resources in dependency order.

**Parameters:**

- `config: SystemConfig` - Object mapping resource IDs to resource configs

**Returns:** `Promise<{ system: StartedSystem<TConfig>, errors: Map<string, Error>, topology: SystemTopology }>`

### `haltSystem<TConfig>(config, system)`

Halt all resources in reverse dependency order.

**Parameters:**

- `config: SystemConfig` - Original system configuration
- `system: StartedSystem<TConfig>` - Started system to halt

**Returns:** `Promise<{ errors: Map<string, Error> }>`

## Design Principles

1. **Data over code** - Systems are declared as data structures
2. **Explicit over implicit** - Dependencies are declared, not discovered
3. **Simple over easy** - Minimal API that composes well
4. **Testable by default** - No global state, resources are swappable
5. **Environment agnostic** - Works in Node.js, browsers, and edge runtimes
6. **Type-safe** - Full TypeScript support with type inference
7. **Zero magic** - No decorators, reflection, or directory scanning
8. **Unopinionated** - Use as much or as little as needed

## Frequently Asked Questions

**How does the library determine startup and shutdown order?**

The library uses topological sorting to analyze the dependency graph. Resources start in dependency order (dependencies first) and stop in reverse order (dependents first).

**What happens if a resource fails to start?**

The system continues starting other resources. Dependent resources receive `undefined` for failed dependencies. Errors are collected in the returned `errors` map. Use the `assert` function to validate dependencies and fail fast if needed.

**What happens if a resource fails to stop?**

The system continues halting other resources. Errors are collected and returned in the `errors` map from `haltSystem`.

**Does it detect circular dependencies?**

Yes. Circular dependencies are detected during topological sorting and throw an error immediately, preventing the system from starting.

## Inspiration

- [Integrant](https://github.com/weavejester/integrant) - Clojure library for data-driven system composition
- [Component](https://github.com/stuartsierra/component) - Clojure library for managing lifecycle and dependencies
- Rich Hickey's ["Simple Made Easy"](https://www.infoq.com/presentations/Simple-Made-Easy/) talk

## License

ISC

## Related Projects

**[Braided React](https://github.com/RegiByte/braided-react)** - React adapter for managing Braided systems independent of the React component lifecycle.

## Contributing

Issues and pull requests are welcome. This library has been used in production systems managing WebRTC connections, WebSocket servers, database pools, caches, and background workers.
