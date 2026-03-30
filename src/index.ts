import 'dotenv/config';
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import helmet from "helmet";
import { pipelinesRouter } from "./api/pipelines";
import { webhooksRouter } from "./api/webhooks";
import { jobsRouter } from "./api/jobs";
import { logger } from "./utils/logger";
import { pool } from "./db/client";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(helmet());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
app.use("/pipelines", pipelinesRouter);
app.use("/webhook", webhooksRouter);
app.use("/jobs", jobsRouter);
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const server = app.listen(PORT, () => logger.info(`API server running on port ${PORT}`));

process.on("SIGINT", () => server.close(async () => { await pool.end(); process.exit(0); }));
process.on("SIGTERM", () => server.close(async () => { await pool.end(); process.exit(0); }));

export { app };
