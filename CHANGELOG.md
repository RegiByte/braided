# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - TBD

### Added

**System Topology Visualization** 🎉

A powerful new feature for visualizing and understanding your system's dependency structure!

- **`topology` field in `SystemStartResult`** - Automatically included when starting a system
- **`buildTopology()`** - Build topology from resources (also used internally)
- **`formatTopology()`** - Human-readable console output
- **`toMermaid()`** - Generate Mermaid diagrams for markdown
- **`toDot()`** - Generate GraphViz DOT format for rendering
- **`toJSON()`** - Export as JSON for custom visualizations

**Features:**
- 📊 Dependency layers organized by depth (0 = no dependencies)
- 🔍 Forward and reverse adjacency lists (dependencies & dependents)
- 📈 Startup and shutdown order
- 🎯 Zero runtime overhead (computed once during startup)
- 🧪 13 comprehensive tests

**Example:**

```typescript
const { system, errors, topology } = await startSystem(config);

console.log(formatTopology(topology));
// 🧶 System Topology (5 resources, max depth: 3)
//
// Layer 0:
//   • config (no dependencies) → [database, cache]
//
// Layer 1:
//   • database ← [config] → [api]
//   • cache ← [config] → [api]
// ...

// Generate Mermaid diagram
console.log(toMermaid(topology));
// graph TD
//   config --> database
//   config --> cache
//   ...

// Export as JSON
const json = toJSON(topology);
fs.writeFileSync('topology.json', JSON.stringify(json, null, 2));
```

**Use Cases:**
- 🐛 Debug complex dependency chains
- 📖 Auto-generate architecture documentation
- 🎨 Create visual system diagrams
- 🧪 Validate system structure in tests
- 📊 Analyze system complexity

See `examples/topology-visualization.ts` for a complete example!

---

## [0.1.0] - 2024-12-14

### Changed

**BREAKING CHANGES**: This release improves type inference but requires migration for existing code.

#### Improved Type Inference System

The type system has been redesigned to automatically infer types from function signatures, eliminating the need for manual type parameters. This follows the same philosophy as the Emergent library.

**Key Changes:**

1. **`ResourceConfig<TStart>`** - Now takes a single type parameter (the start function type) instead of `<TDeps, T>`
2. **Automatic dependency inference** - Dependencies are inferred from the `start` function's parameter type
3. **Automatic resource inference** - Resource type is inferred from the `start` function's return type
4. **`Expand<T>` utility** - Forces TypeScript to show full type definitions in hover tooltips
5. **Better defaults** - Uses `Record<string, unknown>` instead of `any` for unknown dependencies

**Before (v0.0.4):**

```typescript
const loggerResource = defineResource<
  { counter: StartedResource<typeof counterResource> },
  Logger
>({
  dependencies: ['counter'],
  start: ({ counter }) => new Logger(counter),
  halt: (logger) => logger.close()
})
```

**After (v0.1.0):**

```typescript
const loggerResource = defineResource({
  dependencies: ['counter'],
  start: ({ counter }: { counter: StartedResource<typeof counterResource> }) => {
    return new Logger(counter)
  },
  halt: (logger) => logger.close() // logger type inferred automatically!
})
```

**Migration Guide:**

1. Remove type parameters from `defineResource<TDeps, T>()` calls
2. Add type annotations to the `start` function's parameter instead
3. The `halt` function's parameter type will be inferred automatically

**Benefits:**

- ✅ Less boilerplate - no manual type parameters
- ✅ Better type inference - TypeScript does the work
- ✅ Clearer hover tooltips - `Expand<T>` shows full type definitions
- ✅ Type safety - `Record<string, unknown>` instead of `any`
- ✅ Consistent with Emergent's type system

### Added

- Added comprehensive type tests (`src/test/types.spec.ts`) to ensure type inference works correctly
- Added `Expand<T>` utility type for better IDE tooltips (borrowed from Emergent)
- Added inline documentation examples showing the new pattern

### Internal

- `StartedResource<T>` now uses `Expand` to show full type definitions
- `StartedSystem<T>` simplified to use `StartedResource` helper
- All internal types updated to use the new inference system

---

## [0.0.4] - 2024-12-XX

### Added

- Initial stable release
- Core resource management with topological sorting
- Dependency-aware lifecycle management
- Graceful degradation on resource failures
- Comprehensive test coverage
- 8 production-ready examples (JavaScript + TypeScript)

### Features

- `defineResource()` - Define resources with lifecycle
- `startSystem()` - Start resources in dependency order
- `haltSystem()` - Halt resources in reverse order
- `StartedResource<T>` - Extract resource type from config
- Full TypeScript support with type inference

---

## Migration from v0.0.4 to v0.1.0

### Step 1: Update type parameters

**Old:**
```typescript
const resource = defineResource<{ db: Database }, API>({
  dependencies: ['db'],
  start: ({ db }) => new API(db),
  halt: (api) => api.close()
})
```

**New:**
```typescript
const resource = defineResource({
  dependencies: ['db'],
  start: ({ db }: { db: Database }) => new API(db),
  halt: (api) => api.close() // Type inferred!
})
```

### Step 2: Use StartedResource for dependency types

**Recommended pattern:**

```typescript
// Define base resource
const dbResource = defineResource({
  start: () => new Database(),
  halt: (db) => db.close()
})

// Use StartedResource to get the type
const apiResource = defineResource({
  dependencies: ['database'],
  start: ({ database }: { database: StartedResource<typeof dbResource> }) => {
    return new API(database)
  },
  halt: (api) => api.close()
})
```

### Step 3: Enjoy better type inference!

The `halt` function's parameter is now automatically typed based on what `start` returns. No more manual type annotations needed!

---

## Philosophy

This change aligns Braided with the philosophy of the Emergent library:

> "Everything is information processing. Simple rules compose. Emergence is reliable. No central governor needed."

By inferring types from function signatures, we let TypeScript do the work while keeping the API minimal and composable. The type system emerges from the structure of your code, not from manual annotations.

---

## Questions or Issues?

If you encounter any issues during migration, please:

1. Check the examples in the `examples/` directory (all updated to v0.1.0)
2. Review the type tests in `src/test/types.spec.ts`
3. Open an issue on GitHub: https://github.com/RegiByte/braided/issues

---

**The Z-axis was always there. We just needed to see it first.** 🧶

