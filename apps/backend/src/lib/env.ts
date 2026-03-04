const defaults = {
  cookieSecret: "dev-cookie-secret",
  frontendOrigin: "http://localhost:3000",
  host: "0.0.0.0",
  logLevel: "info",
  logPretty: false,
  logRedact: true,
  logSampleRate: 1,
  passkeyRpId: "localhost",
  passkeyRpName: "Brevet",
  port: 4000,
  siwxDomain: "localhost:3000",
  siwxUri: "http://localhost:3000",
} as const;

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const cookieSecret = process.env.COOKIE_SECRET ?? defaults.cookieSecret;

if (isProduction && cookieSecret === defaults.cookieSecret) {
  throw new Error("COOKIE_SECRET must be set in production");
}

export const backendEnv = {
  cookieSecret,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? defaults.frontendOrigin,
  host: process.env.HOST ?? defaults.host,
  isProduction,
  logLevel: process.env.LOG_LEVEL ?? defaults.logLevel,
  logPretty: process.env.LOG_PRETTY === '1' ? true : defaults.logPretty,
  logRedact: process.env.LOG_REDACT === '0' ? false : defaults.logRedact,
  logSampleRate: Number(process.env.LOG_SAMPLE_RATE ?? defaults.logSampleRate),
  nodeEnv,
  passkeyRpId: process.env.PASSKEY_RP_ID ?? defaults.passkeyRpId,
  passkeyRpName: process.env.PASSKEY_RP_NAME ?? defaults.passkeyRpName,
  port: Number(process.env.PORT ?? defaults.port),
  siwxDomain: process.env.SIWX_DOMAIN ?? defaults.siwxDomain,
  siwxUri: process.env.SIWX_URI ?? defaults.siwxUri,
} as const;
