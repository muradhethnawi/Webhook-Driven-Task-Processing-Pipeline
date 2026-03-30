import axios from "axios";
import { query } from "../db/client";
import { logger } from "../utils/logger";

const DELIVERY_TIMEOUT_MS = parseInt(process.env.DELIVERY_TIMEOUT_MS ?? "10000", 10);
const MAX_RETRIES = parseInt(process.env.DELIVERY_MAX_RETRIES ?? "5", 10);

interface DeliveryResult { url: string; success: boolean; httpStatus?: number; error?: string; }

async function deliverToUrl(jobId: string, url: string, payload: Record<string, unknown>): Promise<DeliveryResult> {
  let lastError = ""; let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    try {
      const response = await axios.post(url, payload, {
        timeout: DELIVERY_TIMEOUT_MS,
        headers: { "Content-Type": "application/json", "X-Webhook-Pipeline": "1" },
        validateStatus: (s) => s < 500,
      });
      const duration = Date.now() - start;
      await recordAttempt(jobId, url, "success", response.status, String(response.data ?? ""), duration);
      logger.info("Delivered", { url, status: response.status });
      return { url, success: true, httpStatus: response.status };
    } catch (err) {
      const duration = Date.now() - start;
      lastError = err instanceof Error ? err.message : String(err);
      lastStatus = axios.isAxiosError(err) ? err.response?.status : undefined;
      await recordAttempt(jobId, url, "failed", lastStatus, lastError, duration);
      logger.warn("Delivery failed", { url, attempt, error: lastError });
      if (attempt < MAX_RETRIES) await sleep(Math.pow(2, attempt - 1) * 1000);
    }
  }
  return { url, success: false, httpStatus: lastStatus, error: lastError };
}

export async function deliverToSubscribers(jobId: string, subscribers: string[], payload: Record<string, unknown>): Promise<DeliveryResult[]> {
  return Promise.all(subscribers.map((url) => deliverToUrl(jobId, url, payload)));
}

async function recordAttempt(jobId: string, subscriberUrl: string, status: "success" | "failed", httpStatus: number | undefined, responseBody: string, durationMs: number) {
  await query(
    `INSERT INTO delivery_attempts (job_id, subscriber_url, status, http_status, response_body, duration_ms) VALUES ($1,$2,$3,$4,$5,$6)`,
    [jobId, subscriberUrl, status, httpStatus ?? null, responseBody.slice(0, 2000), durationMs]
  );
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
