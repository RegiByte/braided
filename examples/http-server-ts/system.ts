import {
  defineResource,
  startSystem,
  haltSystem,
  StartedResource,
} from "braided";
import { Router } from "express";
import express from "express";

// Loads the config from somewhere
const configResource = defineResource({
  start: () => {
    return {
      port: 3333,
      greetingMessage: "Hello, world!",
    };
  },
  halt: async () => {
    console.log("Disposing of config resource");
    // Artificial delay on cleanup to simulate a slow resource draining in-flight work
    await new Promise((resolve) => setTimeout(resolve, 1000));
  },
});

// Creates a handler to deal with routing
const routerResource = defineResource({
  dependencies: ["config"] as const,
  start: ({ config }: { config: StartedResource<typeof configResource> }) => {
    const router = Router();
    router.get("/", (req, res) => {
      console.log("received request");
      res.send(config.greetingMessage);
    });
    return router;
  },
  halt: () => {
    // no op, router doesn't need to dispose of anything
    console.log("Disposing of router resource");
  },
});

// Spawn an HTTP server to listen for requests
const httpServer = defineResource({
  dependencies: ["router", "config"] as const,
  start: ({
    router,
    config,
  }: {
    router: StartedResource<typeof routerResource>;
    config: StartedResource<typeof configResource>;
  }) => {
    const app = express();

    app.use(router);

    return new Promise((resolve) => {
      const server = app.listen(config.port, (error?: Error) => {
        if (error) {
          console.error("Error starting http server", error);
          resolve(null);
          return;
        }
        console.log("Server is running!!");
        resolve(server);
      });
    }) as Promise<ReturnType<typeof app.listen> | null>;
  },
  halt: (app) => {
    return new Promise((resolve) => {
      console.log("Closing http server");
      app?.close((error) => {
        if (error) {
          console.error("Error closing http server", error);
        } else {
          console.log("Server closed");
        }
        resolve();
      });
    });
  },
});

const systemConfig = {
  config: configResource,
  router: routerResource,
  httpServer,
};

startSystem(systemConfig).then(({ system, errors }) => {
  if (errors.size > 0) {
    console.error("Errors starting system", errors);
  }
  console.log(
    `\n✨ Server is running on http://localhost:${system.config.port}`
  );
  console.log(`\n📖 Try it (copy-paste ready):`);
  console.log(`   curl http://localhost:${system.config.port}`);
  console.log(`\n🛑 Press Ctrl+C for graceful shutdown\n`);

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log(`Received ${signal}, initiating graceful shutdown...`);
    const { errors: haltErrors } = await haltSystem(systemConfig, system);
    if (haltErrors.size > 0) {
      console.error("Errors halting system", haltErrors);
      process.exit(1);
      return;
    }
    console.log("System halted successfully");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
});
