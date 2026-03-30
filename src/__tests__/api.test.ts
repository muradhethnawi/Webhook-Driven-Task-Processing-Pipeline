import request from "supertest";
import { app } from "../index";
import { pool, query } from "../db/client";

beforeAll(async () => {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

  await query(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
      name TEXT NOT NULL, 
      source_id UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(), 
      action_type TEXT NOT NULL, 
      action_config JSONB NOT NULL DEFAULT '{}', 
      subscribers JSONB NOT NULL DEFAULT '[]', 
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), 
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
      pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE, 
      payload JSONB NOT NULL, 
      status TEXT NOT NULL DEFAULT 'pending', 
      attempts INTEGER NOT NULL DEFAULT 0, 
      max_attempts INTEGER NOT NULL DEFAULT 5, 
      result JSONB, 
      error TEXT, 
      scheduled_at TIMESTAMP NOT NULL DEFAULT NOW(), 
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), 
      processed_at TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS delivery_attempts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, 
      subscriber_url TEXT NOT NULL, 
      status TEXT NOT NULL, 
      http_status INTEGER, 
      response_body TEXT, 
      duration_ms INTEGER, 
      attempted_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
});

afterAll(async () => {
  await query("DROP TABLE IF EXISTS delivery_attempts, jobs, pipelines CASCADE");
  await pool.end();
});

describe("GET /health", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("Pipelines", () => {
  let id: string;
  it("creates", async () => {
    const res = await request(app).post("/pipelines").send({ 
      name: "Test", 
      action_type: "enrich", 
      action_config: { fields: {} }, 
      subscribers: ["https://webhook.site/test"] 
    });
    expect(res.status).toBe(201);
    id = res.body.data.id;
  });

  it("lists", async () => {
    const res = await request(app).get("/pipelines");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("gets by id", async () => {
    const res = await request(app).get(`/pipelines/${id}`);
    expect(res.status).toBe(200);
  });

  it("updates", async () => {
    const res = await request(app).patch(`/pipelines/${id}`).send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated");
  });

  it("deletes", async () => {
    const res = await request(app).delete(`/pipelines/${id}`);
    expect(res.status).toBe(200);
  });

  it("404 on missing", async () => {
    const res = await request(app).get("/pipelines/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

describe("Webhooks", () => {
  it("queues and returns 202", async () => {
    const p = await request(app).post("/pipelines").send({ 
      name: "WH", 
      action_type: "enrich", 
      action_config: { fields: {} }, 
      subscribers: ["https://webhook.site/test"] 
    });
    
    const sourceId = p.body.data.source_id;
    const res = await request(app).post(`/webhook/${sourceId}`).send({ event: "test" });
    
    expect(res.status).toBe(202);
    expect(res.body.job_id).toBeDefined();
  });

  it("404 for unknown source", async () => {
    const res = await request(app).post("/webhook/00000000-0000-0000-0000-000000000000").send({});
    expect(res.status).toBe(404);
  });
});