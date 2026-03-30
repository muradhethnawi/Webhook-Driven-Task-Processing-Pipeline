import { pool } from "./client";
import dotenv from "dotenv";
dotenv.config();

const migrations = `
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  CREATE TABLE IF NOT EXISTS pipelines (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT NOT NULL,
    source_id     UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
    action_type   TEXT NOT NULL CHECK (action_type IN ('transform', 'filter', 'enrich', 'delay')),
    action_config JSONB NOT NULL DEFAULT '{}',
    subscribers   JSONB NOT NULL DEFAULT '[]',
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_id   UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    payload       JSONB NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts      INTEGER NOT NULL DEFAULT 0,
    max_attempts  INTEGER NOT NULL DEFAULT 5,
    result        JSONB,
    error         TEXT,
    scheduled_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at  TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS delivery_attempts (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id         UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    subscriber_url TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    http_status    INTEGER,
    response_body  TEXT,
    duration_ms    INTEGER,
    attempted_at   TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_id ON jobs(pipeline_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_delivery_attempts_job_id ON delivery_attempts(job_id);
  CREATE INDEX IF NOT EXISTS idx_pipelines_source_id ON pipelines(source_id);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Running migrations...");
    await client.query(migrations);
    console.log("Migrations completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => { 
  console.error(err); 
  process.exit(1); 
});