import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("LOG_LEVEL", "debug");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getLogger() {
    const mod = await import("../logger");
    return mod.logger;
  }

  it("logger.info outputs valid JSON to console.log with correct level and timestamp", async () => {
    const logger = await getLogger();
    logger.info("test message");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("info");
    expect(output.message).toBe("test message");
    expect(output.timestamp).toBeDefined();
    // Timestamp is valid ISO 8601
    expect(new Date(output.timestamp).toISOString()).toBe(output.timestamp);
  });

  it("logger.error outputs to console.error", async () => {
    const logger = await getLogger();
    logger.error("error happened");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();

    const output = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("error");
    expect(output.message).toBe("error happened");
  });

  it("logger.warn outputs to console.error", async () => {
    const logger = await getLogger();
    logger.warn("warning issued");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();

    const output = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("warn");
    expect(output.message).toBe("warning issued");
  });

  it("logger.debug outputs to console.log", async () => {
    const logger = await getLogger();
    logger.debug("debug info");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("debug");
  });

  it("includes context fields in output", async () => {
    const logger = await getLogger();
    logger.info("payment started", {
      userId: "user-123",
      paymentId: "pay-456",
      url: "https://api.example.com",
      action: "payment_started",
    });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.userId).toBe("user-123");
    expect(output.paymentId).toBe("pay-456");
    expect(output.url).toBe("https://api.example.com");
    expect(output.action).toBe("payment_started");
  });

  it("LOG_LEVEL=warn suppresses info messages", async () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    vi.resetModules();

    const logger = await getLogger();
    logger.info("should be suppressed");
    logger.warn("should appear");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const output = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("warn");
  });

  it("LOG_LEVEL=error suppresses warn and info messages", async () => {
    vi.stubEnv("LOG_LEVEL", "error");
    vi.resetModules();

    const logger = await getLogger();
    logger.info("suppressed");
    logger.warn("also suppressed");
    logger.error("should appear");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const output = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("error");
  });

  it("timestamp is valid ISO 8601", async () => {
    const logger = await getLogger();
    logger.info("timestamp test");

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    const parsed = new Date(output.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
    expect(parsed.toISOString()).toBe(output.timestamp);
  });
});
