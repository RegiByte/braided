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
  API_KEY: z.string().min(1, "API_KEY is required"),
});

export const configResource = defineResource({
  start: async () => {
    console.log("📝 Loading configuration...");

    // Load .env file
    loadEnv();

    // Parse and validate
    const result = configSchema.safeParse({
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      API_KEY: process.env.API_KEY,
    });

    if (!result.success) {
      console.error(z.prettifyError(result.error));
      throw new Error("Configuration validation failed");
    }

    const config = result.data;
    console.log("✅ Configuration loaded and validated:", config);

    return config;
  },

  halt: async (config) => {
    console.log("👋 Config shutdown");
  },
});
