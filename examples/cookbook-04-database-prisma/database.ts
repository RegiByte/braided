import { defineResource } from "braided";
import { PrismaClient } from "@prisma/client";

export const databaseResource = defineResource({
  start: async () => {
    console.log("Connecting to database...");

    const prisma = new PrismaClient({
      log: ["error", "warn"],
    });

    // Test connection
    try {
      await prisma.$connect();
      console.log("✓ Database connected");
    } catch (error) {
      console.error("Failed to connect to database:", error);
      throw error;
    }

    return prisma;
  },

  halt: async (prisma) => {
    console.log("Disconnecting from database...");
    await prisma.$disconnect();
    console.log("✓ Database disconnected");
  },
});
