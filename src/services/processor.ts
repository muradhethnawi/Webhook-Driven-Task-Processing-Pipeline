import { ActionType, ActionConfig, TransformConfig, FilterConfig, EnrichConfig } from "../types";
import { logger } from "../utils/logger";

export interface ProcessResult { passed: boolean; data: Record<string, unknown>; }

export function processAction(actionType: ActionType, actionConfig: ActionConfig, payload: Record<string, unknown>): ProcessResult {
  switch (actionType) {
    case "transform": return applyTransform(actionConfig as TransformConfig, payload);
    case "filter":    return applyFilter(actionConfig as FilterConfig, payload);
    case "enrich":    return applyEnrich(actionConfig as EnrichConfig, payload);
    case "delay":     return { passed: true, data: payload };
    default:
      logger.warn("Unknown action type", { actionType });
      return { passed: true, data: payload };
  }
}

function applyTransform(config: TransformConfig, payload: Record<string, unknown>): ProcessResult {
  const data = { ...payload };
  for (const op of config.operations ?? []) {
    if (op.op === "rename" && op.newField && op.field in data) {
      data[op.newField] = data[op.field]; delete data[op.field];
    } else if (op.op === "delete") {
      delete data[op.field];
    } else if (op.op === "set") {
      data[op.field] = op.value;
    }
  }
  return { passed: true, data };
}

function applyFilter(config: FilterConfig, payload: Record<string, unknown>): ProcessResult {
  const v = payload[config.field];
  let passed = false;
  switch (config.operator) {
    case "eq":       passed = v === config.value; break;
    case "neq":      passed = v !== config.value; break;
    case "contains": passed = typeof v === "string" && typeof config.value === "string" && v.includes(config.value); break;
    case "exists":   passed = config.field in payload; break;
  }
  return { passed, data: payload };
}

function applyEnrich(config: EnrichConfig, payload: Record<string, unknown>): ProcessResult {
  return { passed: true, data: { ...payload, ...(config.fields ?? {}), _enriched_at: new Date().toISOString() } };
}
