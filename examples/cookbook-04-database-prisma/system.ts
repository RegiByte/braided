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
