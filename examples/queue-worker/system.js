const { defineResource, startSystem, haltSystem } = require("braided");
const { Queue, Worker } = require("bullmq");
const Redis = require("ioredis");

/**
 * Configuration Resource
 * Loads configuration from environment or defaults
 */
const configResource = defineResource({
  start: () => {
    return {
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        maxRetriesPerRequest: null, // Required for BullMQ
      },
      queue: {
        name: "example-queue",
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        },
      },
      worker: {
        concurrency: 2, // Process 2 jobs at a time
      },
      demo: {
        jobCount: 10, // Number of demo jobs to create
        jobInterval: 2000, // ms between job creation
      },
    };
  },
  halt: async () => {
    console.log("📋 Config disposed");
  },
});

/**
 * Redis Connection Resource
 * Manages the Redis connection
 */
const redisResource = defineResource({
  dependencies: ["config"],
  start: async ({ config }) => {
    console.log("🔴 Connecting to Redis...");
    const redis = new Redis(config.redis);

    // Wait for connection
    await new Promise((resolve, reject) => {
      redis.on("ready", () => {
        console.log("🔴 Redis connected successfully");
        resolve();
      });
      redis.on("error", (err) => {
        console.error("🔴 Redis connection error:", err.message);
        reject(err);
      });
    });

    return redis;
  },
  halt: async (redis) => {
    console.log("🔴 Disconnecting from Redis...");
    await redis.quit();
    console.log("🔴 Redis disconnected");
  },
});

/**
 * Queue Resource
 * Creates and manages the BullMQ queue
 */
const queueResource = defineResource({
  dependencies: ["config", "redis"],
  start: async ({ config, redis }) => {
    console.log(`📬 Creating queue: ${config.queue.name}`);

    const queue = new Queue(config.queue.name, {
      connection: redis,
      defaultJobOptions: config.queue.defaultJobOptions,
    });

    // Wait for queue to be ready
    await queue.waitUntilReady();
    console.log("📬 Queue ready");

    return queue;
  },
  halt: async (queue) => {
    console.log("📬 Closing queue...");
    await queue.close();
    console.log("📬 Queue closed");
  },
});

/**
 * Worker Resource
 * Processes jobs from the queue
 */
const workerResource = defineResource({
  dependencies: ["config", "redis", "queue"],
  start: async ({ config, redis }) => {
    console.log("👷 Starting worker...");

    const stats = {
      processed: 0,
      failed: 0,
      active: 0,
    };

    // Job processor function
    const processJob = async (job) => {
      stats.active++;
      console.log(`\n🔨 Processing job ${job.id}: ${job.name}`);
      console.log(`   Data:`, job.data);

      try {
        // Simulate work based on job type
        const duration = job.data.duration || 1000;
        await new Promise((resolve) => setTimeout(resolve, duration));

        // Simulate occasional failures for demo
        if (job.data.shouldFail && job.attemptsMade === 0) {
          throw new Error("Simulated failure (will retry)");
        }

        stats.processed++;
        stats.active--;
        console.log(`✅ Job ${job.id} completed successfully`);

        return { success: true, processedAt: new Date().toISOString() };
      } catch (error) {
        stats.active--;
        stats.failed++;
        console.error(`❌ Job ${job.id} failed:`, error.message);
        throw error;
      }
    };

    const worker = new Worker(config.queue.name, processJob, {
      connection: redis,
      concurrency: config.worker.concurrency,
    });


    // Worker event listeners
    worker.on("completed", (job) => {
      console.log(
        `🎉 Job ${job.id} completed (attempt ${job.attemptsMade + 1})`
      );
    });

    worker.on("failed", (job, err) => {
      console.log(`💔 Job ${job?.id} failed: ${err.message}`);
      if (job && job.attemptsMade < job.opts.attempts) {
        console.log(
          `   🔄 Will retry (attempt ${job.attemptsMade + 1}/${
            job.opts.attempts
          })`
        );
      }
    });

    worker.on("error", (err) => {
      console.error("👷 Worker error:", err);
    });

    await worker.waitUntilReady();
    console.log(
      `👷 Worker started (concurrency: ${config.worker.concurrency})`
    );

    return {
      worker,
      stats,
      getStats: () => ({ ...stats }),
    };
  },
  halt: async (workerResource) => {
    console.log("\n👷 Stopping worker...");
    console.log(
      `   📊 Final stats: ${workerResource.stats.processed} processed, ${workerResource.stats.failed} failed`
    );

    // This will wait for active jobs to complete
    await workerResource.worker.close();
    console.log("👷 Worker stopped (all active jobs completed)");
  },
});

/**
 * Job Producer Resource (Demo)
 * Creates sample jobs for demonstration
 */
const jobProducerResource = defineResource({
  dependencies: ["config", "queue"],
  start: async ({ config, queue }) => {
    console.log("🏭 Starting job producer (demo mode)...");

    let jobsCreated = 0;
    const maxJobs = config.demo.jobCount;
    let producerInterval = null;

    const createJob = async () => {
      if (jobsCreated >= maxJobs) {
        console.log(`\n🏭 Finished creating ${maxJobs} demo jobs`);
        if (producerInterval) {
          clearInterval(producerInterval);
          producerInterval = null;
        }
        return;
      }

      jobsCreated++;
      const jobTypes = [
        { name: "send-email", duration: 1500 },
        { name: "process-image", duration: 2000 },
        { name: "generate-report", duration: 3000 },
        { name: "sync-data", duration: 1000 },
      ];

      const jobType = jobTypes[Math.floor(Math.random() * jobTypes.length)];

      const job = await queue.add(jobType.name, {
        ...jobType,
        userId: `user-${jobsCreated}`,
        timestamp: new Date().toISOString(),
        shouldFail: jobsCreated === 3, // Make job #3 fail once for demo
      });

      console.log(
        `🏭 Created job ${job.id}: ${jobType.name} (${jobsCreated}/${maxJobs})`
      );
    };

    // Create first job immediately
    await createJob();

    // Then create jobs at intervals
    producerInterval = setInterval(createJob, config.demo.jobInterval);

    return {
      stop: () => {
        if (producerInterval) {
          clearInterval(producerInterval);
          producerInterval = null;
        }
      },
      getJobsCreated: () => jobsCreated,
    };
  },
  halt: async (producer) => {
    producer.stop();
    console.log(
      `🏭 Job producer stopped (created ${producer.getJobsCreated()} jobs)`
    );
  },
});

/**
 * System Configuration
 * Defines the complete system topology
 */
const systemConfig = {
  config: configResource,
  redis: redisResource,
  queue: queueResource,
  worker: workerResource,
  jobProducer: jobProducerResource,
};

/**
 * System Startup
 */
async function main() {
  console.log("🧶 Starting Braided Queue Worker System...\n");

  const { system, errors } = await startSystem(systemConfig);

  if (errors.size > 0) {
    console.error("❌ Errors starting system:");
    for (const [resource, error] of errors) {
      console.error(`   - ${resource}:`, error.message);
    }

    // Attempt to halt any resources that did start
    await haltSystem(systemConfig, system);
    process.exit(1);
  }

  console.log("\n✨ System started successfully!");
  console.log("📊 Job processing in progress...");
  console.log("\n📖 Monitor Redis (copy-paste ready):");
  console.log("   # Redis Commander (web UI)");
  console.log("   open http://localhost:8081");
  console.log("\n   # Or use Redis CLI");
  console.log("   docker exec -it braided-queue-redis redis-cli");
  console.log("   > KEYS *");
  console.log("   > LLEN bull:example-queue:wait");
  console.log("\n🛑 Press Ctrl+C to trigger graceful shutdown\n");

  // Graceful shutdown handler
  let isShuttingDown = false;
  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log(`\n\n🛑 Received ${signal}, initiating graceful shutdown...`);
    console.log("⏳ Waiting for active jobs to complete...\n");

    const stats = system.worker.getStats();
    console.log("📊 Final Stats:");
    console.log(`   - Jobs created: ${system.jobProducer.getJobsCreated()}`);
    console.log(`   - Jobs processed: ${stats.processed}`);
    console.log(`   - Jobs failed: ${stats.failed}`);
    console.log(`   - Jobs active: ${stats.active}\n`);

    const { errors: haltErrors } = await haltSystem(systemConfig, system);

    if (haltErrors.size > 0) {
      console.error("\n❌ Errors during shutdown:");
      for (const [resource, error] of haltErrors) {
        console.error(`   - ${resource}:`, error.message);
      }
      process.exit(1);
    }

    console.log("\n✅ System halted successfully. All jobs completed! 👋\n");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
