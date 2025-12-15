import { defineResource } from "braided";
import { Express } from "express";

export const httpServerResource = defineResource({
  dependencies: ["expressApp", "port"],

  start: async ({
    expressApp: app,
    port,
  }: {
    expressApp: Express;
    port: number;
  }) => {
    console.log(`🌐 Starting HTTP server on port ${port}...`);

    // Wait for http server to start, return server instance
    return new Promise((resolve, reject) => {
      const server = app.listen(port, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve(server);
        }
      });
    }) as Promise<ReturnType<typeof app.listen>>;
  },

  halt: async (server) => {
    console.log("📴 Closing HTTP server...");

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
          console.error("❌ Error closing server:", err);
        } else {
          console.log("✅ HTTP server closed gracefully");
        }
        finish();
      });

      // Give active requests 3 seconds to finish
      setTimeout(() => {
        if (resolved) return;
        console.log("⏱️  Grace period ended, closing connections...");
        // See the docs https://nodejs.org/api/http.html#servercloseidleconnections
        server.closeIdleConnections();
        // this will close all keep-alive connections
        // which are all connections that are not waiting for a response or not requesting anything
        // or, if you really want to force it
        // server.closeAllConnections();
        // https://nodejs.org/api/http.html#servercloseallconnections
      }, 3000);

      // Hard timeout after 5 seconds total
      // if the server hasn't stopped at this point, we need to force it to close
      setTimeout(() => {
        if (resolved) return;
        console.log("⚠️  Forcing shutdown after timeout");
        finish();
      }, 5000);
    });
  },
});
