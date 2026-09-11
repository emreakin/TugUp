import { createServer } from "http";
import { ensureSchema } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureSchemaWithRetry(maxAttempts = 8) {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await ensureSchema();
      logger.info({ attempt }, "Database schema ensured");
      return;
    } catch (err) {
      lastErr = err;
      const waitMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      logger.warn(
        { err, attempt, maxAttempts, waitMs },
        "ensureSchema failed — retrying (check DATABASE_URL / Aiven host if ENOTFOUND)",
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function main() {
  const httpServer = createServer(app);

  // Bind first so Render health checks don't fail while DB is waking / being fixed.
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });
  logger.info({ port }, "Server listening");

  try {
    await ensureSchemaWithRetry();
  } catch (err) {
    // Keep serving /api/healthz; DB routes will 500 until DATABASE_URL is fixed.
    logger.error(
      { err },
      "Database unreachable after retries — fix DATABASE_URL (Aiven hostname). API is up for health checks only.",
    );
  }
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
