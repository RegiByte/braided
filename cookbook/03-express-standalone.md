# Recipe 3: Express (Standalone)

**HTTP server resource with graceful shutdown.**

---

## 🎯 **What You'll Learn**

- How to create an Express server as a Braided resource
- How to handle graceful shutdown properly
- Why separating the app from the server matters
- How to manage HTTP connections during shutdown

---

## 📦 **Prerequisites**

- Node.js 18+
- Completed [Recipe 1](./01-config-raw.md) and [Recipe 2](./02-config-typed.md)
- Basic Express knowledge

---

## 🧑‍🍳 **The Recipe**

### **What We're Building**

An Express server resource that:

1. Creates an Express app with routes
2. Starts an HTTP server
3. Handles graceful shutdown (closes connections properly)
4. Can be composed with other resources later

### **Why This Matters**

Most Express tutorials do this:

```typescript
const app = express();
app.listen(3000);
```

Problems:

- ❌ No graceful shutdown
- ❌ Server keeps running after `Ctrl+C`
- ❌ Active connections get killed with no warning
- ❌ Can't test app without starting the server

With Braided:

- ✅ Graceful shutdown built-in
- ✅ Connections close cleanly
- ✅ Server lifecycle is explicit
- ✅ Easy to test (app is separate from server)

---

## 📝 **The Code**

### **File: `express-app.ts`**

```typescript
import { defineResource } from "braided";
import express from "express";

export const expressAppResource = defineResource({
  start: async () => {
    console.log("🚀 Creating Express app...");

    const app = express();

    // Middleware
    app.use(express.json());

    // Routes
    app.get("/", (req, res) => {
      res.json({ message: "Hello from Braided!" });
    });

    app.get("/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    app.get("/api/users", (req, res) => {
      res.json({ users: ["Alice", "Bob", "Charlie"] });
    });

    console.log("✅ Express app created");

    return app;
  },

  halt: async (app) => {
    console.log("👋 Express app shutdown (nothing to clean up)");
    // The app itself has no cleanup, but the server does (next resource)
    // waiting for 2 seconds to see the http server closing first, then the express app
    // this is just for demonstration purposes
    // to show that the server will stop accepting new connections
    // but other resources will continue to stop gracefully
    // if you don't want to wait, you can safely remove this
    await new Promise((resolve) => setTimeout(resolve, 2000));
  },
});
```

### **File: `http-server.ts`**

```typescript
import { defineResource } from "braided";
import { Express } from "express";

export const httpServerResource = defineResource({
  dependencies: ["expressApp", "port"],

  start: async ({
    expressApp: app,
    port,
  }: {
    expressApp: Express;
    port: number;
  }) => {
    console.log(`🌐 Starting HTTP server on port ${port}...`);

    // Wait for http server to start, return server instance
    return new Promise((resolve, reject) => {
      const server = app.listen(port, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve(server);
        }
      });
    }) as Promise<ReturnType<typeof app.listen>>;
  },

  halt: async (server) => {
    console.log("📴 Closing HTTP server...");

    return new Promise<void>((resolve) => {
      let resolved = false;

      const finish = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      // Stop accepting new connections
      server.close((err) => {
        if (err) {
          console.error("❌ Error closing server:", err);
        } else {
          console.log("✅ HTTP server closed gracefully");
        }
        finish();
      });

      // Give active requests 3 seconds to finish
      setTimeout(() => {
        if (resolved) return;
        console.log("⏱️  Grace period ended, closing connections...");
        // See the docs https://nodejs.org/api/http.html#servercloseidleconnections
        server.closeIdleConnections();
        // this will close all keep-alive connections
        // which are all connections that are not waiting for a response or not requesting anything
        // or, if you really want to force it
        // server.closeAllConnections();
        // https://nodejs.org/api/http.html#servercloseallconnections
      }, 3000);

      // Hard timeout after 5 seconds total
      // if the server hasn't stopped at this point, we need to force it to close
      setTimeout(() => {
        if (resolved) return;
        console.log("⚠️  Forcing shutdown after timeout");
        finish();
      }, 5000);
    });
  },
});
```

### **File: `system.ts`**

```typescript
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
};
const shutdown = makeShutdown();

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

### **File: `package.json`**

```json
{
  "name": "cookbook-03-express-standalone",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx system.ts",
    "dev": "tsx --watch system.ts"
  },
  "dependencies": {
    "braided": "^0.2.0",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.25",
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

# Start the server
npm start
```

**Expected Output:**

```
🚀 Creating Express app...
✅ Express app created
🌐 Starting HTTP server on port 3000...
🚀 System started!
Try:
  curl http://localhost:3000/
  curl http://localhost:3000/health
  curl http://localhost:3000/api/users
```

### **Test the Endpoints**

In another terminal:

```bash
# Root endpoint
curl http://localhost:3000/
# {"message":"Hello from Braided!"}

# Health check
curl http://localhost:3000/health
# {"status":"ok","timestamp":"2025-12-15T..."}

# Users API
curl http://localhost:3000/api/users
# {"users":["Alice","Bob","Charlie"]}
```

### **Test Graceful Shutdown**

Press `Ctrl+C` in the server terminal:

```
^C
📴 Shutting down gracefully...
📴 Closing HTTP server...
✅ HTTP server closed gracefully
👋 Express app shutdown (nothing to clean up)
✅ Shutdown complete
```

**The server closes cleanly!** ✅

---

## 🔍 **What's Happening**

### **1. Two Resources, Not One**

We split the Express app into **two resources**:

```typescript
expressApp: expressAppResource, // Creates the Express app
httpServer: httpServerResource, // Starts the HTTP server
port: defineResource({
  start: () => 3000, // just gives the port to dependants, static
  halt: () => {},
}),
```

**Why?**

- The **app** (routes, middleware) is separate from the **server** (listening on a port)
- You can test the app without starting the server
- You can swap the server (HTTP vs HTTPS) without changing the app
- Clear separation of concerns

### **2. Resource Dependencies**

```typescript
httpServer: defineResource({
  dependencies: ["expressApp", "port"],
  start: ({ expressApp, port }) => {
    // startup logic here
  },
  halt: ({ expressApp, port }) => {
    // shutdown logic here
  },
}),
```

The `httpServer` resource **depends on** `expressApp`:

- `expressApp: () => app` - Gets the app from the started system
- `port: () => 3000` - Hardcoded static resource for now (we'll use config in later recipes)

Braided ensures:

1. `expressApp` starts first
2. `httpServer` starts second (receives the app)
3. Shutdown happens in reverse order

### **3. Graceful Shutdown**

```typescript
halt: async (server) => {
  return new Promise<void>((resolve) => {
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    // Stop accepting new connections
    server.close((err) => {
      if (err) {
        console.error("❌ Error closing server:", err);
      } else {
        console.log("✅ HTTP server closed gracefully");
      }
      finish();
    });
    setTimeout(() => {
      if (resolved) return;
      console.log("⏱️  Grace period ended, closing connections...");
      server.closeIdleConnections();
    }, 3000);
    setTimeout(() => {
      if (resolved) return;
      console.log("⚠️  Forcing shutdown after timeout");
      finish();
    }, 5000);
  });
},
```

**What happens:**

1. `server.close()` - Stops accepting new connections
2. Waits for existing connections to finish
3. After 3 seconds, force-closes all idle connections
4. After 5 seconds, force-closes all connections
5. Resolves the promise when done, rest of the system continues to halt

**This prevents:**

- ❌ Killing active requests mid-flight
- ❌ Hanging forever on stuck connections
- ❌ Ungraceful termination, data dropped mid-flight

### **4. Signal Handling**

```typescript
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
```

**Handles:**

- `SIGTERM` - Sent by process managers (Docker, Kubernetes, systemd)
- `SIGINT` - Sent by `Ctrl+C` in terminal

Both trigger graceful shutdown before exiting.

---

## 🧪 **Try It Yourself**

### **Experiment 1: Add More Routes**

```typescript
app.post("/api/users", (req, res) => {
  const { name } = req.body;
  res.json({ message: `User ${name} created!` });
});
```

Test:

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Dave"}'
```

### **Experiment 2: Test Without Starting Server**

```typescript
// test-app.ts
import { expressAppResource } from "./express-app.js";
import request from "supertest";

const app = await expressAppResource.start();

const response = await request(app).get("/health");
console.log(response.body); // { status: 'ok', timestamp: '...' }

await expressAppResource.halt(app);
```

**No server needed for testing!** The app is just an Express instance.

### **Experiment 3: Add Middleware**

```typescript
// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});
```

### **Experiment 4: Change the Port**

```typescript
port: defineResource({
  start: () => 8080, // same resource, different port
  halt: () => {}, // nothing to do
}),
```

---

## 🎓 **Key Takeaways**

1. **Split app from server** - Separate concerns, easier testing
2. **Dependencies are explicit** - Server depends on app
3. **Graceful shutdown is built-in** - No manual cleanup code
4. **Resources compose naturally** - Add more resources later (database, cache, etc.)
5. **Lifecycle is clear** - Startup → running → shutdown

---

## 🔄 **Comparison: Traditional vs Braided**

| Aspect           | Traditional Express       | Braided Express                   |
| ---------------- | ------------------------- | --------------------------------- |
| **Startup**      | `app.listen(3000)`        | Resource with explicit lifecycle  |
| **Shutdown**     | Manual `server.close()`   | Automatic via `haltSystem()` |
| **Testing**      | Need to mock server       | Test app directly                 |
| **Dependencies** | Implicit (global imports) | Explicit (resource dependencies)  |
| **Composition**  | Hard to add resources     | Easy (just add to config)         |

---

## ➡️ **Next Steps**

**Next Recipe:** Database (Standalone) - Prisma client with connection management _(Coming Soon)_

**Try:**

- Add authentication middleware
- Add error handling
- Test the app without starting the server
- Add WebSocket support (separate resource)

---

**Questions? Check the [runnable example](/examples/cookbook-03-express-standalone)** 📦

---

## 💡 **Preview: What's Next**

In the next recipes, we'll:

1. Add a **database resource** (Prisma)
2. Make the **server depend on config** (for the port)
3. Make the **database depend on config** (for the connection URL)
4. Compose them all together

The pattern stays the same - just add more resources and declare dependencies. **Complexity doesn't compound, it composes.** 🧶
