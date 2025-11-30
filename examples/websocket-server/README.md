# 🔌 WebSocket Server Example

Real-time Socket.IO server demonstrating graceful connection management with Braided.

## What You'll Learn

- Managing stateful connections
- Notifying clients before shutdown
- Coordinated resource cleanup

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000 in multiple browser tabs, send messages, then press `Ctrl+C` to see graceful shutdown.

## System Structure

```
config → httpServer → socketServer → connectionManager → messageHandler
```

**Shutdown order** (reverse): Message handler stops → All clients notified and disconnected → Socket.IO closes → HTTP server closes

## What Happens on Shutdown

```
🛑 Received SIGINT, initiating graceful shutdown...

📊 Final Stats:
   - Messages processed: 5
   - Active connections: 3

🔌 Disconnecting 3 active connection(s)...
📢 Server is shutting down gracefully...
🔌 All connections closed
✅ System halted successfully. Goodbye! 👋
```

Clients receive a shutdown notification before being disconnected.

## Key Features

### Graceful Disconnection

```javascript
const connectionManagerResource = defineResource({
  dependencies: ["socketServer"],
  halt: async (manager) => {
    // Notify all clients
    socketServer.emit("broadcast", {
      text: "Server is shutting down...",
    });
    // Then disconnect
    await manager.disconnectAll();
  },
});
```

### Automatic Ordering

Resources start and stop in the correct order automatically based on dependencies.

## Testing It

1. Start server: `npm start`
2. Open multiple tabs to http://localhost:3000
3. Send messages between tabs
4. Press `Ctrl+C`
5. Watch all clients get notified before disconnect

## Customization Ideas

- Add authentication
- Implement rooms/channels
- Add Redis pub/sub for multi-instance
- Store message history
- Add typing indicators

## Next Steps

- **Job processing?** → [Queue Worker](../queue-worker)
- **Testing patterns?** → [Cache Swapping](../cache-swapping)

---

**Built with Braided** 🧶
