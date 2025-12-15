# Recipe 2: Config (Typed)

**Add Zod validation for type-safe, validated configuration.**

---

## 🎯 **What You'll Learn**

- How to validate config with Zod schemas
- How to handle startup errors gracefully
- How to ensure your config is well-formed before the system starts
- Why validation at the resource level is powerful

---

## 📦 **Prerequisites**

- Node.js 18+
- Completed [Recipe 1: Config (Raw)](./01-config-raw.md)

---

## 🧑‍🍳 **The Recipe**

### **What We're Building**

An improved config resource that:

1. Defines a Zod schema for the config shape
2. Validates environment variables at startup
3. Fails fast if config is invalid
4. Provides full TypeScript type safety

### **Why This Matters**

In Recipe 1, we had to manually extract and provide defaults. Problems:

- ❌ Typos in env var names go unnoticed
- ❌ Invalid values (e.g., `PORT=abc`) aren't caught
- ❌ Missing required values use defaults silently
- ❌ No runtime validation

With Zod validation:

- ✅ Schema defines the contract
- ✅ Invalid config fails at startup (not at runtime)
- ✅ TypeScript types are inferred automatically
- ✅ Clear error messages

---

## 📝 **The Code**

### **File: `config.ts`**

```typescript
import { defineResource } from "braided";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Error formatting utility
type InvalidValueIssue = z.core.$ZodIssueInvalidValue;

const enumErrorFormatter = (issue: InvalidValueIssue) => {
  const path = issue.path.join(".");
  const acceptedValues = issue.values
    .map((s) => `"${s as string}"`)
    .join(" | ");
  const receivedValue = issue.input;
  return `Invalid ${path}: "${receivedValue}" must be one of ${acceptedValues}`;
};

// Define the schema
const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"], {
      error: (issue) => enumErrorFormatter(issue as InvalidValueIssue),
    })
    .default("development"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"], {
      error: (issue) => enumErrorFormatter(issue as InvalidValueIssue),
    })
    .default("info"),
  API_KEY: z.string().min(1, "API_KEY is required"),
});

export const configResource = defineResource({
  start: async () => {
    console.log("📝 Loading configuration...");

    // Load .env file
    loadEnv();

    // Parse and validate
    const result = configSchema.safeParse({
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      API_KEY: process.env.API_KEY,
    });

    if (!result.success) {
      console.error(z.prettifyError(result.error));
      throw new Error("Configuration validation failed");
    }

    const config = result.data;
    console.log("✅ Configuration loaded and validated:", config);

    return config;
  },

  halt: async (config) => {
    console.log("👋 Config shutdown");
  },
});
```

### **File: `.env`**

```bash
PORT=8080
NODE_ENV=production
LOG_LEVEL=debug
API_KEY=my-secret-api-key-12345
```

### **File: `system.ts`**

```typescript
import { startSystem, haltSystem } from "braided";
import { configResource } from "./config.js";

const systemConfig = {
  config: configResource,
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
console.log("Config:", system.config);

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
  "name": "recipe-02-config-typed",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node system.js"
  },
  "dependencies": {
    "braided": "^0.2.0",
    "dotenv": "^16.3.1",
    "zod": "^4.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0"
  }
}
```

---

## 🚀 **Running It**

### **Success Case**

```bash
# Install dependencies
npm install

# Create valid .env
echo "PORT=8080" > .env
echo "NODE_ENV=production" >> .env
echo "LOG_LEVEL=debug" >> .env
echo "API_KEY=my-secret-key" >> .env

# Run it
npm start
```

**Expected Output:**

```
📝 Loading configuration...
✅ Configuration loaded and validated: {
  PORT: 8080,
  NODE_ENV: 'production',
  LOG_LEVEL: 'debug',
  API_KEY: 'my-secret-key'
}
🚀 System started!
```

### **Failure Case: Missing Required Value**

Comment out API_KEY in .env like
```
#API_KEY=my-secret-api-key-12345
```

Then run it again:

```bash
npm start
```

**Expected Output:**

```
📝 Loading configuration...
✖ Invalid input: expected string, received undefined
  → at API_KEY
❌ System failed to start:
  - config: Configuration validation failed
```

**The system refuses to start with invalid config!** ✅

### **Failure Case: Invalid Value**

```bash
# Invalid NODE_ENV
echo "PORT=8080" > .env
echo "NODE_ENV=staging" >> .env
echo "API_KEY=test" >> .env

npm start
```

**Expected Output:**

```
📝 Loading configuration...
✖ Invalid NODE_ENV: "staging" must be one of "development" | "production" | "test"
  → at NODE_ENV
❌ System failed to start:
  - config: Configuration validation failed
```

---

## 🔍 **What's Happening**

### **1. Schema Definition**

```typescript

// Error formatting utility
const enumErrorFormatter = (issue) => {
  // ommited for brevity
};

// Define the schema
const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"], {
      error: enumErrorFormatter,
    })
    .default("development"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"], {
      error: enumErrorFormatter,
    })
    .default("info"),
  API_KEY: z.string().min(1, "API_KEY is required"),
});
```

**What each line does:**

- `z.coerce.number()` - Converts string to number (env vars are always strings)
- `.int().positive()` - Must be a positive integer
- `.default(3000)` - Use 3000 if not provided
- `z.enum([...])` - Must be one of these exact values
- `z.string().min(1)` - Must be a non-empty string

### **2. Type Inference**

```typescript
export type Config = z.infer<typeof configSchema>;
```

TypeScript automatically infers:

```typescript
type Config = {
  PORT: number; // Inferred from z.coerce.number()
  NODE_ENV: "development" | "production" | "test"; // Inferred from z.enum()
  LOG_LEVEL: "debug" | "info" | "warn" | "error"; // Inferred from z.enum()
  API_KEY: string;
};
```

**No manual type definitions needed!** The schema is the source of truth.

### **3. Safe Parsing**

```typescript
const result = configSchema.safeParse({
  /* ... */
});

if (!result.success) {
  console.error(z.prettifyError(result.error));
  throw new Error("Configuration validation failed");
}

const config = result.data;
```

`safeParse()` returns a discriminated union:

- **Success:** `{ success: true, data: Config }`
- **Failure:** `{ success: false, error: ZodError }`

This lets us handle errors gracefully and provide clear messages.

### **4. Fail Fast**

```typescript
if (errors.size > 0) {
  console.error("❌ System failed to start:");
  process.exit(1);
}
```

If config validation fails:

1. `start()` throws an error
2. `startSystem()` catches it and adds to `errors` map
3. We check `errors.size` and exit before using the system

**The system never runs with invalid config.** ✅

---

## 🧪 **Try It Yourself**

### **Experiment 1: Add a URL Validation**

```typescript
const configSchema = z.object({
  // ... existing fields
  DATABASE_URL: z.string().url("Must be a valid URL"),
});
```

Add to `.env`:

```bash
DATABASE_URL=postgresql://localhost:5432/mydb
```

Check that it works with the valid URL
And then check that it fails with an invalid URL (or missing URL)

### **Experiment 2: Add Optional Fields**

```typescript
const configSchema = z.object({
  // ... existing fields
  REDIS_URL: z.string().url().optional(),
  MAX_CONNECTIONS: z.coerce.number().int().positive().optional(),
});
```

Optional fields don't need to be in `.env`.

### **Experiment 3: Custom Validation**

```typescript
const configSchema = z.object({
  // ... existing fields
  PORT: z.coerce
    .number()
    .int()
    .refine(
      (port) => port >= 1024 && port <= 65535,
      "PORT must be between 1024 and 65535"
    ),
});
```

### **Experiment 4: Transform Values**

```typescript
const configSchema = z.object({
  // ... existing fields
  ALLOWED_ORIGINS: z
    .string()
    .transform((str) => str.split(",").map((s) => s.trim()))
    .default("http://localhost:3000"),
});
```

`.env`:

```bash
ALLOWED_ORIGINS=http://localhost:3000,https://example.com,https://app.example.com
```

Result:

```typescript
config.ALLOWED_ORIGINS; // ['http://localhost:3000', 'https://example.com', 'https://app.example.com']
```

---

## 🎓 **Key Takeaways**

1. **Validate at startup** - Fail fast before the system runs
2. **Schema is source of truth** - Types are inferred, no duplication
3. **Clear error messages** - Zod provides detailed validation errors
4. **Defaults are explicit** - No silent fallbacks, everything is declared
5. **Resource-level validation** - Each resource validates its own needs

---

## 🔄 **Comparison: Recipe 1 vs Recipe 2**

| Aspect              | Recipe 1 (Raw)          | Recipe 2 (Typed)     |
| ------------------- | ----------------------- | -------------------- |
| **Type Safety**     | Manual types            | Inferred from schema |
| **Validation**      | None                    | Full validation      |
| **Defaults**        | Inline `\|\|` operators | Declared in schema   |
| **Error Handling**  | Silent failures         | Explicit errors      |
| **Maintainability** | Update types + code     | Update schema only   |

**Recipe 2 is production-ready.** Recipe 1 was for learning.

---

## ➡️ **Next Steps**

**Next Recipe:** [Express (Standalone)](./03-express-standalone.md) - HTTP server resource

**Try:**

- Add more validation rules (URLs, emails, numbers)
- Add optional fields
- Create custom validation logic
- Test with invalid config

---

**Questions? Check the [runnable example](/examples/cookbook-02-config-typed)** 📦
