/**
 * In-memory Prisma mock for unit/integration tests.
 *
 * Implements the subset of PrismaClient used by the test suite so that
 * tests can run without a real Postgres connection.
 */

import { randomUUID } from "crypto";

type Rec = { [key: string]: any };

// Schema defaults for each model, matching prisma/schema.prisma @default() values.
const SCHEMA_DEFAULTS: { [model: string]: Rec } = {
  user: {},
  hotWallet: {},
  endpointPolicy: {
    payFromHotWallet: false,
    status: "active",
  },
  transaction: {
    network: "base",
    status: "pending",
    type: "payment",
  },
  pendingPayment: {
    method: "GET",
    status: "pending",
  },
};

// Relations: modelName -> { relationField, foreignKey, relatedModel, type }
type RelationDef = {
  field: string;
  foreignKey: string;
  relatedModel: string;
  type: "one" | "many";
};

const RELATIONS: { [model: string]: RelationDef[] } = {
  user: [
    { field: "hotWallet", foreignKey: "userId", relatedModel: "hotWallet", type: "one" },
    { field: "endpointPolicies", foreignKey: "userId", relatedModel: "endpointPolicy", type: "many" },
    { field: "transactions", foreignKey: "userId", relatedModel: "transaction", type: "many" },
    { field: "pendingPayments", foreignKey: "userId", relatedModel: "pendingPayment", type: "many" },
  ],
  hotWallet: [
    { field: "user", foreignKey: "userId", relatedModel: "user", type: "one" },
  ],
  endpointPolicy: [
    { field: "user", foreignKey: "userId", relatedModel: "user", type: "one" },
  ],
  transaction: [
    { field: "user", foreignKey: "userId", relatedModel: "user", type: "one" },
  ],
  pendingPayment: [
    { field: "user", foreignKey: "userId", relatedModel: "user", type: "one" },
  ],
};

// Composite unique keys: Prisma uses "field1_field2" as the where key
// wrapping the actual fields. Flatten them before matching.
const COMPOSITE_KEYS: { [key: string]: string[] } = {
  userId_endpointPattern: ["userId", "endpointPattern"],
};

function flattenCompositeWhere(where: Rec): Rec {
  const flat: Rec = {};
  for (const [key, value] of Object.entries(where)) {
    if (COMPOSITE_KEYS[key] && typeof value === "object" && value !== null) {
      Object.assign(flat, value);
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

/** Simple where-clause matcher that handles equality, gte, lte, in, not, and nested AND/OR. */
function matchesWhere(record: Rec, where: Rec | undefined): boolean {
  if (!where) return true;
  where = flattenCompositeWhere(where);

  for (const [key, condition] of Object.entries(where)) {
    if (key === "AND") {
      if (!Array.isArray(condition)) return false;
      return condition.every((sub: Rec) => matchesWhere(record, sub));
    }
    if (key === "OR") {
      if (!Array.isArray(condition)) return false;
      return condition.some((sub: Rec) => matchesWhere(record, sub));
    }
    if (key === "NOT") {
      return !matchesWhere(record, condition);
    }

    const value = record[key];

    // Primitive equality
    if (condition === null || condition === undefined || typeof condition !== "object" || condition instanceof Date) {
      if (value instanceof Date && condition instanceof Date) {
        if (value.getTime() !== condition.getTime()) return false;
      } else if (value !== condition) {
        return false;
      }
      continue;
    }

    // Operator object: { gte, lte, gt, lt, in, contains, not, startsWith, ... }
    if (typeof condition === "object" && !Array.isArray(condition)) {
      for (const [op, opVal] of Object.entries(condition)) {
        switch (op) {
          case "gte":
            if (!(value >= (opVal as any))) return false;
            break;
          case "lte":
            if (!(value <= (opVal as any))) return false;
            break;
          case "gt":
            if (!(value > (opVal as any))) return false;
            break;
          case "lt":
            if (!(value < (opVal as any))) return false;
            break;
          case "in":
            if (!Array.isArray(opVal) || !opVal.includes(value)) return false;
            break;
          case "not":
            if (value === opVal) return false;
            break;
          case "contains":
            if (typeof value !== "string" || !value.includes(opVal as string)) return false;
            break;
          case "startsWith":
            if (typeof value !== "string" || !value.startsWith(opVal as string)) return false;
            break;
          default:
            // Unknown operator — treat as nested equality
            if (value !== opVal) return false;
        }
      }
      continue;
    }

    if (value !== condition) return false;
  }
  return true;
}

function applyOrderBy(records: Rec[], orderBy: any): Rec[] {
  if (!orderBy) return records;
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...records].sort((a, b) => {
    for (const entry of entries) {
      for (const [key, dir] of Object.entries(entry)) {
        const aVal = a[key];
        const bVal = b[key];
        if (aVal < bVal) return dir === "asc" ? -1 : 1;
        if (aVal > bVal) return dir === "asc" ? 1 : -1;
      }
    }
    return 0;
  });
}

function resolveIncludes(
  record: Rec,
  include: Rec | undefined,
  modelName: string,
  allStores: { [model: string]: Rec[] },
): Rec {
  if (!include) return { ...record };

  const result = { ...record };
  const relations = RELATIONS[modelName] || [];

  for (const [field, shouldInclude] of Object.entries(include)) {
    if (!shouldInclude) continue;
    const rel = relations.find((r) => r.field === field);
    if (!rel) continue;

    const relatedStore = allStores[rel.relatedModel] || [];

    if (rel.type === "one") {
      // For "one" relations on the owning side (e.g., user.hotWallet):
      // The related record has a foreign key pointing to this record's id.
      const related = relatedStore.find((r) => r[rel.foreignKey] === record.id);
      result[field] = related ? { ...related } : null;
    } else {
      // For "many" relations: find all matching records
      const related = relatedStore.filter((r) => r[rel.foreignKey] === record.id);
      result[field] = related.map((r) => ({ ...r }));
    }
  }

  return result;
}

function createModelMock(
  store: Rec[],
  modelName: string,
  allStores: { [model: string]: Rec[] },
) {
  const defaults = SCHEMA_DEFAULTS[modelName] || {};

  return {
    create: async ({ data, include }: { data: Rec; include?: Rec }) => {
      const now = new Date();
      const record: Rec = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...defaults,
        ...data,
      };
      store.push(record);
      return resolveIncludes(record, include, modelName, allStores);
    },

    findUnique: async ({ where, include }: { where: Rec; include?: Rec }) => {
      const found = store.find((r) => matchesWhere(r, where));
      if (!found) return null;
      return resolveIncludes(found, include, modelName, allStores);
    },

    findFirst: async ({ where, orderBy, include }: { where?: Rec; orderBy?: any; include?: Rec } = {}) => {
      let results = store.filter((r) => matchesWhere(r, where));
      results = applyOrderBy(results, orderBy);
      if (results.length === 0) return null;
      return resolveIncludes(results[0], include, modelName, allStores);
    },

    findMany: async ({
      where,
      orderBy,
      take,
      skip,
      include,
    }: { where?: Rec; orderBy?: any; take?: number; skip?: number; include?: Rec } = {}) => {
      let results = store.filter((r) => matchesWhere(r, where));
      results = applyOrderBy(results, orderBy);
      if (skip) results = results.slice(skip);
      if (take) results = results.slice(0, take);
      return results.map((r) => resolveIncludes(r, include, modelName, allStores));
    },

    update: async ({ where, data, include }: { where: Rec; data: Rec; include?: Rec }) => {
      const idx = store.findIndex((r) => matchesWhere(r, where));
      if (idx === -1) {
        throw new Error(
          `Record to update not found. Where: ${JSON.stringify(where)}`,
        );
      }
      const updated = { ...store[idx], ...data, updatedAt: new Date() };
      store[idx] = updated;
      return resolveIncludes(updated, include, modelName, allStores);
    },

    upsert: async ({
      where,
      create,
      update,
      include,
    }: {
      where: Rec;
      create: Rec;
      update: Rec;
      include?: Rec;
    }) => {
      const idx = store.findIndex((r) => matchesWhere(r, where));
      if (idx === -1) {
        const now = new Date();
        const record: Rec = {
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
          ...defaults,
          ...create,
        };
        store.push(record);
        return resolveIncludes(record, include, modelName, allStores);
      }
      const updated = { ...store[idx], ...update, updatedAt: new Date() };
      store[idx] = updated;
      return resolveIncludes(updated, include, modelName, allStores);
    },

    deleteMany: async ({ where }: { where?: Rec } = {}) => {
      if (!where) {
        const count = store.length;
        store.length = 0;
        return { count };
      }
      let count = 0;
      for (let i = store.length - 1; i >= 0; i--) {
        if (matchesWhere(store[i], where)) {
          store.splice(i, 1);
          count++;
        }
      }
      return { count };
    },

    delete: async ({ where }: { where: Rec }) => {
      const idx = store.findIndex((r) => matchesWhere(r, where));
      if (idx === -1) {
        throw new Error(
          `Record to delete not found. Where: ${JSON.stringify(where)}`,
        );
      }
      const [removed] = store.splice(idx, 1);
      return { ...removed };
    },

    count: async ({ where }: { where?: Rec } = {}) => {
      return store.filter((r) => matchesWhere(r, where)).length;
    },

    // Expose the underlying store for inspection/reset
    _store: store,
  };
}

export function createPrismaMock() {
  const stores: { [model: string]: Rec[] } = {
    user: [],
    hotWallet: [],
    endpointPolicy: [],
    transaction: [],
    pendingPayment: [],
  };

  return {
    user: createModelMock(stores.user, "user", stores),
    hotWallet: createModelMock(stores.hotWallet, "hotWallet", stores),
    endpointPolicy: createModelMock(stores.endpointPolicy, "endpointPolicy", stores),
    transaction: createModelMock(stores.transaction, "transaction", stores),
    pendingPayment: createModelMock(stores.pendingPayment, "pendingPayment", stores),
    $disconnect: async () => {},
    $connect: async () => {},
    $transaction: async (fn: any) => {
      if (typeof fn === "function") {
        return fn({
          user: createModelMock(stores.user, "user", stores),
          hotWallet: createModelMock(stores.hotWallet, "hotWallet", stores),
          endpointPolicy: createModelMock(stores.endpointPolicy, "endpointPolicy", stores),
          transaction: createModelMock(stores.transaction, "transaction", stores),
          pendingPayment: createModelMock(stores.pendingPayment, "pendingPayment", stores),
        });
      }
      if (Array.isArray(fn)) {
        return Promise.all(fn);
      }
    },
    _stores: stores,
  };
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;
