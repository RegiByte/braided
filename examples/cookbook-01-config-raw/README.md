# Recipe 1: Config (Raw)

Load environment variables into a simple config resource.

## 📖 Full Recipe

See the [full recipe documentation](../../cookbook/01-config-raw.md) for detailed explanations.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your values (optional)
# nano .env

# Run it
npm start
```

## 📝 What You'll See

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

## 🎓 What This Demonstrates

- Creating a basic Braided resource
- Loading environment variables
- Resource lifecycle (startup/shutdown)
- Graceful shutdown handling

## ➡️ Next Recipe

[Recipe 2: Config (Typed)](../cookbook-02-config-typed/README.md) - Add Zod validation

