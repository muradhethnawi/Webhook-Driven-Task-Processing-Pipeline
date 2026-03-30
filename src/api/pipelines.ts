import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/client";
import { Pipeline } from "../types";

export const pipelinesRouter = Router();

const CreatePipelineSchema = z.object({
  name: z.string().min(1).max(255),
  action_type: z.enum(["transform", "filter", "enrich", "delay"]),
  action_config: z.record(z.unknown()).default({}),
  subscribers: z.array(z.string().url()).min(1),
});
const UpdatePipelineSchema = CreatePipelineSchema.partial();

pipelinesRouter.get("/", async (_req, res: Response) => {
  try {
    const pipelines = await query<Pipeline>("SELECT * FROM pipelines ORDER BY created_at DESC");
    res.json({ data: pipelines, count: pipelines.length });
  } catch { res.status(500).json({ error: "Failed to fetch pipelines" }); }
});

pipelinesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const pipeline = await queryOne<Pipeline>("SELECT * FROM pipelines WHERE id = $1", [req.params.id]);
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
    res.json({ data: pipeline });
  } catch { res.status(500).json({ error: "Failed to fetch pipeline" }); }
});

pipelinesRouter.post("/", async (req: Request, res: Response) => {
  const parsed = CreatePipelineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  const { name, action_type, action_config, subscribers } = parsed.data;
  try {
    const pipeline = await queryOne<Pipeline>(
      `INSERT INTO pipelines (name, action_type, action_config, subscribers) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, action_type, JSON.stringify(action_config), JSON.stringify(subscribers)]
    );
    res.status(201).json({ data: pipeline });
  } catch { res.status(500).json({ error: "Failed to create pipeline" }); }
});

pipelinesRouter.patch("/:id", async (req: Request, res: Response) => {
  const parsed = UpdatePipelineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  const existing = await queryOne<Pipeline>("SELECT * FROM pipelines WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Pipeline not found" });
  const { name, action_type, action_config, subscribers } = parsed.data;
  try {
    const pipeline = await queryOne<Pipeline>(
      `UPDATE pipelines SET name=$1, action_type=$2, action_config=$3, subscribers=$4, updated_at=NOW() WHERE id=$5 RETURNING *`,
      [name ?? existing.name, action_type ?? existing.action_type,
       JSON.stringify(action_config ?? existing.action_config),
       JSON.stringify(subscribers ?? existing.subscribers), req.params.id]
    );
    res.json({ data: pipeline });
  } catch { res.status(500).json({ error: "Failed to update pipeline" }); }
});

pipelinesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const pipeline = await queryOne<Pipeline>("DELETE FROM pipelines WHERE id = $1 RETURNING *", [req.params.id]);
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
    res.json({ data: { message: "Pipeline deleted", id: req.params.id } });
  } catch { res.status(500).json({ error: "Failed to delete pipeline" }); }
});
