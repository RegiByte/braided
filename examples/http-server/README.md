# 🌐 HTTP Server Example

A basic Express HTTP server demonstrating Braided's core concepts: resource dependencies, lifecycle management, and graceful shutdown.

## What You'll Learn

- How to define resources with dependencies
- Automatic startup/shutdown ordering
- Graceful shutdown with SIGTERM/SIGINT

## Quick Start

```bash
npm install
npm start
```

Visit http://localhost:3333 or:

```bash
curl http://localhost:3333
```

Press `Ctrl+C` to see graceful shutdown in action.

## System Structure

```
config → router → httpServer
```

**Startup**: config loads → router created → HTTP server starts  
**Shutdown**: HTTP server closes → router disposed → config cleaned up

## Key Code

```javascript
const systemConfig = {
  config: configResource,    // No dependencies
  router,                    // Depends on config
  httpServer,                // Depends on router + config
};

const { system } = await startSystem(systemConfig);
// Resources start in dependency order automatically

await haltSystem(systemConfig, system);
// Resources stop in reverse order
```

## What Happens on Shutdown

```
🛑 Received SIGINT, initiating graceful shutdown...
Server closed
Disposing of config resource
System halted successfully
```

The HTTP server finishes handling in-flight requests before closing.

## Next Steps

- **More complex?** → Check out [WebSocket Server](../websocket-server)
- **Need queues?** → See [Queue Worker](../queue-worker)
- **Testing?** → Study [Cache Swapping](../cache-swapping)

---

**Built with Braided** 🧶

