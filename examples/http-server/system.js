const { defineResource, startSystem, haltSystem } = require("braided");
const { Router } = require("express");
const express = require("express");

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
    // Artifical delay on cleanup to simulate a slow resource draining in-flight work
    await new Promise((resolve) => setTimeout(resolve, 1000));
  },
});

// Creates a handler to deal with routing
const router = defineResource({
  dependencies: ["config"],
  start: ({ config }) => {
    const router = new Router();
    router.get("/", (req, res) => {
      console.log("received request");
      res.send(config.greetingMessage);
    });
    return router;
  },
  halt: () => {
    // no op, router doesn't need to dispose of anything
  },
});

// Spawn an HTTP server to listen for requests
const httpServer = defineResource({
  dependencies: ["router", "config"],
  start: ({ router, config }) => {
    const app = express();

    app.use(router);

    return new Promise((resolve) => {
      const server = app.listen(config.port, () => {
        console.log("Server is running!!");
        resolve(server);
      });
    });
  },
  halt: (app) => {
    app.close((error) => {
      if (error) {
        console.error("Error closing http server", error);
      }
    });
  },
});

const systemConfig = {
  config: configResource,
  router,
  httpServer,
};

startSystem(systemConfig).then(({ system, errors }) => {
  if (errors.size > 0) {
    console.error("Errors starting system", errors);
  }
  console.log(
    `Server is running on port http://localhost:${system.config.port}`
  );

  process.on("SIGINT", async () => {
    const { errors: haltErrors } = await haltSystem(systemConfig, system);
    if (haltErrors.size > 0) {
      console.error("Errors halting system", haltErrors);
      process.exit(1);
      return;
    }
    console.log("System halted successfully");
    process.exit(0);
  });
});
