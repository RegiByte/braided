import { defineResource } from "braided";
import express from "express";

export const expressAppResource = defineResource({
  start: async () => {
    console.log("🚀 Creating Express app...");

    const app = express();

    // Middleware
    app.use(express.json());

    // Routes
    app.get("/", (req, res) => {
      res.json({ message: "Hello from Braided!" });
    });

    app.get("/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    app.get("/api/users", (req, res) => {
      res.json({ users: ["Alice", "Bob", "Charlie"] });
    });

    console.log("✅ Express app created");

    return app;
  },

  halt: async (app) => {
    console.log("👋 Express app shutdown (nothing to clean up)");
    // The app itself has no cleanup, but the server does (next resource)
    // waiting for 2 seconds to see the http server closing first, then the express app
    // this is just for demonstration purposes
    // to show that the server will stop accepting new connections
    // but other resources will continue to stop gracefully
    await new Promise((resolve) => setTimeout(resolve, 2000));
  },
});
