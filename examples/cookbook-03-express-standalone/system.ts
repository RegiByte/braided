import { startSystem, haltSystem, defineResource } from "braided";
import { expressAppResource } from "./express-app.js";
import { httpServerResource } from "./http-server.js";

const systemConfig = {
  expressApp: expressAppResource,
  httpServer: httpServerResource,
  port: defineResource({
    start: () => 3000, // just gives the port to dependants, static
    halt: () => {},
  }),
};

const { system, errors } = await startSystem(systemConfig);

if (errors.size > 0) {
  console.error("❌ System failed to start:");
  errors.forEach((error, resourceName) => {
    console.error(`  - ${resourceName}:`, error.message);
  });
  process.exit(1);
}

console.log("🚀 System started!");
console.log("Try:");
console.log("  curl http://localhost:3000/");
console.log("  curl http://localhost:3000/health");
console.log("  curl http://localhost:3000/api/users");

// Graceful shutdown
const makeShutdown = () => {
  let isShuttingDown = false;
  return async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\n📴 Shutting down gracefully...");
    await haltSystem(systemConfig, system);
    console.log("✅ Shutdown complete");
    process.exit(0);
  };
}
const shutdown = makeShutdown();

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
