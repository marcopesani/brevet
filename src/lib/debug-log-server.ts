/**
 * Server-only debug logger. Writes NDJSON to .cursor/debug.log.
 * Use only in server code (auth-config, auth, API routes).
 */
const path = require("path") as { join: (...segments: string[]) => string };
const LOG_PATH = path.join(process.cwd(), ".cursor/debug.log");

export function debugLogServer(payload: {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  hypothesisId?: string;
}) {
  try {
    const fs = require("fs") as { appendFileSync: (path: string, data: string) => void };
    fs.appendFileSync(LOG_PATH, JSON.stringify({ ...payload, timestamp: Date.now() }) + "\n");
  } catch {
    // ignore
  }
}
