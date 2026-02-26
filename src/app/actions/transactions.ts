"use server";

import {
  getRecentTransactions as _getRecentTransactions,
  getTransactions as _getTransactions,
} from "@/lib/data/transactions";
import { withAuthRead } from "@/lib/action-result-server";
import type { TransactionDTO } from "@/lib/models/transaction";

export async function getRecentTransactions(limit?: number, chainId?: number): Promise<TransactionDTO[]> {
  return withAuthRead((auth) =>
    _getRecentTransactions(auth.userId, limit, chainId !== undefined ? { chainId } : undefined),
  );
}

export async function getTransactions(since?: string, until?: string, chainId?: number): Promise<TransactionDTO[]> {
  return withAuthRead(async (auth) => {
    const options: { since?: Date; until?: Date; chainId?: number } = {};
    if (since) {
      const sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) throw new Error("Invalid 'since' date format");
      options.since = sinceDate;
    }
    if (until) {
      const untilDate = new Date(until);
      if (isNaN(untilDate.getTime())) throw new Error("Invalid 'until' date format");
      options.until = untilDate;
    }
    if (chainId !== undefined) {
      options.chainId = chainId;
    }
    return _getTransactions(auth.userId, options);
  });
}
