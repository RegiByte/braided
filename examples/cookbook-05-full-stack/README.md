# Recipe 5: Full-Stack Composition

This recipe demonstrates how to compose multiple Braided resources with dependencies to build a complete full-stack application. We combine configuration, database, API, and HTTP server resources into a single system.

## What You'll Learn

- Composing multiple resources with dependencies
- Automatic startup and shutdown ordering based on dependency graph
- Building a complete REST API with database backing
- Environment-based configuration
- Production-ready error handling and graceful shutdown

## Prerequisites

- Docker and Docker Compose (for PostgreSQL)
- Node.js 18+ and npm
- Completed [Recipe 2](../cookbook-02-config-typed), [Recipe 3](../cookbook-03-express-standalone), and [Recipe 4](../cookbook-04-database-prisma)

## Project Structure

```
cookbook-05-full-stack/
├── prisma/
│   └── schema.prisma      # Database schema (users + tasks)
├── config.ts              # Config resource (loads .env)
├── database.ts            # Database resource (depends on config)
├── api.ts                 # Express API resource (depends on database)
├── http-server.ts         # HTTP server resource (depends on api + config)
├── system.ts              # System configuration
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

### 3. Create .env File

```bash
cp .env.example .env
```

The default configuration:

```
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL="postgresql://cookbook:cookbook@localhost:5434/cookbook_db?schema=public"
```

**Note:** This uses port 5434 to avoid conflicts with other PostgreSQL instances.

### 4. Generate Prisma Client and Push Schema

```bash
npm run db:generate
npm run db:push
```

## Running the Example

```bash
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
  GET    http://localhost:3000/api/users/:id
  POST   http://localhost:3000/api/users
  GET    http://localhost:3000/api/tasks
  GET    http://localhost:3000/api/tasks?completed=true
  POST   http://localhost:3000/api/users/:userId/tasks
  PATCH  http://localhost:3000/api/tasks/:id
  DELETE http://localhost:3000/api/tasks/:id

Press Ctrl+C to shutdown
```

## Testing the API

### Health Check

```bash
curl http://localhost:3000/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2025-12-15T20:30:00.000Z"
}
```

### Get All Users

```bash
curl http://localhost:3000/api/users
```

Response:

```json
{
  "users": [
    {
      "id": 1,
      "email": "alice@example.com",
      "name": "Alice",
      "createdAt": "2025-12-15T20:30:00.000Z",
      "updatedAt": "2025-12-15T20:30:00.000Z",
      "tasks": [
        {
          "id": 1,
          "title": "Learn Braided",
          "description": "Understand resource lifecycle management",
          "completed": false,
          "userId": 1,
          "createdAt": "2025-12-15T20:30:00.000Z",
          "updatedAt": "2025-12-15T20:30:00.000Z"
        }
      ]
    }
  ]
}
```

### Get Incomplete Tasks

```bash
curl http://localhost:3000/api/tasks?completed=false
```

### Create a New User

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"charlie@example.com","name":"Charlie"}'
```

### Create a Task for a User

```bash
# First, get a valid user ID from the users list
curl http://localhost:3000/api/users

# Then create a task for that user
curl -X POST http://localhost:3000/api/users/1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Write tests","description":"Add unit tests","completed":false}'
```

**Note:** If the user doesn't exist, you'll get a 404 error with a helpful message.

### Update a Task

```bash
curl -X PATCH http://localhost:3000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'
```

### Delete a Task

```bash
curl -X DELETE http://localhost:3000/api/tasks/1
```

## Graceful Shutdown

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

**Notice the shutdown order:** Server → API → Database → Config (reverse of startup)

## How It Works

### Resource Dependencies

```typescript
const systemConfig = {
  config: configResource, // No dependencies
  database: databaseResource, // Depends on: config
  api: apiResource, // Depends on: database
  httpServer: httpServerResource, // Depends on: api, config
};
```

**Dependency Graph:**

```
config
  ↓
database
  ↓
api ← config
  ↓
httpServer
```

### Startup Order

Braided automatically determines the correct startup order:

1. **config** - Loads environment variables, validates schema
2. **database** - Connects to PostgreSQL using `config.DATABASE_URL`
3. **api** - Creates Express app with routes using `database`
4. **httpServer** - Starts HTTP server on `config.PORT` with `api`

### Shutdown Order

Shutdown happens in reverse:

1. **httpServer** - Stops accepting connections, closes gracefully
2. **api** - Cleans up Express app
3. **database** - Disconnects from PostgreSQL
4. **config** - Cleanup (if needed)

### Config Resource

```typescript
export const configResource = defineResource({
  start: async () => {
    loadEnv();
    const result = configSchema.safeParse({
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      DATABASE_URL: process.env.DATABASE_URL,
    });

    if (!result.success) {
      throw new Error("Configuration validation failed");
    }

    return result.data;
  },
  halt: async (config) => {},
});
```

### Database Resource (with Dependency)

```typescript
export const databaseResource = defineResource({
  dependencies: ["config"],

  start: async ({ config }) => {
    const prisma = new PrismaClient({
      datasources: {
        db: { url: config.DATABASE_URL },
      },
    });

    await prisma.$connect();
    return prisma;
  },

  halt: async (prisma) => {
    await prisma.$disconnect();
  },
});
```

**Key point:** Database resource receives `config` from the started system.

### API Resource (with Dependency)

```typescript
export const apiResource = defineResource({
  dependencies: ["database"],

  start: async ({ database: db }) => {
    const app = express();

    app.get("/api/users", async (req, res) => {
      const users = await db.user.findMany({
        include: { tasks: true },
      });
      res.json({ users });
    });

    // ... more routes

    return app;
  },

  halt: async (app) => {},
});
```

**Key point:** API resource receives `database` (Prisma Client) from the started system.

### HTTP Server Resource (with Dependencies)

```typescript
export const httpServerResource = defineResource({
  dependencies: ["api", "config"],

  start: async ({ api, config }) => {
    return new Promise((resolve, reject) => {
      const server = api.listen(config.PORT, (err) => {
        if (err) reject(err);
        else resolve(server);
      });
    });
  },

  halt: async (server) => {
    // Graceful shutdown with grace period
  },
});
```

**Key point:** Server resource receives both `api` and `config`.

## API Endpoints

### Users

- `GET /api/users` - Get all users with their tasks
- `GET /api/users/:id` - Get a specific user by ID
- `POST /api/users` - Create a new user
  - Body: `{ "email": "...", "name": "..." }`

### Tasks

- `GET /api/tasks` - Get all tasks
- `GET /api/tasks?completed=true` - Get completed tasks
- `GET /api/tasks?completed=false` - Get incomplete tasks
- `POST /api/users/:userId/tasks` - Create a task for a user
  - Body: `{ "title": "...", "description": "...", "completed": false }`
- `PATCH /api/tasks/:id` - Update a task
  - Body: `{ "title": "...", "description": "...", "completed": true }`
- `DELETE /api/tasks/:id` - Delete a task

### Health

- `GET /health` - Health check endpoint

## Key Takeaways

1. **Automatic ordering** - Braided resolves dependencies and starts resources in the correct order
2. **Type safety** - TypeScript ensures dependencies are correctly typed
3. **Explicit dependencies** - No hidden imports or global state
4. **Graceful shutdown** - Reverse order ensures clean teardown
5. **Easy testing** - Swap any resource for mocks (e.g., mock database for tests)
6. **Composition scales** - Adding more resources doesn't increase complexity

## Common Issues

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:** Change `PORT` in `.env` or stop the other process.

### Database Connection Failed

**Error:** `Can't reach database server`

**Solution:** Ensure PostgreSQL is running:

```bash
docker-compose ps
docker-compose up -d
```

### Configuration Validation Failed

**Error:** `DATABASE_URL must be a valid URL`

**Solution:** Check `.env` file has correct `DATABASE_URL` format.

## Useful Commands

```bash
# View database in browser
npm run db:studio

# Reset database
docker-compose down -v
docker-compose up -d
npm run db:push

# View logs
docker-compose logs -f postgres

# Stop everything
docker-compose down
```

## Why This Matters

### Traditional Approach (Problematic)

```typescript
// config.ts
export const config = loadConfig();

// db.ts
import { config } from "./config";
export const prisma = new PrismaClient({
  datasources: { db: { url: config.DATABASE_URL } },
});

// api.ts
import { prisma } from "./db";
export const app = express();
app.get("/users", async (req, res) => {
  const users = await prisma.user.findMany();
  res.json({ users });
});

// server.ts
import { app } from "./api";
import { config } from "./config";
app.listen(config.PORT);
```

**Problems:**

- Implicit dependencies (hidden import chains)
- No lifecycle management (when does DB disconnect?)
- Hard to test (can't swap database)
- No guaranteed startup order
- No graceful shutdown

### Braided Approach

```typescript
const systemConfig = {
  config: configResource,
  database: databaseResource,
  api: apiResource,
  httpServer: httpServerResource,
};

await startSystem(systemConfig);
```

**Benefits:**

- Explicit dependencies
- Automatic correct ordering
- Graceful shutdown built-in
- Easy to test (swap resources)
- Clear system topology

## Next Steps

In Recipe 6, we'll explore:

- Testing strategies (mocking resources)
- WebSocket integration
- Queue workers
- Production deployment patterns

Continue to [Recipe 6: Testing Strategies](../cookbook-06-testing/README.md)

---

**Questions? Check the [runnable example](/examples/cookbook-05-full-stack)**
