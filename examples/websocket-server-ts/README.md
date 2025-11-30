# 🔌 WebSocket Server Example (TypeScript)

A Socket.IO server demonstrating Braided's real-time connection management with **full type safety** and coordinated graceful shutdown.

## What You'll Learn

- Managing WebSocket connections with lifecycle hooks
- Coordinated shutdown that notifies clients before disconnecting
- Complex dependency chains with type inference
- Real-time state management with type safety

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000 in **multiple browser tabs** to see real-time communication.

Press `Ctrl+C` to see graceful shutdown notify all connected clients.

## System Structure

```
config → httpServer → socketServer → connectionManager → messageHandler
```

**Startup**: Config loads → HTTP server starts → Socket.IO attaches → Connection manager initializes → Message handler registers  
**Shutdown**: Message handler stops → Connections gracefully closed → Socket.IO closes → HTTP server closes → Config disposed

## Type Safety Highlights

Notice how dependencies are fully typed through the chain:

```typescript
const messageHandlerResource = defineResource({
  dependencies: ["socketServer", "connectionManager"] as const,
  start: ({
    socketServer,
    connectionManager,
  }: {
    socketServer: StartedResource<typeof socketServerResource>;
    connectionManager: StartedResource<typeof connectionManagerResource>;
  }) => {
    // Both 'socketServer' and 'connectionManager' are fully typed!
    // TypeScript knows all their methods and properties

    socketServer.on("connection", (socket) => {
      socket.emit("message", {
        text: `Welcome! You are user #${connectionManager.getConnectionCount()}`,
        // ✅ getConnectionCount() is autocompleted!
      });
    });

    return {
      messageCount: { total: 0 },
      getStats: () => ({
        totalMessages: messageCount.total,
        activeConnections: connectionManager.getConnectionCount(),
      }),
    };
  },
  halt: async (handler) => {
    // 'handler' is typed as the return value from start()
    console.log(`Processed ${handler.messageCount.total} messages`);
  },
});
```

## Features Demonstrated

### 1. Connection Tracking

- Maintains a Map of active connections
- Broadcasts user count to all clients
- Handles disconnections automatically

### 2. Graceful Shutdown

```
🛑 Received SIGINT, initiating graceful shutdown...

📊 Final Stats:
   - Messages processed: 42
   - Active connections: 3

🔌 Disconnecting 3 active connection(s)...
🔌 All connections closed
🔌 Closing Socket.IO server...
🔌 Socket.IO server closed
🌐 Closing HTTP server...
🌐 HTTP server closed
📋 Config disposed

✅ System halted successfully. Goodbye! 👋
```

### 3. Real-time Messaging

- Echo messages back to sender
- Broadcast to other connected clients
- Welcome messages for new connections

## Key Code

```typescript
const systemConfig = {
  config: configResource,
  httpServer: httpServerResource,
  socketServer: socketServerResource,
  connectionManager: connectionManagerResource,
  messageHandler: messageHandlerResource,
};

const { system } = await startSystem(systemConfig);
// 'system' has full type inference for all resources!
// system.config.port ✅
// system.messageHandler.getStats() ✅
// system.connectionManager.getConnectionCount() ✅
```

## Testing the Server

```bash
# In your browser
open http://localhost:3000

# Open multiple tabs to see:
# - User count updates
# - Message broadcasting
# - Graceful shutdown notifications
```

## Comparison with JavaScript Version

The [JavaScript version](../websocket-server) has identical functionality. This TypeScript version adds:

- ✅ Full type inference across all resources
- ✅ Autocomplete for all dependency methods
- ✅ Compile-time safety for refactoring
- ✅ Self-documenting code through types

## Next Steps

- **Need background jobs?** → See [Queue Worker TS](../queue-worker-ts)
- **Want swappable implementations?** → Study [Cache Swapping TS](../cache-swapping-ts)

---

**Built with Braided** 🧶 **+ TypeScript** 💙
