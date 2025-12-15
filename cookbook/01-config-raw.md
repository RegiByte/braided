# Recipe 1: Config (Raw)

**Load environment variables into a simple config resource.**

---

## 🎯 **What You'll Learn**

- How to create a basic Braided resource
- How to load environment variables
- How startup and shutdown work
- How resources live in closure space (not global scope)

---

## 📦 **Prerequisites**

- Node.js 18+
- Basic understanding of environment variables

---

## **What We're Building**

A config resource that:

1. Loads environment variables from a `.env` file
2. Returns them as a simple object
3. Demonstrates the resource lifecycle (startup/shutdown)

### **Why This Matters**

Instead of importing `process.env` everywhere (global state), we create a **config resource** that:

- Lives in closure space (not global)
- Gets distributed through Braided's dependency system
- Can be swapped or mocked for testing
- Has a clear lifecycle

---

## 📝 **The Code**

### **File: `config.ts`**

```typescript
import { defineResource } from "braided";
import { config as loadEnv } from "dotenv";

export type Config = {
  PORT: string;
  NODE_ENV: string;
  LOG_LEVEL: string;
};

export const configResource = defineResource({
  async start() {
    console.log("📝 Loading configuration...");

    // Load .env file
    loadEnv();

    // Extract the values we care about
    const config: Config = {
      PORT: process.env.PORT || "3000",
      NODE_ENV: process.env.NODE_ENV || "development",
      LOG_LEVEL: process.env.LOG_LEVEL || "info",
    };

    console.log("✅ Configuration loaded:", config);

    return config;
  },

  async halt(config) {
    console.log("👋 Config shutdown (nothing to clean up)");
    // Config has no cleanup needed, but we demonstrate the lifecycle
  },
});
```

### **File: `.env`**

```bash
PORT=8080
NODE_ENV=production
LOG_LEVEL=debug
```

### **File: `system.ts`**

```typescript
import { startSystem } from "braided";
import { configResource } from "./config.js";

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
const shutdown = async () => {
  console.log("📴 Shutting down...");
  await haltSystem(systemConfig, system);
  console.log("✅ Shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Keep alive and show periodic heartbeat
// Note: This is a trick that we are using here to ensure the node process
// does not stop until you manually stop it by pressing Ctrl+C or send a SIGKILL signal.
// In a real-world application, your system would probably already do this (keep alive by default).
console.log(
  "\n System running (heartbeat every 5s). Press Ctrl+C to shutdown\n"
);
setInterval(() => {
  console.log(`Heartbeat: ${new Date().toLocaleTimeString()}`);
}, 5000);
```

### **File: `package.json`**

```json
{
  "name": "cookbook-01-config-raw",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx system.ts"
  },
  "dependencies": {
    "braided": "^0.2.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsx": "^4.21.0",
    "typescript": "^5.3.0"
  }
}

```

---

## 🚀 **Running It**

```bash
# Install dependencies
npm install

# Create your .env file
echo "PORT=8080" > .env
echo "NODE_ENV=production" >> .env
echo "LOG_LEVEL=debug" >> .env

# Run it
npm start
```

**Expected Output:**

```
📝 Loading configuration...
✅ Configuration loaded: { PORT: '8080', NODE_ENV: 'production', LOG_LEVEL: 'debug' }
🚀 System started!
Port: 8080
Environment: production
Log Level: debug
```

Press `Ctrl+C` to trigger shutdown:

```
📴 Shutting down...
👋 Config shutdown (nothing to clean up)
✅ Shutdown complete
```

---

## 🔍 **What's Happening**

### **1. Resource Creation**

```typescript
export const configResource = defineResource({
  async start() {
    /* ... */
  },
  async halt(config) {
    /* ... */
  },
});
```

Every Braided resource has:

- **`start(deps)`** - Called when the system starts, returns the started resource instance
- **`halt(instance)`** - Called when the system stops, receives the started resource instance

### **2. System Composition**

```typescript
const systemConfig = {
  config: configResource,
};

const { system, errors } = await startSystem(systemConfig);
```

`startSystem()` takes a config object where:

- **Keys** = resource IDs (how you access them and reference them in dependencies)
- **Values** = resource definitions

It returns:

- **`system`** - Object with your started resources (`system.config`)
- **`errors`** - Map of any startup errors

### **3. Closure Space**

The config lives in **closure space** - it's not global. It's just a value returned from `start()` and accessible via `system.config`.

This means:

- ✅ No global state pollution
- ✅ Easy to test (just call `start()`)
- ✅ Easy to mock (pass a different value)
- ✅ Clear lifecycle (startup → use → shutdown)

### **4. Graceful Shutdown**

```typescript
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
```

When you call `haltSystem(systemConfig, system)`, Braided:

1. Calls `halt(instance)` on each resource
2. In reverse dependency order (we'll see this in later recipes)
3. Waits for each to complete

---

## 🧪 **Try It Yourself**

### **Experiment 1: Add More Config Values**

Add `DATABASE_URL` to your `.env` and config type:

```typescript
export type Config = {
  PORT: string;
  NODE_ENV: string;
  LOG_LEVEL: string;
  DATABASE_URL: string; // Add this
};
```

### **Experiment 2: Handle Missing Values**

What happens if `PORT` is not set? Try it:

```bash
# Remove PORT from .env
echo "NODE_ENV=production" > .env
npm start
```

It falls back to `'3000'`. That's the default we specified.

### **Experiment 3: Test the Resource**

Resources are easy to test because they're just functions:

```typescript
import { configResource } from "./config.js";

// Test it
const config = await configResource.start();
console.log("Config loaded:", config);

await configResource.halt(config);
console.log("Config cleaned up");
```

No framework needed. No mocking. Just call the functions.

---

## 🎓 **Key Takeaways**

1. **Resources are simple** - Just `start()` and `halt()` functions
2. **Resources live in closure space** - Not global, not in async store
3. **Resources are testable** - Just functions you can call
4. **Lifecycle is explicit** - Clear start and halt order

---

## ➡️ **Next Steps**

**Next Recipe:** [Config (Typed)](./02-config-typed.md) - Add Zod validation for type safety

**Try:**

- Add more environment variables
- Create a second resource (we'll do this in Recipe 3)
- Test the config resource in isolation

---

**Questions? Check the [runnable example](/examples/cookbook-01-config-raw)** 📦
