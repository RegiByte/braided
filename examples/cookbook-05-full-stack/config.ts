import { defineResource } from "braided";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Error formatting utility
type InvalidValueIssue = z.core.$ZodIssueInvalidValue;

const enumErrorFormatter = (issue: InvalidValueIssue) => {
  const path = issue.path.join(".");
  const acceptedValues = issue.values
    .map((s) => `"${s as string}"`)
    .join(" | ");
  const receivedValue = issue.input;
  return `Invalid ${path}: "${receivedValue}" must be one of ${acceptedValues}`;
};

// Define the schema
const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"], {
      error: (issue) => enumErrorFormatter(issue as InvalidValueIssue),
    })
    .default("development"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"], {
      error: (issue) => enumErrorFormatter(issue as InvalidValueIssue),
    })
    .default("info"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
});

export const configResource = defineResource({
  start: async () => {
    console.log("Loading configuration...");

    // Load .env file
    loadEnv();

    // Parse and validate
    const result = configSchema.safeParse({
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      DATABASE_URL: process.env.DATABASE_URL,
    });

    if (!result.success) {
      console.error(z.prettifyError(result.error));
      throw new Error("Configuration validation failed");
    }

    const config = result.data;
    console.log("✓ Configuration loaded:", {
      PORT: config.PORT,
      NODE_ENV: config.NODE_ENV,
      LOG_LEVEL: config.LOG_LEVEL,
      DATABASE_URL: config.DATABASE_URL.replace(/:[^:@]+@/, ":****@"), // Hide password
    });

    return config;
  },

  halt: async (config) => {
    console.log("✓ Config shutdown");
  },
});
