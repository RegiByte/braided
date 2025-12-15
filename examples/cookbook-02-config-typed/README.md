# Recipe 2: Config (Typed)

Add Zod validation for type-safe, validated configuration.

## 📖 Full Recipe

See the [full recipe documentation](../../cookbook/02-config-typed.md) for detailed explanations.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Create .env file
cp env.example .env

# Edit .env with your values (optional)
# nano .env

# Run it
npm start
```

## 📝 What You'll See (Success)

```
📝 Loading configuration...
✅ Configuration loaded and validated: {
  PORT: 8080,
  NODE_ENV: 'production',
  LOG_LEVEL: 'debug',
  API_KEY: 'my-secret-api-key-12345'
}
🚀 System started!
```

## 🧪 Test Validation Errors

Remove the API_KEY from .env and run again:

```bash
echo "PORT=8080" > .env
echo "NODE_ENV=production" >> .env
npm start
```

You'll see:

```
📝 Loading configuration...
❌ Invalid configuration:
{
  API_KEY: { _errors: [ 'API_KEY is required' ] }
}
❌ System failed to start:
  - config: Configuration validation failed
```

## 🎓 What This Demonstrates

- Zod schema validation
- Type inference from schemas
- Fail-fast on invalid config
- Clear error messages
- Production-ready config handling

## ➡️ Next Recipe

[Recipe 3: Express (Standalone)](../cookbook-03-express-standalone) - HTTP server resource

