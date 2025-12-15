# Recipe 5: Full-Stack Composition

**Composing config, database, API, and HTTP server resources with automatic dependency resolution.**

---

## What You'll Learn

- How to compose multiple resources with dependencies
- Automatic startup and shutdown ordering based on dependency graph
- Building a complete REST API with database backing
- Environment-based configuration for all resources
- Production-ready error handling and graceful shutdown

---

## Prerequisites

- Node.js 18+
- Docker and Docker Compose (for PostgreSQL)
- Completed [Recipe 2](./02-config-typed.md), [Recipe 3](./03-express-standalone.md), and [Recipe 4](./04-database-prisma.md)
- Understanding of resource dependencies

---

## The Recipe

### What We're Building

A full-stack application with four composed resources:

1. **Config** - Loads and validates environment variables
2. **Database** - Connects to PostgreSQL using config
3. **API** - Creates Express app with database routes
4. **HTTP Server** - Starts server on configured port

**Dependency Chain:**

```
config
  ↓
database
  ↓
api ← config
  ↓
httpServer
```

### Why This Matters

Most applications manually manage startup order:

```typescript
// Traditional approach (error-prone)
const config = loadConfig();
const db = await connectDB(config.DATABASE_URL);
const app = createAPI(db);
const server = app.listen(config.PORT);

// Hope you got the order right...
// Hope you remember to close everything in reverse...
```

**Problems:**

- Manual ordering (easy to get wrong)
- No validation of dependencies
- Shutdown order is your responsibility
- Hard to test (can't swap resources)
- Circular dependencies possible

**With Braided:**

```typescript
const systemConfig = {
  config: configResource,
  database: databaseResource,    // depends on config
  api: apiResource,              // depends on database
  httpServer: httpServerResource, // depends on api + config
};

await startSystem(systemConfig);
```

**Benefits:**

- Automatic correct ordering
- Type-safe dependencies
- Graceful shutdown in reverse order
- Easy to test (swap any resource)
- Circular dependencies impossible

---

## The Code

### File: `config.ts`

```typescript
import { defineResource } from "braided";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
});

export const configResource = defineResource({
  start: async () => {
    console.log("Loading configuration...");
    loadEnv();

    const result = configSchema.safeParse({
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      DATABASE_URL: process.env.DATABASE_URL,
    });

    if (!result.success) {
      console.error(z.prettifyError(result.error));
      throw new Error("Configuration validation failed");
    }

    console.log("✓ Configuration loaded");
    return result.data;
  },

  halt: async (config) => {
    console.log("✓ Config shutdown");
  },
});
```

### File: `database.ts`

```typescript
import { defineResource } from "braided";
import { PrismaClient } from "@prisma/client";

export const databaseResource = defineResource({
  dependencies: ["config"],

  start: async ({ config }) => {
    console.log("Connecting to database...");

    const prisma = new PrismaClient({
      log: ["error", "warn"],
      datasources: {
        db: { url: config.DATABASE_URL },
      },
    });

    await prisma.$connect();
    console.log("✓ Database connected");
    return prisma;
  },

  halt: async (prisma) => {
    console.log("Disconnecting from database...");
    await prisma.$disconnect();
    console.log("✓ Database disconnected");
  },
});
```

**Key point:** Database receives `config` from the started system.

### File: `api.ts`

```typescript
import { defineResource } from "braided";
import express from "express";
import { PrismaClient } from "@prisma/client";

export const apiResource = defineResource({
  dependencies: ["database"],

  start: async ({ database: db }) => {
    console.log("Creating API...");
    const app = express();
    app.use(express.json());

    // Get all users with tasks
    app.get("/api/users", async (req, res) => {
      try {
        const users = await db.user.findMany({
          include: { tasks: true },
          orderBy: { name: "asc" },
        });
        res.json({ users });
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
      }
    });

    // Get incomplete tasks
    app.get("/api/tasks", async (req, res) => {
      try {
        const completed = req.query.completed;
        const where = completed !== undefined 
          ? { completed: completed === "true" } 
          : undefined;

        const tasks = await db.task.findMany({
          where,
          include: { user: true },
          orderBy: { createdAt: "desc" },
        });
        res.json({ tasks });
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks" });
      }
    });

    // Create user
    app.post("/api/users", async (req, res) => {
      try {
        const { email, name } = req.body;
        if (!email || !name) {
          return res.status(400).json({ error: "Email and name required" });
        }

        const user = await db.user.create({
          data: { email, name },
          include: { tasks: true },
        });
        res.status(201).json({ user });
      } catch (error) {
        res.status(500).json({ error: "Failed to create user" });
      }
    });

    // ... more endpoints

    console.log("✓ API created");
    return app;
  },

  halt: async (app) => {
    console.log("✓ API shutdown");
  },
});
```

**Key point:** API receives `database` (Prisma Client) from the started system.

### File: `http-server.ts`

```typescript
import { defineResource } from "braided";
import { Express } from "express";

export const httpServerResource = defineResource({
  dependencies: ["api", "config"],

  start: async ({ api, config }) => {
    console.log(`Starting HTTP server on port ${config.PORT}...`);

    return new Promise((resolve, reject) => {
      const server = api.listen(config.PORT, (err) => {
        if (err) reject(err);
        else {
          console.log(`✓ HTTP server listening on port ${config.PORT}`);
          resolve(server);
        }
      });
    });
  },

  halt: async (server) => {
    console.log("Closing HTTP server...");

    return new Promise((resolve) => {
      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      server.close((err) => {
        if (err) console.error("Error closing server:", err);
        else console.log("✓ HTTP server closed gracefully");
        finish();
      });

      setTimeout(() => {
        if (resolved) return;
        console.log("Grace period ended, closing connections...");
        server.closeIdleConnections();
      }, 2000);

      setTimeout(() => {
        if (resolved) return;
        console.log("Forcing shutdown after timeout");
        finish();
      }, 5000);
    });
  },
});
```

**Key point:** Server receives both `api` and `config`.

### File: `system.ts`

```typescript
import { startSystem, haltSystem } from "braided";
import { configResource } from "./config.js";
import { databaseResource } from "./database.js";
import { apiResource } from "./api.js";
import { httpServerResource } from "./http-server.js";

const systemConfig = {
  config: configResource,
  database: databaseResource,
  api: apiResource,
  httpServer: httpServerResource,
};

console.log("Starting full-stack system...\n");

const { system, errors } = await startSystem(systemConfig);

if (errors.size > 0) {
  console.error("\nSystem failed to start:");
  errors.forEach((error, resourceName) => {
    console.error(`  - ${resourceName}:`, error.message);
  });
  process.exit(1);
}

console.log("\n✓ System started successfully!\n");

// Seed database if empty
const db = system.database;
const existingUsers = await db.user.findMany();

if (existingUsers.length === 0) {
  console.log("Seeding database...\n");
  // ... seed data
}

console.log("API endpoints available:");
console.log(`  GET    http://localhost:${system.config.PORT}/api/users`);
console.log(`  POST   http://localhost:${system.config.PORT}/api/users`);
console.log(`  GET    http://localhost:${system.config.PORT}/api/tasks`);
console.log("\nPress Ctrl+C to shutdown\n");

// Graceful shutdown
const makeShutdown = () => {
  let isShuttingDown = false;
  return async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\nShutting down gracefully...\n");
    await haltSystem(systemConfig, system);
    console.log("\n✓ Shutdown complete");
    process.exit(0);
  };
};
const shutdown = makeShutdown();

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

---

## Running It

### Setup

```bash
# Install dependencies
npm install

# Start PostgreSQL
docker-compose up -d

# Create .env file
cp .env.example .env

# Generate Prisma Client and push schema
npm run db:generate
npm run db:push

# Start the system
npm start
```

### Expected Output

```
Starting full-stack system...

Loading configuration...
✓ Configuration loaded: {
  PORT: 3000,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://cookbook:****@localhost:5434/cookbook_db?schema=public'
}
Connecting to database...
✓ Database connected
Creating API...
✓ API created
Starting HTTP server on port 3000...
✓ HTTP server listening on port 3000

✓ System started successfully!

Checking for existing users...
No users found. Seeding database...

✓ Database seeded with sample data

API endpoints available:
  GET    http://localhost:3000/health
  GET    http://localhost:3000/api/users
  POST   http://localhost:3000/api/users
  GET    http://localhost:3000/api/tasks
  POST   http://localhost:3000/api/users/:userId/tasks
  PATCH  http://localhost:3000/api/tasks/:id
  DELETE http://localhost:3000/api/tasks/:id

Press Ctrl+C to shutdown
```

### Testing the API

```bash
# Health check
curl http://localhost:3000/health

# Get all users
curl http://localhost:3000/api/users

# Get incomplete tasks
curl 'http://localhost:3000/api/tasks?completed=false'

# Create a user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"charlie@example.com","name":"Charlie"}'

# Create a task (use a valid user ID from the users list)
curl -X POST http://localhost:3000/api/users/1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Write tests","completed":false}'

# Update a task
curl -X PATCH http://localhost:3000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'
```

### Graceful Shutdown

Press `Ctrl+C`:

```
Shutting down gracefully...

Closing HTTP server...
✓ HTTP server closed gracefully
✓ API shutdown
Disconnecting from database...
✓ Database disconnected
✓ Config shutdown

✓ Shutdown complete
```

**Notice:** Shutdown happens in reverse order (Server → API → Database → Config).

---

## What's Happening

### 1. Dependency Resolution

Braided analyzes the dependency graph:

```
config (no dependencies)
  ↓
database (depends on config)
  ↓
api (depends on database)
  ↓
httpServer (depends on api + config)
```

**Startup order:** config → database → api → httpServer  
**Shutdown order:** httpServer → api → database → config

### 2. Type-Safe Dependencies

```typescript
export const databaseResource = defineResource({
  dependencies: ["config"],
  start: async ({ config }: { config: ConfigType }) => {
    // TypeScript knows config.DATABASE_URL exists
    const prisma = new PrismaClient({
      datasources: { db: { url: config.DATABASE_URL } },
    });
    return prisma;
  },
});
```

TypeScript ensures:
- Dependencies are correctly typed
- You can't access non-existent properties
- Refactoring is safe

### 3. Automatic Ordering

You don't specify order - Braided figures it out:

```typescript
// This works
const systemConfig = {
  httpServer: httpServerResource,  // Listed first
  config: configResource,          // But starts first
  api: apiResource,
  database: databaseResource,
};

// Braided automatically determines: config → database → api → httpServer
```

### 4. Error Handling

If any resource fails to start:

```
System failed to start:
  - database: Can't reach database server at localhost:5434
```

Resources that started successfully are halted in reverse order.

### 5. Graceful Shutdown

```typescript
await haltSystem(systemConfig, system);
```

Braided halts resources in reverse dependency order:

1. **httpServer** - Stops accepting connections, closes gracefully
2. **api** - Cleans up Express app
3. **database** - Disconnects from PostgreSQL
4. **config** - Cleanup (if needed)

---

## Key Takeaways

1. **Automatic ordering** - Declare dependencies, Braided handles order
2. **Type safety** - Dependencies are correctly typed
3. **Explicit dependencies** - No hidden imports or globals
4. **Graceful shutdown** - Reverse order ensures clean teardown
5. **Easy testing** - Swap any resource for mocks
6. **Composition scales** - Adding resources doesn't increase complexity
7. **Circular dependencies impossible** - Type system prevents them

---

## Comparison: Traditional vs Braided

| Aspect | Traditional | Braided |
| --- | --- | --- |
| **Startup Order** | Manual (error-prone) | Automatic (dependency graph) |
| **Shutdown Order** | Manual (often forgotten) | Automatic (reverse order) |
| **Dependencies** | Implicit (imports) | Explicit (declared) |
| **Testing** | Hard (mocking imports) | Easy (swap resources) |
| **Type Safety** | Weak (any imports) | Strong (typed dependencies) |
| **Circular Deps** | Possible (runtime error) | Impossible (compile error) |

---

## Try It Yourself

### Experiment 1: Add a Cache Resource

Create a Redis cache resource that depends on config:

```typescript
export const cacheResource = defineResource({
  dependencies: ["config"],
  start: async ({ config }) => {
    const redis = createClient({ url: config.REDIS_URL });
    await redis.connect();
    return redis;
  },
  halt: async (redis) => {
    await redis.disconnect();
  },
});
```

Add to system:

```typescript
const systemConfig = {
  config: configResource,
  cache: cacheResource,        // New resource
  database: databaseResource,
  api: apiResource,
  httpServer: httpServerResource,
};
```

Braided automatically determines the correct order.

### Experiment 2: Make API Depend on Cache

```typescript
export const apiResource = defineResource({
  dependencies: ["database", "cache"],
  start: async ({ database, cache }) => {
    // Use both database and cache
  },
});
```

Braided ensures both database and cache start before API.

### Experiment 3: Test with Mock Database

```typescript
const mockDB = {
  user: {
    findMany: async () => [{ id: 1, name: "Test User" }],
  },
};

const testSystemConfig = {
  config: configResource,
  database: defineResource({
    start: async () => mockDB,
    halt: async () => {},
  }),
  api: apiResource,
  httpServer: httpServerResource,
};

const { system } = await startSystem(testSystemConfig);
// API now uses mock database
```

---

## Common Issues

### Circular Dependencies

**Error:** `Circular dependency detected: api → database → api`

**Solution:** Restructure dependencies. Resources can't depend on each other in a cycle.

### Missing Dependency

**Error:** `Resource 'database' depends on 'config' which doesn't exist`

**Solution:** Ensure all dependencies are defined in `systemConfig`.

### Wrong Type

**Error:** `Property 'DATABASE_URL' does not exist on type 'never'`

**Solution:** Add type annotation to dependency parameter:

```typescript
start: async ({ config }: { config: ConfigType }) => {
  // ...
}
```

---

## Next Steps

**Next Recipe:** Testing Strategies - Mocking resources, integration tests, isolation testing

**Try:**

- Add a cache resource (Redis)
- Add a queue worker resource
- Add WebSocket support
- Test with mock resources

---

**Questions? Check the [runnable example](/examples/cookbook-05-full-stack)**

---

## Preview: What's Next

In the next recipes, we'll explore:

1. **Recipe 6: Testing Strategies**
   - Mocking resources
   - Integration tests
   - Isolation testing

2. **Recipe 7: WebSocket Server**
   - Real-time communication
   - Connection management

3. **Recipe 8: Queue Workers**
   - Background jobs
   - No HTTP server (daemon mode)

**The pattern stays the same - just add more resources and declare dependencies.**

