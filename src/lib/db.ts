import mongoose from "mongoose";

const globalForDb = globalThis as unknown as {
  mongoosePromise: Promise<typeof mongoose> | undefined;
};

function getConnectionConfig() {
  const raw = process.env.DATABASE_POOL_SIZE;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  const maxPoolSize = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;

  return {
    uri: process.env.MONGODB_URI!,
    maxPoolSize,
  };
}

export async function connectDB(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (globalForDb.mongoosePromise) {
    return globalForDb.mongoosePromise;
  }

  const { uri, maxPoolSize } = getConnectionConfig();

  const promise = mongoose.connect(uri, { maxPoolSize });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.mongoosePromise = promise;
  }

  return promise;
}
