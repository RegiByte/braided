import { defineResource } from "braided";
import { Express } from "express";

export const httpServerResource = defineResource({
  dependencies: ["api", "config"],

  start: async ({
    api,
    config,
  }: {
    api: Express;
    config: { PORT: number };
  }) => {
    console.log(`Starting HTTP server on port ${config.PORT}...`);

    return new Promise((resolve, reject) => {
      const server = api.listen(config.PORT, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log(`✓ HTTP server listening on port ${config.PORT}`);
          resolve(server);
        }
      });
    }) as Promise<ReturnType<typeof api.listen>>;
  },

  halt: async (server) => {
    console.log("Closing HTTP server...");

    return new Promise<void>((resolve) => {
      let resolved = false;

      const finish = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      // Stop accepting new connections
      server.close((err) => {
        if (err) {
          console.error("Error closing server:", err);
        } else {
          console.log("✓ HTTP server closed gracefully");
        }
        finish();
      });

      // Grace period: give active requests 2 seconds to finish
      setTimeout(() => {
        if (resolved) return;
        console.log("Grace period ended, closing connections...");
        server.closeIdleConnections();
      }, 2000);

      // Hard timeout after 5 seconds
      setTimeout(() => {
        if (resolved) return;
        console.log("Forcing shutdown after timeout");
        finish();
      }, 5000);
    });
  },
});
