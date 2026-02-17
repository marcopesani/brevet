/**
 * Resolve the public base URL of the app.
 *
 * In development with a tunnel (ngrok, cloudflared, etc.), set BASE_URL in
 * your .env to the tunnel's HTTPS URL so that assets served inside an MCP
 * host iframe resolve correctly.
 *
 * Examples:
 *   BASE_URL=https://xxxx-xxx-xxx.ngrok-free.app
 */
export const baseURL =
  process.env.BASE_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://" +
      (process.env.VERCEL_ENV === "production"
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL));
