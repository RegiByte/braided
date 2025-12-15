import { startSystem, haltSystem } from "braided";
import { configResource } from "./config";

const systemConfig = {
  config: configResource,
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
console.log("Config:", system.config);

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
};
const shutdown = makeShutdown();

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Keep alive and show periodic heartbeat
console.log(
  "\n System running (heartbeat every 5s). Press Ctrl+C to shutdown\n"
);
setInterval(() => {
  console.log(`Heartbeat: ${new Date().toLocaleTimeString()}`);
}, 5000);
