import { pool, queryOne } from "../db/client";
import { Job, Pipeline } from "../types";
import { logger } from "../utils/logger";


export async function claimNextJob(): Promise<(Job & { pipeline: Pipeline }) | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<Job>(
      `SELECT j.* FROM jobs j
       WHERE j.status = 'pending'
       ORDER BY j.created_at ASC 
       LIMIT 1 
       FOR UPDATE SKIP LOCKED`
    );

    const job = result.rows[0];

    if (!job) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `UPDATE jobs SET status = 'processing', attempts = attempts + 1 WHERE id = $1`,
      [job.id]
    );

    await client.query("COMMIT");

    const pipeline = await queryOne<Pipeline>("SELECT * FROM pipelines WHERE id = $1", [job.pipeline_id]);
    
    if (!pipeline) {
      logger.error("Pipeline not found for job", { jobId: job.id });
      await client.query(`UPDATE jobs SET status = 'failed', error = 'Pipeline not found' WHERE id = $1`, [job.id]);
      return null;
    }

    return { ...job, pipeline };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}


export async function completeJob(jobId: string, result: Record<string, unknown>) {
  await pool.query(
    `UPDATE jobs SET status = 'completed', result = $1, processed_at = NOW() WHERE id = $2`,
    [JSON.stringify(result), jobId]
  );
}


export async function failJob(jobId: string, error: string) {
  await pool.query(
    `UPDATE jobs 
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END, 
         error = $1, 
         processed_at = NOW() 
     WHERE id = $2`,
    [error, jobId]
  );
}