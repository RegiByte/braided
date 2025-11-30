# 🌐 HTTP Server Example (TypeScript)

A basic Express HTTP server demonstrating Braided's core concepts with **full type safety**: resource dependencies, lifecycle management, and graceful shutdown.

## What You'll Learn

- How to define resources with dependencies in TypeScript
- Automatic startup/shutdown ordering with type inference
- Graceful shutdown with SIGTERM/SIGINT
- **Type-safe dependency injection** - no manual type annotations needed!

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

## Type Safety Highlights

Notice how TypeScript infers all types automatically:

```typescript
const router = defineResource({
  dependencies: ["config"] as const,
  start: ({ config }: { config: StartedResource<typeof configResource> }) => {
    // 'config' is fully typed here! 
    // TypeScript knows it has 'port' and 'greetingMessage'
    const router = new Router();
    router.get("/", (req, res) => {
      res.send(config.greetingMessage); // ✅ Autocomplete works!
    });
    return router;
  },
  halt: () => {},
});
```

The `as const` on dependencies enables TypeScript to infer the exact dependency keys from the system configuration.

## Key Code

```typescript
const systemConfig = {
  config: configResource,    // No dependencies
  router,                    // Depends on config
  httpServer,                // Depends on router + config
};

const { system } = await startSystem(systemConfig);
// 'system' is fully typed! system.config, system.router, system.httpServer
// all have their correct types inferred automatically

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

## Comparison with JavaScript Version

The [JavaScript version](../http-server) has identical functionality but without type safety. This TypeScript version demonstrates that Braided's composition model preserves full type inference throughout the dependency chain.

## Next Steps

- **More complex?** → Check out [WebSocket Server TS](../websocket-server-ts)
- **Need queues?** → See [Queue Worker TS](../queue-worker-ts)
- **Testing?** → Study [Cache Swapping TS](../cache-swapping-ts) - the killer feature!

---

**Built with Braided** 🧶 **+ TypeScript** 💙

