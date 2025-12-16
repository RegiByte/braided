# Braided Cookbook

Progressive recipes for building production systems with Braided.

Each recipe is self-contained and runnable. Start from the beginning and work through sequentially - each recipe builds on concepts from previous ones.

## Recipes

### Part 1: Foundation

Learn the basics by building individual resources.

1. [Config (Raw)](./01-config-raw.md) - Load environment variables into a config object
2. [Config (Typed)](./02-config-typed.md) - Add Zod validation for type-safe configuration
3. [Express (Standalone)](./03-express-standalone.md) - HTTP server with graceful shutdown
4. [Database (Prisma)](./04-database-prisma.md) - Database connection with lifecycle management
5. [Full-Stack Composition](./05-full-stack.md) - Compose config, database, API, and HTTP server

### Part 2: Advanced Patterns

Coming soon.

6. WebSocket Server - Real-time communication with connection management
7. Queue Worker - Background job processing with Redis
8. Cache Layer - Redis caching with fallback patterns
9. Testing Strategies - Mocking resources and integration testing
10. Production Deployment - Health checks, monitoring, and graceful shutdown

## How to Use This Cookbook

**Read sequentially.** Start with Recipe 1 and work through in order. Each recipe assumes knowledge from previous ones.

**Run the examples.** Each recipe has a corresponding runnable example in `/examples` that you can clone and execute.

**Experiment.** Modify the examples as you run them. Copy it into your projects and modify it to fit your needs.

## What You'll Learn

- Structuring resources with clear lifecycles
- Composing resources with explicit dependencies
- Achieving graceful shutdown in complex systems
- Testing systems by swapping resource implementations
- Building production-ready applications with automatic dependency resolution

## Core Concepts

These recipes demonstrate key principles:

- Resources are independent of your framework
- Dependencies are explicit, not discovered through imports
- Complex systems emerge from simple composition
- Testing is straightforward when resources are swappable

---

Begin with [Recipe 1: Config (Raw)](./01-config-raw.md)
