# 🧶 Braided

> **Untangle your stateful resources.**

A minimal, type-safe library for declarative system composition with dependency-aware lifecycle management. Inspired by Clojure's [Integrant](https://github.com/weavejester/integrant).

## The Problem

Modern JavaScript applications are inevitably **complected** (braided together in ways where you can't tell which knot is which—a term from Rich Hickey's ["Simple Made Easy"](https://www.infoq.com/presentations/Simple-Made-Easy/) talk).

When building systems, we need to connect multiple stateful resources:

- Environment variables loaded from external sources
- A database connection pool
- A logger instance with multiple transports
- A WebSocket server managing multiple clients
- A queue worker processing messages
- An http server handling requests (with the db and everything else)

A lot of coordination need to be done right in order to get maintainable systems that survive the test of time. It's not just about starting and stopping resources, it's about ensuring that the dependencies are resolved in the correct order, and that the resources are stopped gracefully and given the chance to flush ongoing work or stop what they're doing in the correct order. This database transactions, in-flight requests, queue workers and other sensitive processes that need to stop gracefully.

This contrasts with the current state of JS development where state is handled recklessly and implicitly, and dependencies are discovered and loaded based on brittle module load order or other weird heuristics.

In the modern JavaScript development landscape, frameworks that should be libraries want to **take over your application architecture**, and they become these giant god objects which control your entire running system. You can't test just a slice of the system because it depends on other parts that are not under your control or are impractical to mock/simulate. You end up with:

- 🔴 Huge monster codebases full of distributed singletons, states and implicit dependency chains
- 🔴 Testing that requires mocking giant chains of modules
- 🔴 Impossible to test a single part in isolation
- 🔴 Inadvertent spawning of entire dependency chains
- 🔴 Importing a file may cause a stateful thing to start or be created

---

Braided does not offer a solution to the problem, it offers a tool to help you solve it in a way that suites your needs and coding style without forcing you to change your entire development process, as long as you can fit it in your system, you can use it as much or as little as you want.

**Braided** provides a data-driven approach to system composition:

✅ **Declare your system topology as data**  
✅ **Define handlers to start and stop resources**  
✅ **Deterministic, coordinated startup/shutdown sequences**  
✅ **Environment agnostic** (no Node.js or browser APIs)  
✅ **Ridiculously easy to mock and test**  
✅ **Centralized control** of your entire system  
✅ **Strong composition** of stateful resources  
✅ **Minimal API surface** no opinions whatsoever, it doesn't even log anything, just gives you data.

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
const resource = defineResource<{ otherResource: TOtherResource }>({
  // Optional: declare dependencies
  dependencies: ["otherResource"],

  // Optional: validate dependencies before starting
  assert: ({ otherResource }) => {
    if (!isValid(otherResource)) {
      throw new Error("Invalid dependency");
    }
  },

  // Required: start the resource
  start: (deps) => {
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

## Testing Made Easy

Because resources are just data and functions, testing is trivial:

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

If a resource fails to start, the system continues starting other resources. Dependent resources receive `undefined` for failed dependencies:

```typescript
const resilientApi = defineResource({
  dependencies: ["cache"],
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

## API Reference

### `defineResource<TDeps, TResource>(config)`

Helper to define a resource with full type inference.

**Parameters:**

- `config.dependencies?: string[]` - Array of dependency resource IDs
- `config.assert?: (deps) => void | Promise<void>` - Validate dependencies
- `config.start: (deps) => T | Promise<T>` - Start the resource
- `config.halt: (instance) => void | Promise<void>` - Stop the resource

**Returns:** `ResourceConfig<TDeps, T>`

### `startSystem<TConfig>(config)`

Start all resources in dependency order.

**Parameters:**

- `config: SystemConfig` - Object mapping resource IDs to resource configs

**Returns:** `Promise<{ system: StartedSystem<TConfig>, errors: Map<string, Error> }>`

### `haltSystem<TConfig>(config, system)`

Halt all resources in reverse dependency order.

**Parameters:**

- `config: SystemConfig` - Original system configuration
- `system: StartedSystem<TConfig>` - Started system to halt

**Returns:** `Promise<{ errors: Map<string, Error> }>`

## Philosophy

**Braided** embraces these principles:

1. **Data over code** - Systems are declared as data structures, mix and match as much as you want
2. **Explicit over implicit** - Dependencies are declared, not discovered, you need to guide the dependencies to where they need to be
3. **Simple over easy** - Minimal API that composes well with other libraries
4. **Testable by default** - No global state, easy to mock
5. **Environment agnostic** - Works everywhere JavaScript runs
6. **Type-safe** - Full TypeScript support with inference

## Inspiration

This library is inspired by:

- [Integrant](https://github.com/weavejester/integrant) (Clojure)
- Rich Hickey's ["Simple Made Easy"](https://www.infoq.com/presentations/Simple-Made-Easy/)
- The need for better composition in JavaScript applications and my own real world experience with software development in enterprise environments

## License

ISC

## Contributing

Issues and PRs welcome! This library has been battle-tested in at least one real-world distributed system managing WebRTC, WebSockets, timers, client stores, dev-tool observers, and other stateful resources. But it's still very young and likely to change.

---

**Untangle your code. Compose your systems. Ship with confidence. Braid them intentionally and elegantly.** 🧶
