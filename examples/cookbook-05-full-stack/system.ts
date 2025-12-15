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
  console.error("\nSystem failed to start all resources:");
  errors.forEach((error, resourceName) => {
    console.error(`  - ${resourceName}:`, error.message);
  });
  console.error("\nHalting system...\n");
  await haltSystem(systemConfig, system);
  console.error("\n✓ System halted successfully!\n");
  process.exit(1);
}

console.log("\n✓ System started successfully!\n");

const db = system.database;
const config = system.config;

// Seed some initial data if database is empty
console.log("Checking for existing users...");
const existingUsers = await db.user.findMany();

if (existingUsers.length === 0) {
  console.log("No users found. Seeding database...\n");

  await db.user.create({
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
  });

  await db.user.create({
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
  });

  console.log("✓ Database seeded with sample data\n");
} else {
  console.log(`✓ Found ${existingUsers.length} existing users\n`);
}

console.log("API endpoints available:");
console.log(`  GET    http://localhost:${config.PORT}/health`);
console.log(`  GET    http://localhost:${config.PORT}/api/users`);
console.log(`  GET    http://localhost:${config.PORT}/api/users/:id`);
console.log(`  POST   http://localhost:${config.PORT}/api/users`);
console.log(`  GET    http://localhost:${config.PORT}/api/tasks`);
console.log(
  `  GET    http://localhost:${config.PORT}/api/tasks?completed=true`
);
console.log(`  POST   http://localhost:${config.PORT}/api/users/:userId/tasks`);
console.log(`  PATCH  http://localhost:${config.PORT}/api/tasks/:id`);
console.log(`  DELETE http://localhost:${config.PORT}/api/tasks/:id`);
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
