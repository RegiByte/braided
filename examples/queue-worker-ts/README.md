# ⚙️ Queue Worker Example (TypeScript)

A BullMQ worker demonstrating Braided's job processing capabilities with **full type safety**, Redis integration, and graceful shutdown that completes active jobs.

## What You'll Learn

- Managing external dependencies (Redis) with type safety
- Job queue processing with guaranteed completion
- Graceful shutdown that waits for active jobs
- Complex multi-resource coordination with full type inference

## Prerequisites

Docker is required to run Redis:

```bash
npm run docker:up
```

## Quick Start

```bash
npm install
npm start
```

Watch as jobs are created and processed. Press `Ctrl+C` to see graceful shutdown wait for active jobs to complete.

## System Structure

```
config → redis → queue → worker → jobProducer
                    ↓
                  worker (also depends on redis)
```

**Startup**: Config loads → Redis connects → Queue created → Worker starts → Job producer begins  
**Shutdown**: Job producer stops → Worker completes active jobs → Queue closes → Redis disconnects → Config disposed

## Type Safety Highlights

Notice how all types flow through the system:

```typescript
const workerResource = defineResource({
  dependencies: ["config", "redis", "queue"] as const,
  start: async ({
    config,
    redis,
    queue: _, // not used, but dependency is required for correct startup order
  }: {
    config: StartedResource<typeof configResource>;
    redis: StartedResource<typeof redisResource>;
    queue: StartedResource<typeof queueResource>;
  }) => {
    // 'config', 'redis', and 'queue' are all fully typed!
    // TypeScript knows config.worker.concurrency exists
    // TypeScript knows redis has all ioredis methods

    const processJob = async (job: Job) => {
      const duration = job.data.duration || 1000;
      // ✅ Full autocomplete on job properties
      await new Promise((resolve) => setTimeout(resolve, duration));
      return { success: true, processedAt: new Date().toISOString() };
    };

    const worker = new Worker(config.queue.name, processJob, {
      connection: redis,
      concurrency: config.worker.concurrency, // ✅ Typed!
    });

    return {
      worker,
      stats: { processed: 0, failed: 0, active: 0 },
      getStats: () => ({ ...stats }),
    };
  },
  halt: async (workerResource) => {
    // 'workerResource' is typed as the return value from start()
    // TypeScript knows about worker, stats, and getStats()
    await workerResource.worker.close();
  },
});
```

## Features Demonstrated

### 1. Job Processing

- Creates 10 demo jobs with different types
- Processes 2 jobs concurrently
- Simulates work with delays
- Demonstrates retry logic (job #3 fails once)

### 2. Graceful Shutdown

```
🛑 Received SIGINT, initiating graceful shutdown...
⏳ Waiting for active jobs to complete...

📊 Final Stats:
   - Jobs created: 10
   - Jobs processed: 9
   - Jobs failed: 0
   - Jobs active: 1

👷 Stopping worker...
   📊 Final stats: 9 processed, 0 failed
🔨 Processing job 10: generate-report
✅ Job 10 completed successfully
👷 Worker stopped (all active jobs completed)
📬 Closing queue...
📬 Queue closed
🔴 Disconnecting from Redis...
🔴 Redis disconnected
📋 Config disposed

✅ System halted successfully. All jobs completed! 👋
```

### 3. Job Types

- `send-email`: 1.5s processing time
- `process-image`: 2s processing time
- `generate-report`: 3s processing time
- `sync-data`: 1s processing time

## Key Code

```typescript
const systemConfig = {
  config: configResource,
  redis: redisResource,
  queue: queueResource,
  worker: workerResource,
  jobProducer: jobProducerResource,
};

const { system } = await startSystem(systemConfig);
// Full type inference for all resources!
// system.config.redis.host ✅
// system.worker.getStats() ✅
// system.jobProducer.getJobsCreated() ✅
```

## Monitoring Jobs

```bash
# Redis CLI
docker exec -it braided-queue-redis-ts redis-cli

# View all keys
> KEYS *

# Check waiting jobs
> LLEN bull:example-queue:wait

# Check active jobs
> LLEN bull:example-queue:active

# Check completed jobs
> LLEN bull:example-queue:completed
```

## Cleanup

```bash
npm run docker:down
```

## Comparison with JavaScript Version

The [JavaScript version](../queue-worker) has identical functionality. This TypeScript version adds:

- ✅ Type-safe job data structures
- ✅ Autocomplete for all configuration options
- ✅ Compile-time safety for Redis operations
- ✅ Type inference for job processor functions

## Next Steps

- **Want swappable implementations?** → Study [Cache Swapping TS](../cache-swapping-ts) - the killer feature!
- **Need simpler examples?** → Start with [HTTP Server TS](../http-server-ts)

---

**Built with Braided** 🧶 **+ TypeScript** 💙
