const { defineResource, startSystem, haltSystem } = require("braided");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

/**
 * Configuration Resource
 * Loads configuration from environment or defaults
 */
const configResource = defineResource({
  start: () => {
    return {
      port: process.env.PORT || 3000,
      corsOrigin: process.env.CORS_ORIGIN || "*",
      shutdownTimeout: 5000, // ms to wait for graceful shutdown
    };
  },
  halt: async () => {
    console.log("📋 Config disposed");
  },
});

/**
 * HTTP Server Resource
 * Creates an Express app with a simple HTML client
 */
const httpServerResource = defineResource({
  dependencies: ["config"],
  start: ({ config }) => {
    const app = express();
    const httpServer = createServer(app);

    // Serve a simple HTML client for testing
    app.get("/", (req, res) => {
      res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Braided WebSocket Example</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin-top: 0; }
    .status {
      padding: 10px;
      border-radius: 5px;
      margin: 15px 0;
      font-weight: bold;
    }
    .connected { background: #d4edda; color: #155724; }
    .disconnected { background: #f8d7da; color: #721c24; }
    input, button {
      padding: 10px;
      font-size: 16px;
      border-radius: 5px;
      border: 1px solid #ddd;
    }
    button {
      background: #007bff;
      color: white;
      border: none;
      cursor: pointer;
      margin-left: 10px;
    }
    button:hover { background: #0056b3; }
    #messages {
      margin-top: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 5px;
      min-height: 200px;
      max-height: 400px;
      overflow-y: auto;
    }
    .message {
      padding: 8px;
      margin: 5px 0;
      border-radius: 3px;
      background: white;
      border-left: 3px solid #007bff;
    }
    .system-message {
      border-left-color: #6c757d;
      font-style: italic;
      color: #6c757d;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧶 Braided WebSocket Example</h1>
    <div id="status" class="status disconnected">Disconnected</div>
    
    <div>
      <input type="text" id="messageInput" placeholder="Type a message..." />
      <button onclick="sendMessage()">Send</button>
    </div>

    <div id="messages"></div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    const statusEl = document.getElementById('status');
    const messagesEl = document.getElementById('messages');
    const messageInput = document.getElementById('messageInput');

    socket.on('connect', () => {
      statusEl.textContent = 'Connected ✓';
      statusEl.className = 'status connected';
      addMessage('Connected to server', true);
    });

    socket.on('disconnect', () => {
      statusEl.textContent = 'Disconnected ✗';
      statusEl.className = 'status disconnected';
      addMessage('Disconnected from server', true);
    });

    socket.on('message', (data) => {
      addMessage(data.text);
    });

    socket.on('broadcast', (data) => {
      addMessage(\`📢 \${data.text}\`, true);
    });

    socket.on('user-count', (count) => {
      addMessage(\`👥 \${count} user(s) online\`, true);
    });

    function sendMessage() {
      const text = messageInput.value.trim();
      if (text) {
        socket.emit('message', { text });
        messageInput.value = '';
      }
    }

    function addMessage(text, isSystem = false) {
      const div = document.createElement('div');
      div.className = isSystem ? 'message system-message' : 'message';
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>
      `);
    });

    return new Promise((resolve) => {
      httpServer.listen(config.port, () => {
        console.log(`🌐 HTTP Server listening on port ${config.port}`);
        resolve(httpServer);
      });
    });
  },
  halt: async (httpServer) => {
    return new Promise((resolve) => {
      console.log("🌐 Closing HTTP server...");
      httpServer.close(() => {
        console.log("🌐 HTTP server closed");
        resolve();
      });
    });
  },
});

/**
 * Socket.IO Server Resource
 * Manages the WebSocket server instance
 */
const socketServerResource = defineResource({
  dependencies: ["config", "httpServer"],
  start: ({ config, httpServer }) => {
    const io = new Server(httpServer, {
      cors: {
        origin: config.corsOrigin,
        methods: ["GET", "POST"],
      },
    });

    console.log("🔌 Socket.IO server initialized");
    return io;
  },
  halt: async (io) => {
    return new Promise((resolve) => {
      console.log("🔌 Closing Socket.IO server...");
      io.close(() => {
        console.log("🔌 Socket.IO server closed");
        resolve();
      });
    });
  },
});

/**
 * Connection Manager Resource
 * Tracks active connections and handles graceful disconnection
 */
const connectionManagerResource = defineResource({
  dependencies: ["socketServer"],
  start: ({ socketServer }) => {
    const connections = new Map();

    socketServer.on("connection", (socket) => {
      const connectionId = socket.id;
      connections.set(connectionId, {
        socket,
        connectedAt: new Date(),
      });

      console.log(
        `✅ Client connected: ${connectionId} (total: ${connections.size})`
      );

      // Broadcast user count to all clients
      socketServer.emit("user-count", connections.size);

      socket.on("disconnect", () => {
        const connectionsCount = connections.size;
        connections.delete(connectionId);
        console.log(
          `❌ Client disconnected: ${connectionId} (total: ${connectionsCount})`
        );
        socketServer.emit("user-count", connectionsCount);
      });
    });

    return {
      connections,
      getConnectionCount: () => connections.size,
      disconnectAll: async () => {
        console.log(
          `🔌 Disconnecting ${connections.size} active connection(s)...`
        );

        // Notify clients about shutdown
        socketServer.emit("broadcast", {
          text: "Server is shutting down gracefully...",
        });

        // Give clients a moment to receive the message
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Disconnect all clients
        for (const [id, { socket }] of connections) {
          socket.disconnect(true);
        }

        connections.clear();
        console.log("🔌 All connections closed");
      },
    };
  },
  halt: async (manager) => {
    await manager.disconnectAll();
    console.log("👥 Connection manager disposed");
  },
});

/**
 * Message Handler Resource
 * Handles business logic for incoming messages
 */
const messageHandlerResource = defineResource({
  dependencies: ["socketServer", "connectionManager"],
  start: ({ socketServer, connectionManager }) => {
    const messageCount = { total: 0 };

    socketServer.on("connection", (socket) => {
      // Send welcome message
      socket.emit("message", {
        text: `Welcome! You are user #${connectionManager.getConnectionCount()}`,
      });

      // Handle incoming messages
      socket.on("message", (data) => {
        messageCount.total++;
        console.log(`📨 Message received from ${socket.id}: ${data.text}`);

        // Echo back to sender
        socket.emit("message", {
          text: `You said: ${data.text}`,
        });

        // Broadcast to others
        socket.broadcast.emit("broadcast", {
          text: `Someone said: ${data.text}`,
        });
      });
    });

    return {
      messageCount,
      getStats: () => ({
        totalMessages: messageCount.total,
        activeConnections: connectionManager.getConnectionCount(),
      }),
    };
  },
  halt: async (handler) => {
    console.log(
      `📨 Message handler disposed (processed ${handler.messageCount.total} messages)`
    );
  },
});

/**
 * System Configuration
 * Defines the complete system topology
 */
const systemConfig = {
  config: configResource,
  httpServer: httpServerResource,
  socketServer: socketServerResource,
  connectionManager: connectionManagerResource,
  messageHandler: messageHandlerResource,
};

/**
 * System Startup
 */
async function main() {
  console.log("🧶 Starting Braided WebSocket System...\n");

  const { system, errors } = await startSystem(systemConfig);

  if (errors.size > 0) {
    console.error("❌ Errors starting system:", errors);
    process.exit(1);
  }

  console.log(`\n✨ System started successfully!`);
  console.log(`📍 Open http://localhost:${system.config.port} in your browser`);
  console.log(`💡 Open multiple tabs to see real-time communication`);
  console.log(`\n📖 Or test with curl:`);
  console.log(`   curl http://localhost:${system.config.port}/health`);
  console.log(`\n🛑 Press Ctrl+C to trigger graceful shutdown\n`);

  // Graceful shutdown handler
  let isShuttingDown = false;
  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log(`\n\n🛑 Received ${signal}, initiating graceful shutdown...\n`);

    const stats = system.messageHandler.getStats();
    console.log("📊 Final Stats:");
    console.log(`   - Messages processed: ${stats.totalMessages}`);
    console.log(`   - Active connections: ${stats.activeConnections}\n`);

    const { errors: haltErrors } = await haltSystem(systemConfig, system);

    if (haltErrors.size > 0) {
      console.error("\n❌ Errors during shutdown:", haltErrors);
      process.exit(1);
    }

    console.log("\n✅ System halted successfully. Goodbye! 👋\n");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
