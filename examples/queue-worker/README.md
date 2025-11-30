# 📬 Queue Worker Example

BullMQ queue worker with Redis demonstrating graceful job processing and shutdown with Braided.

## What You'll Learn

- Redis connection management
- Job processing with automatic retries
- Workers complete active jobs before shutdown
- External service dependencies

## Quick Start

```bash
npm run docker:up  # Start Redis
npm install
npm start
```

Watch jobs being processed, then press `Ctrl+C` to see active jobs complete before shutdown.

## System Structure

```
config → redis → queue → worker → jobProducer
```

**Shutdown order** (reverse): Stop creating jobs → Workers finish active jobs → Queue closes → Redis disconnects

## What Happens on Shutdown

```
🛑 Received SIGINT, initiating graceful shutdown...
⏳ Waiting for active jobs to complete...

📊 Final Stats:
   - Jobs created: 7
   - Jobs processed: 5
   - Jobs active: 2

🔨 Processing job 6: process-image
✅ Job 6 completed successfully
👷 Worker stopped (all active jobs completed)
✅ System halted successfully. All jobs completed! 👋
```

**No lost work!** Workers finish processing before shutdown.

## Key Features

### Graceful Job Completion

```javascript
const workerResource = defineResource({
  dependencies: ["redis", "queue"],
  halt: async (workerResource) => {
    // This waits for active jobs to complete!
    await workerResource.worker.close();
  },
});
```

### Automatic Retries

Jobs retry on failure with exponential backoff:

```javascript
defaultJobOptions: {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
}
```

## Configuration

```javascript
const config = {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: 6379,
  },
  worker: {
    concurrency: 2, // Jobs processed simultaneously
  },
};
```

## Monitoring

**Redis Commander**: http://localhost:8081

**Redis CLI** (copy-paste ready):
```bash
docker exec -it braided-queue-redis redis-cli

# View all keys
KEYS *

# Check queue length
LLEN bull:example-queue:wait
```

## Testing Without Redis

Swap Redis with a mock for testing:

```javascript
const mockRedisResource = defineResource({
  start: () => new MockRedis(), // Use ioredis-mock
  halt: () => {},
});

const testSystem = {
  redis: mockRedisResource, // Swap!
  queue: queueResource,
  worker: workerResource,
};
```

## Production Considerations

1. Remove `jobProducer` (demo only)
2. Add health checks
3. Add logging and metrics
4. Scale workers horizontally
5. Configure Redis persistence
6. Alert on repeated failures

## Cleanup

```bash
npm run docker:down
```

## Next Steps

- **Swappable implementations?** → [Cache Swapping](../cache-swapping)
- **Connection management?** → [WebSocket Server](../websocket-server)

---

**Built with Braided** 🧶
