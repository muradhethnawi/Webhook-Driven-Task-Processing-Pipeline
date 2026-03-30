import dotenv from "dotenv";
dotenv.config();
import { claimNextJob, completeJob, failJob } from "../services/queue";
import { processAction } from "../services/processor";
import { deliverToSubscribers } from "../services/delivery";
import { logger } from "../utils/logger";
import { pool } from "../db/client";

const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? "2000", 10);
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10);

let running = true;
let activeJobs = 0;

async function processNextJob() {
  if (activeJobs >= CONCURRENCY) return;
  const job = await claimNextJob();
  if (!job) return;
  activeJobs++;
  logger.info("Processing job", { jobId: job.id, pipeline: job.pipeline.name });
  try {
    const result = processAction(job.pipeline.action_type, job.pipeline.action_config, job.payload);
    if (!result.passed) {
      await completeJob(job.id, { filtered: true });
      return;
    }
    const subscribers = job.pipeline.subscribers as string[];
    const deliveryResults = await deliverToSubscribers(job.id, subscribers, result.data);
    const allSucceeded = deliveryResults.every((r) => r.success);
    if (allSucceeded) {
      await completeJob(job.id, result.data);
      logger.info("Job completed", { jobId: job.id });
    } else {
      const failed = deliveryResults.filter((r) => !r.success).map((r) => r.url);
      await failJob(job.id, `Delivery failed for: ${failed.join(", ")}`);
    }
  } catch (err) {
    await failJob(job.id, err instanceof Error ? err.message : String(err));
  } finally {
    activeJobs--;
  }
}

async function workerLoop() {
  logger.info("Worker started", { pollInterval: POLL_INTERVAL_MS, concurrency: CONCURRENCY });
  while (running) {
    try {
      const promises = [];
      for (let i = 0; i < CONCURRENCY - activeJobs; i++) promises.push(processNextJob());
      await Promise.allSettled(promises);
    } catch (err) { logger.error("Worker loop error", { err }); }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  await pool.end();
}

process.on("SIGINT", () => { running = false; });
process.on("SIGTERM", () => { running = false; });
workerLoop().catch((err) => { logger.error("Fatal worker error", { err }); process.exit(1); });




