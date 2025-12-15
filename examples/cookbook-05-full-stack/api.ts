import { defineResource } from "braided";
import express, { Express } from "express";
import { PrismaClient } from "@prisma/client";

export const apiResource = defineResource({
  dependencies: ["database"],

  start: async ({ database: db }: { database: PrismaClient }) => {
    console.log("Creating API...");

    const app = express();
    app.use(express.json());

    // Health check
    app.get("/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Get all users with their tasks
    app.get("/api/users", async (req, res) => {
      try {
        const users = await db.user.findMany({
          include: {
            tasks: {
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { name: "asc" },
        });
        res.json({ users });
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Failed to fetch users" });
      }
    });

    // Get a specific user by ID
    app.get("/api/users/:id", async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (!id || isNaN(id)) {
          return res.status(400).json({ error: "Valid user ID is required" });
        }
        const user = await db.user.findUnique({
          where: { id },
          include: { tasks: true },
        });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json({ user });
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ error: "Failed to fetch user" });
      }
    });

    // Create a new user
    app.post("/api/users", async (req, res) => {
      try {
        const { email, name } = req.body;

        if (!email || !name) {
          return res.status(400).json({ error: "Email and name are required" });
        }

        const user = await db.user.create({
          data: { email, name },
          include: { tasks: true },
        });

        res.status(201).json({ user });
      } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ error: "Failed to create user" });
      }
    });

    // Get all tasks (optionally filter by completion status)
    app.get("/api/tasks", async (req, res) => {
      try {
        const completed = req.query.completed;
        const where =
          completed !== undefined
            ? { completed: completed === "true" }
            : undefined;

        const tasks = await db.task.findMany({
          where: where ?? {},
          include: { user: true },
          orderBy: { createdAt: "desc" },
        });

        res.json({ tasks });
      } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).json({ error: "Failed to fetch tasks" });
      }
    });

    // Create a new task for a user
    app.post("/api/users/:userId/tasks", async (req, res) => {
      try {
        const userId = parseInt(req.params.userId);
        const { title, description, completed } = req.body;

        if (!userId || isNaN(userId)) {
          return res.status(400).json({ error: "Valid user ID is required" });
        }

        if (!title) {
          return res.status(400).json({ error: "Title is required" });
        }

        // Check if user exists first
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) {
          return res.status(404).json({ error: `User with ID ${userId} not found` });
        }

        const task = await db.task.create({
          data: {
            title,
            description,
            completed: completed || false,
            userId,
          },
          include: { user: true },
        });

        res.status(201).json({ task });
      } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ error: "Failed to create task" });
      }
    });

    // Update a task
    app.patch("/api/tasks/:id", async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (!id || isNaN(id)) {
          return res.status(400).json({ error: "Valid task ID is required" });
        }

        const { title, description, completed } = req.body;

        const task = await db.task.update({
          where: { id },
          data: {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(completed !== undefined && { completed }),
          },
          include: { user: true },
        });

        res.json({ task });
      } catch (error) {
        console.error("Error updating task:", error);
        if (error instanceof Error && error.message.includes("Record to update not found")) {
          return res.status(404).json({ error: "Task not found" });
        }
        res.status(500).json({ error: "Failed to update task" });
      }
    });

    // Delete a task
    app.delete("/api/tasks/:id", async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (!id || isNaN(id)) {
          return res.status(400).json({ error: "Valid task ID is required" });
        }

        await db.task.delete({ where: { id } });
        res.json({ message: "Task deleted" });
      } catch (error) {
        console.error("Error deleting task:", error);
        if (error instanceof Error && error.message.includes("Record to delete does not exist")) {
          return res.status(404).json({ error: "Task not found" });
        }
        res.status(500).json({ error: "Failed to delete task" });
      }
    });

    app.use(
      (
        err: Error,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        console.error("Error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    );

    console.log("✓ API created");
    return app;
  },

  halt: async (app) => {
    console.log("✓ API shutdown");
  },
});
