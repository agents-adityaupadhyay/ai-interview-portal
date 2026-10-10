import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/ai_interview_platform",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require") || process.env.DATABASE_URL?.includes("aivencloud")
    ? { rejectUnauthorized: false }
    : undefined,
});
