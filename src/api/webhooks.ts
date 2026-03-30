import { Router, Request, Response } from "express";
import { queryOne } from "../db/client";
import { Pipeline, Job } from "../types";
import { logger } from "../utils/logger";

export const webhooksRouter = Router();

webhooksRouter.post("/:sourceId", async (req: Request, res: Response) => {
  const { sourceId } = req.params;
  const pipeline = await queryOne<Pipeline>("SELECT * FROM pipelines WHERE source_id = $1", [sourceId]);
  if (!pipeline) return res.status(404).json({ error: "No pipeline found for this webhook URL" });

  let scheduledAt = new Date();
  if (pipeline.action_type === "delay") {
    const config = pipeline.action_config as { delayMs?: number };
    scheduledAt = new Date(Date.now() + (config.delayMs ?? 0));
  }

  try {
    const job = await queryOne<Job>(
      `INSERT INTO jobs (pipeline_id, payload, scheduled_at) VALUES ($1,$2,$3) RETURNING id, status, created_at`,
      [pipeline.id, JSON.stringify(req.body), scheduledAt]
    );
    logger.info("Job enqueued", { jobId: job?.id, pipelineId: pipeline.id });
    res.status(202).json({ message: "Webhook received and queued for processing", job_id: job?.id });
  } catch (err) {
    logger.error("Failed to enqueue job", { err });
    res.status(500).json({ error: "Failed to queue webhook" });
  }
});
