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
  console.log(
    `[BREVET:db] connectDB called — readyState=${mongoose.connection.readyState}, cachedPromise=${!!globalForDb.mongoosePromise}, NODE_ENV=${process.env.NODE_ENV}`,
  );

  if (mongoose.connection.readyState === 1) {
    console.log("[BREVET:db] Already connected, returning mongoose");
    return mongoose;
  }

  if (globalForDb.mongoosePromise) {
    console.log("[BREVET:db] Returning cached connection promise");
    return globalForDb.mongoosePromise;
  }

  const { uri, maxPoolSize } = getConnectionConfig();

  console.log(`[BREVET:db] Creating new connection (maxPoolSize=${maxPoolSize})`);
  const promise = mongoose.connect(uri, { maxPoolSize });

  globalForDb.mongoosePromise = promise;

  return promise;
}
