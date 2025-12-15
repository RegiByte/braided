# Recipe 3: Express (Standalone)

HTTP server resource with graceful shutdown.

## 📖 Full Recipe

See the [full recipe documentation](../../cookbook/03-express-standalone.md) for detailed explanations.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

## 📝 What You'll See

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

## 🧪 Test the Endpoints

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

## 🛑 Test Graceful Shutdown

Press `Ctrl+C` in the server terminal:

```
^C
📴 Shutting down gracefully...
📴 Closing HTTP server...
✅ HTTP server closed gracefully
👋 Express app shutdown (nothing to clean up)
✅ Shutdown complete
```

## 🎓 What This Demonstrates

- Splitting Express app from HTTP server
- Resource dependencies (server depends on app)
- Graceful shutdown with connection handling
- Signal handling (SIGTERM, SIGINT)
- Production-ready server lifecycle

## 💡 Key Insight

The Express **app** (routes, middleware) is separate from the HTTP **server** (listening on a port).

This means:
- ✅ Test the app without starting the server
- ✅ Swap server implementations (HTTP vs HTTPS)
- ✅ Clear separation of concerns

## ➡️ Next Recipe

Recipe 4: Database (Standalone) - Prisma client with connection management _(Coming Soon)_

