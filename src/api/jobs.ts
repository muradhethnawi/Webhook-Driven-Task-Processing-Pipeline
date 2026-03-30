import { Router, Request, Response } from "express";
import { query, queryOne } from "../db/client";
import { Job, DeliveryAttempt } from "../types";

export const jobsRouter = Router();

jobsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { status, pipeline_id, limit = "50", offset = "0" } = req.query;
    let sql = "SELECT * FROM jobs WHERE 1=1";
    const params: unknown[] = [];
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (pipeline_id) { params.push(pipeline_id); sql += ` AND pipeline_id = $${params.length}`; }
    params.push(parseInt(limit as string, 10));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    params.push(parseInt(offset as string, 10));
    sql += ` OFFSET $${params.length}`;
    const jobs = await query<Job>(sql, params);
    res.json({ data: jobs, count: jobs.length });
  } catch { res.status(500).json({ error: "Failed to fetch jobs" }); }
});

jobsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const job = await queryOne<Job>("SELECT * FROM jobs WHERE id = $1", [req.params.id]);
    if (!job) return res.status(404).json({ error: "Job not found" });
    const deliveries = await query<DeliveryAttempt>(
      "SELECT * FROM delivery_attempts WHERE job_id = $1 ORDER BY attempted_at ASC", [req.params.id]
    );
    res.json({ data: { ...job, delivery_attempts: deliveries } });
  } catch { res.status(500).json({ error: "Failed to fetch job" }); }
});

jobsRouter.get("/:id/deliveries", async (req: Request, res: Response) => {
  try {
    const job = await queryOne<Job>("SELECT id FROM jobs WHERE id = $1", [req.params.id]);
    if (!job) return res.status(404).json({ error: "Job not found" });
    const deliveries = await query<DeliveryAttempt>(
      "SELECT * FROM delivery_attempts WHERE job_id = $1 ORDER BY attempted_at ASC", [req.params.id]
    );
    res.json({ data: deliveries, count: deliveries.length });
  } catch { res.status(500).json({ error: "Failed to fetch delivery attempts" }); }
});
