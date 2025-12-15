# Recipe 4: Database (Prisma)

**Database resource with connection lifecycle management.**

---

## What You'll Learn

- How to manage a database connection as a Braided resource
- Proper connection and disconnection lifecycle
- Working with Prisma Client in a resource context
- Seeding data and running queries
- Why global database singletons are problematic

---

## Prerequisites

- Node.js 18+
- Docker and Docker Compose (for PostgreSQL)
- Completed [Recipe 1](./01-config-raw.md), [Recipe 2](./02-config-typed.md), and [Recipe 3](./03-express-standalone.md)
- Basic understanding of Prisma

---

## The Recipe

### What We're Building

A database resource that:

1. Connects to PostgreSQL using Prisma
2. Manages connection lifecycle explicitly
3. Handles connection errors gracefully
4. Disconnects cleanly on shutdown
5. Can be composed with other resources

### Why This Matters

Most codebases treat Prisma Client as a global singleton:

```typescript
// Common pattern (problematic)
export const prisma = new PrismaClient();

// Used everywhere
import { prisma } from "./db";
await prisma.user.findMany();
```

Problems:

- No lifecycle management (connection never closes gracefully)
- Hard to test (can't swap the database for tests)
- No error handling (connection failures happen at import time or on first query)
- No visibility (can't see when connection opens/closes)

With Braided:

- Explicit lifecycle (clear start and stop)
- Easy testing (swap for mock database, e.g. use test containers)
- Better errors (connection failures are caught and reported)
- Full visibility (log connection state changes)

---

## The Code

### File: `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tasks     Task[]
}

model Task {
  id          Int      @id @default(autoincrement())
  title       String
  description String?
  completed   Boolean  @default(false)
  userId      Int
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
}
```

### File: `database.ts`

```typescript
import { defineResource } from "braided";
import { PrismaClient } from "@prisma/client";

export const databaseResource = defineResource({
  start: async () => {
    console.log("Connecting to database...");

    const prisma = new PrismaClient({
      log: ["error", "warn"],
    });

    // Test connection
    try {
      await prisma.$connect();
      console.log("✓ Database connected");
    } catch (error) {
      console.error("Failed to connect to database:", error);
      throw error;
    }

    return prisma;
  },

  halt: async (prisma) => {
    console.log("Disconnecting from database...");
    await prisma.$disconnect();
    console.log("✓ Database disconnected");
  },
});
```

### File: `system.ts`

```typescript
import { startSystem, haltSystem } from "braided";
import { databaseResource } from "./database.js";

const systemConfig = {
  database: databaseResource,
};

const { system, errors } = await startSystem(systemConfig);

if (errors.size > 0) {
  console.error("System failed to start:");
  errors.forEach((error, resourceName) => {
    console.error(`  - ${resourceName}:`, error.message);
  });
  process.exit(1);
}

console.log("\nSystem started successfully\n");

// Get the database instance
const db = system.database;

// Seed some users if none exist
console.log("Checking for existing users...");
const existingUsers = await db.user.findMany();

if (existingUsers.length === 0) {
  console.log("No users found. Seeding database...\n");

  // Create users with tasks
  const alice = await db.user.create({
    data: {
      email: "alice@example.com",
      name: "Alice",
      tasks: {
        create: [
          {
            title: "Learn Braided",
            description: "Understand resource lifecycle management",
            completed: false,
          },
          {
            title: "Build an API",
            description: "Create a REST API with Express and Prisma",
            completed: false,
          },
        ],
      },
    },
    include: { tasks: true },
  });

  const bob = await db.user.create({
    data: {
      email: "bob@example.com",
      name: "Bob",
      tasks: {
        create: [
          {
            title: "Review code",
            description: "Review Alice's pull request",
            completed: true,
          },
          {
            title: "Deploy to production",
            description: "Deploy the new features",
            completed: false,
          },
        ],
      },
    },
    include: { tasks: true },
  });

  console.log("✓ Created user:", alice.name, `(${alice.tasks.length} tasks)`);
  console.log("✓ Created user:", bob.name, `(${bob.tasks.length} tasks)`);
} else {
  console.log(`✓ Found ${existingUsers.length} existing users`);
}

// Query all users with their tasks
console.log("\nQuerying all users with tasks...\n");
const usersWithTasks = await db.user.findMany({
  include: {
    tasks: {
      orderBy: { createdAt: "asc" },
    },
  },
  orderBy: { name: "asc" },
});

// Display results
usersWithTasks.forEach((user) => {
  console.log(`${user.name} (${user.email})`);
  console.log(`  Tasks: ${user.tasks.length}`);
  user.tasks.forEach((task) => {
    const status = task.completed ? "✓" : "○";
    console.log(`    ${status} ${task.title}`);
    if (task.description) {
      console.log(`      ${task.description}`);
    }
  });
  console.log();
});

// Query incomplete tasks
const incompleteTasks = await db.task.findMany({
  where: { completed: false },
  include: { user: true },
});

console.log(`Total incomplete tasks: ${incompleteTasks.length}\n`);

// Keep the process alive and show heartbeat
console.log("System running. Press Ctrl+C to shutdown\n");
const heartbeat = setInterval(() => {
  console.log(`Heartbeat: ${new Date().toLocaleTimeString()}`);
}, 5000);

// Graceful shutdown
const makeShutdown = () => {
  let isShuttingDown = false;
  return async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    clearInterval(heartbeat);
    console.log("\nShutting down gracefully...");

    await haltSystem(systemConfig, system);
    console.log("✓ Shutdown complete");
    process.exit(0);
  };
};
const shutdown = makeShutdown();

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

### File: `docker-compose.yml`

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    container_name: cookbook-04-postgres
    environment:
      POSTGRES_USER: cookbook
      POSTGRES_PASSWORD: cookbook
      POSTGRES_DB: cookbook_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cookbook"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### File: `package.json`

```json
{
  "name": "cookbook-04-database-prisma",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx system.ts",
    "dev": "tsx --watch system.ts",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "braided": "^0.2.0",
    "@prisma/client": "^6.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "prisma": "^6.1.0",
    "tsx": "^4.21.0",
    "typescript": "^5.3.0"
  }
}
```

---

## Running It

### Setup

```bash
# Install dependencies
npm install

# Start PostgreSQL
docker-compose up -d

# Wait for database to be ready

# Create .env file
echo 'DATABASE_URL="postgresql://cookbook:cookbook@localhost:5432/cookbook_db?schema=public"' > .env

# Note: If port 5432 is already in use, change it to 5433 in both docker-compose.yml and .env

# Generate Prisma Client and push schema
npm run db:generate
npm run db:push
```

### Start the System

```bash
npm start
```

**Expected Output:**

```
Connecting to database...
✓ Database connected

System started successfully

Checking for existing users...
No users found. Seeding database...

✓ Created user: Alice (2 tasks)
✓ Created user: Bob (2 tasks)

Querying all users with tasks...

Alice (alice@example.com)
  Tasks: 2
    ○ Learn Braided
      Understand resource lifecycle management
    ○ Build an API
      Create a REST API with Express and Prisma

Bob (bob@example.com)
  Tasks: 2
    ✓ Review code
      Review Alice's pull request
    ○ Deploy to production
      Deploy the new features

Total incomplete tasks: 3

System running. Press Ctrl+C to shutdown

Heartbeat: 10:30:45 AM
```

### Test Graceful Shutdown

Press `Ctrl+C`:

```
Shutting down gracefully...
Disconnecting from database...
✓ Database disconnected
✓ Shutdown complete
```

**The database connection closes cleanly!**

---

## What's Happening

### 1. Database as a Resource

```typescript
export const databaseResource = defineResource({
  start: async () => {
    const prisma = new PrismaClient({ log: ["error", "warn"] });
    await prisma.$connect();
    return prisma;
  },
  halt: async (prisma) => {
    await prisma.$disconnect();
  },
});
```

**Key points:**

- **Explicit connection** - We call `$connect()` to establish the connection immediately
- **Error handling** - Connection failures are caught and logged
- **Graceful disconnect** - `$disconnect()` closes all connections cleanly
- **Logging** - Prisma logs errors and warnings for debugging

### 2. System Configuration

```typescript
const systemConfig = {
  database: databaseResource,
};

const { system, errors } = await startSystem(systemConfig);
```

After startup, we can access the Prisma Client:

```typescript
const db = system.database;
```

This is the same Prisma Client instance returned from the `start` function.

### 3. Database Operations

**Creating records with relations:**

```typescript
const alice = await db.user.create({
  data: {
    email: "alice@example.com",
    name: "Alice",
    tasks: {
      create: [
        { title: "Learn Braided", description: "...", completed: false },
      ],
    },
  },
  include: { tasks: true },
});
```

**Querying with relations:**

```typescript
const usersWithTasks = await db.user.findMany({
  include: {
    tasks: {
      orderBy: { createdAt: "asc" },
    },
  },
  orderBy: { name: "asc" },
});
```

**Filtering:**

```typescript
const incompleteTasks = await db.task.findMany({
  where: { completed: false },
  include: { user: true },
});
```

### 4. Keeping the Process Alive

```typescript
const heartbeat = setInterval(() => {
  console.log(`Heartbeat: ${new Date().toLocaleTimeString()}`);
}, 5000);
```

Unlike an HTTP server (which keeps the event loop alive naturally), a database connection alone won't prevent Node.js from exiting. The heartbeat interval keeps the process running and provides visibility that the system is active.

---

## Try It Yourself

### Experiment 1: Add More Data

```typescript
const charlie = await db.user.create({
  data: {
    email: "charlie@example.com",
    name: "Charlie",
    tasks: {
      create: [
        { title: "Write tests", completed: false },
        { title: "Update docs", completed: true },
      ],
    },
  },
  include: { tasks: true },
});
```

### Experiment 2: Query Specific Users

```typescript
const user = await db.user.findUnique({
  where: { email: "alice@example.com" },
  include: { tasks: true },
});
```

### Experiment 3: Update Tasks

```typescript
await db.task.update({
  where: { id: 1 },
  data: { completed: true },
});
```

### Experiment 4: Delete Users (Cascade Delete)

```typescript
await db.user.delete({
  where: { email: "bob@example.com" },
});
// Bob's tasks are automatically deleted due to onDelete: Cascade
```

### Experiment 5: View Database in Browser

```bash
npm run db:studio
```

Opens Prisma Studio at `http://localhost:5555` for visual database exploration.

---

## Key Takeaways

1. **Database connections are resources** - They have a lifecycle (connect/disconnect)
2. **Explicit is better than implicit** - We explicitly connect and disconnect
3. **Graceful shutdown matters** - Closing connections cleanly prevents data corruption
4. **Prisma Client is stateful** - It maintains connection pools and should be managed carefully
5. **Testing connectivity early** - We test the connection in the `start` function
6. **Global singletons are problematic** - No lifecycle, hard to test, no error handling

---

## Comparison: Traditional vs Braided

| Aspect             | Traditional Prisma                         | Braided Prisma                   |
| ------------------ | ------------------------------------------ | -------------------------------- |
| **Initialization** | `export const prisma = new PrismaClient()` | Resource with explicit lifecycle |
| **Connection**     | Implicit (on first query)                  | Explicit (`$connect()` in start) |
| **Disconnection**  | Manual or never                            | Automatic via `haltSystem()`     |
| **Testing**        | Hard to swap for mocks                     | Easy (swap resource)             |
| **Error Handling** | Fails at import time or first query        | Caught during startup            |

---

## Common Issues

### Connection Refused

**Error:** `Can't reach database server at localhost:5432`

**Solution:** Ensure PostgreSQL is running:

```bash
docker-compose ps
docker-compose up -d
```

### Port Already in Use

**Error:** `port is already allocated`

**Solution:** Another PostgreSQL instance is using port 5432. Either stop it or change the port in `docker-compose.yml` and `DATABASE_URL`.

### Prisma Client Not Generated

**Error:** `Cannot find module '@prisma/client'`

**Solution:** Generate the Prisma Client:

```bash
npm run db:generate
```

### Schema Not Applied

**Error:** `Table 'User' does not exist`

**Solution:** Push the schema to the database:

```bash
npm run db:push
```

---

## Next Steps

**Next Recipe:** Full Stack Composition - Combining config, database, and HTTP server

In Recipe 5, we'll compose this database resource with a config resource, showing how to:

- Load database credentials from environment variables
- Make the database resource depend on config
- Build a full-stack system with multiple resources
- See the true power of dependency composition

---

**Questions? Check the [runnable example](/examples/cookbook-04-database-prisma)**

---

## Preview: What's Next

In the next recipes, we'll:

1. Add a **config resource** with database URL
2. Make the **database depend on config**
3. Add an **Express API** that uses the database
4. Compose them all together

The pattern stays the same - just add more resources and declare dependencies. **Complexity doesn't compound, it composes.**
