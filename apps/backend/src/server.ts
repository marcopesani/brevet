import Fastify from "fastify";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const postgresUrl =
  process.env.POSTGRES_URL ??
  "postgresql://app:app_dev_password@localhost:5432/appdb";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const app = Fastify({
  logger: true,
});

app.get("/health", async () => {
  return { ok: true };
});

app.get("/hello", async () => {
  return {
    app: "backend",
    message: "Hello from Fastify",
    timestamp: new Date().toISOString(),
    dependencies: {
      postgresUrl,
      redisUrl,
    },
  };
});

const start = async () => {
  try {
    await app.listen({ port, host });
    app.log.info(`Backend listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
