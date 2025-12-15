# Recipe 4: Database Resource with Prisma

This recipe demonstrates how to manage a database connection as a Braided resource with proper lifecycle management. We use Prisma as the ORM and PostgreSQL as the database.

## What You'll Learn

- Creating a database resource with connection lifecycle
- Managing Prisma Client as a resource
- Graceful database connection and disconnection
- Seeding data and running queries
- Testing database connectivity

## Prerequisites

- Docker and Docker Compose (for PostgreSQL)
- Node.js 18+ and npm
- Basic understanding of Prisma

## Project Structure

```
cookbook-04-database-prisma/
├── prisma/
│   └── schema.prisma      # Database schema (users + tasks)
├── database.ts            # Database resource definition
├── system.ts              # System configuration and demo queries
├── docker-compose.yml     # PostgreSQL container
├── package.json
└── tsconfig.json
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start PostgreSQL

```bash
docker-compose up -d
```

Wait for the database to be ready (about 5 seconds).

### 3. Create .env File

```bash
cp .env.example .env
```

The default connection string is:

```
DATABASE_URL="postgresql://cookbook:cookbook@localhost:5432/cookbook_db?schema=public"
```

**Note:** If port 5432 is already in use, change it to 5433 in both `docker-compose.yml` and `.env`.

### 4. Generate Prisma Client and Push Schema

```bash
npm run db:generate
npm run db:push
```

This generates the Prisma Client and creates the database tables.

## Running the Example

```bash
npm start
```

### Expected Output

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

Press `Ctrl+C` to trigger graceful shutdown:

```
Shutting down gracefully...
Disconnecting from database...
✓ Database disconnected
✓ Shutdown complete
```

## How It Works

### Database Resource

The database resource manages the Prisma Client lifecycle:

```typescript
export const databaseResource = defineResource({
  start: async () => {
    console.log("Connecting to database...");

    const prisma = new PrismaClient({
      log: ["error", "warn"],
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

**Key points:**

1. **Explicit connection** - We call `$connect()` to establish the connection immediately
2. **Error handling** - Connection failures are caught and logged
3. **Graceful disconnect** - `$disconnect()` closes all connections cleanly
4. **Logging** - Prisma logs errors and warnings for debugging

### System Configuration

The system is simple with just one resource:

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

### Database Operations

The example demonstrates common Prisma operations:

**Creating records with relations:**

```typescript
const alice = await db.user.create({
  data: {
    email: "alice@example.com",
    name: "Alice",
    tasks: {
      create: [
        { title: "Learn Braided", description: "...", completed: false },
        { title: "Build an API", description: "...", completed: false },
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

## Database Schema

The schema defines two tables with a one-to-many relationship:

```prisma
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

**Features:**

- Auto-incrementing IDs
- Unique email constraint
- Automatic timestamps
- Cascade delete (deleting a user deletes their tasks)
- Index on `userId` for query performance

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

**Solution:** Another PostgreSQL instance is using port 5432. Either:

1. Stop the other instance
2. Change the port in `docker-compose.yml` and `DATABASE_URL`

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

## Useful Commands

```bash
# View database in browser
npm run db:studio

# Reset database (delete all data)
docker-compose down -v
docker-compose up -d
npm run db:push

# View logs
docker-compose logs -f postgres

# Stop database
docker-compose down
```

## Key Takeaways

1. **Database connections are resources** - They have a lifecycle (connect/disconnect)
2. **Explicit is better than implicit** - We explicitly connect and disconnect
3. **Graceful shutdown matters** - Closing connections cleanly prevents data corruption
4. **Prisma Client is stateful** - It maintains connection pools and should be managed carefully
5. **Testing connectivity early** - We test the connection in the `start` function

## Why This Matters

Many codebases treat the Prisma Client as a global singleton:

```typescript
// Common pattern (problematic)
export const prisma = new PrismaClient();
```

**Problems with this approach:**

1. **No lifecycle management** - Connection never closes gracefully
2. **Hard to test** - Can't swap the database for tests
3. **No error handling** - Connection failures happen at import time
4. **No visibility** - Can't see when connection opens/closes

**With Braided:**

1. **Explicit lifecycle** - Clear start and stop
2. **Easy testing** - Swap for mock database
3. **Better errors** - Connection failures are caught and reported
4. **Full visibility** - Log connection state changes

## Next Steps

In Recipe 5, we'll compose this database resource with a config resource, showing how to:

- Load database credentials from environment variables
- Make the database resource depend on config
- Build a full-stack system with multiple resources

Continue to [Recipe 5: Full Stack Composition](../cookbook-05-full-stack/README.md)
