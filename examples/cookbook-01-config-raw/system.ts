import { startSystem, haltSystem } from "braided";
import { configResource } from "./config";

// Define your system
const systemConfig = {
  config: configResource,
};

// Start it
const { system, errors } = await startSystem(systemConfig);

if (errors.size > 0) {
  console.error("❌ System failed to start:", errors);
  process.exit(1);
}

// Use the config
console.log("🚀 System started!");
console.log("Port:", system.config.PORT);
console.log("Environment:", system.config.NODE_ENV);
console.log("Log Level:", system.config.LOG_LEVEL);

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
