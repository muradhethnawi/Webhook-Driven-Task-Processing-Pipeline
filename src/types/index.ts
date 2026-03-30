export type ActionType = "transform" | "filter" | "enrich" | "delay";
export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type DeliveryStatus = "success" | "failed";

export interface Pipeline {
  id: string;
  name: string;
  source_id: string;
  action_type: ActionType;
  action_config: ActionConfig;
  subscribers: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Job {
  id: string;
  pipeline_id: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  result: Record<string, unknown> | null;
  error: string | null;
  scheduled_at: Date;
  created_at: Date;
  processed_at: Date | null;
}

export interface DeliveryAttempt {
  id: string;
  job_id: string;
  subscriber_url: string;
  status: DeliveryStatus;
  http_status: number | null;
  response_body: string | null;
  duration_ms: number | null;
  attempted_at: Date;
}

export interface TransformOperation {
  op: "rename" | "delete" | "set";
  field: string;
  value?: unknown;
  newField?: string;
}

export interface TransformConfig { operations: TransformOperation[]; }
export interface FilterConfig { field: string; operator: "eq" | "neq" | "contains" | "exists"; value?: unknown; }
export interface EnrichConfig { fields: Record<string, unknown>; }
export interface DelayConfig { delayMs: number; }
export type ActionConfig = TransformConfig | FilterConfig | EnrichConfig | DelayConfig | Record<string, unknown>;
