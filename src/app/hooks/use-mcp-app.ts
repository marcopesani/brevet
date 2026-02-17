"use client";

import { useSyncExternalStore } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";

// ---------------------------------------------------------------------------
// Session-persistent singleton App instance.
//
// The MCP host establishes a single bridge per iframe. We create the App once
// and share it across all pages. Tool data is persisted to sessionStorage so
// it survives client-side navigations, module re-evaluations (HMR), and
// forward/back browser history.
// ---------------------------------------------------------------------------

const STORAGE = {
  INPUT: "__mcp_tool_input",
  RESULT: "__mcp_tool_result",
  CONNECTED: "__mcp_connected",
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sessionStorage may be unavailable in some sandboxes */
  }
}

// ---------------------------------------------------------------------------
// In-memory cache (fast path, avoids JSON.parse on every render)
// ---------------------------------------------------------------------------

let memConnected = read<boolean>(STORAGE.CONNECTED) ?? false;
let memToolInput = read<Record<string, unknown>>(STORAGE.INPUT);
let memToolResult = read<Record<string, unknown>>(STORAGE.RESULT);

const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Singleton connection
// ---------------------------------------------------------------------------

let singletonApp: App | null = null;

async function ensureConnected() {
  if (singletonApp) return;

  const { App } = await import("@modelcontextprotocol/ext-apps");

  const app = new App(
    { name: "x402-mcp-gateway", version: "0.1.0" },
    {},
    { autoResize: true },
  );

  app.ontoolinput = (params) => {
    console.log("[mcp-app] tool input:", params);
    memToolInput = params.arguments ?? null;
    write(STORAGE.INPUT, memToolInput);
    notify();
  };

  app.ontoolresult = (result) => {
    console.log("[mcp-app] tool result:", result);
    memToolResult =
      (result.structuredContent as Record<string, unknown>) ?? null;
    write(STORAGE.RESULT, memToolResult);
    notify();
  };

  app.onerror = (error) => {
    console.error("[mcp-app] error:", error);
  };

  try {
    await app.connect();
    singletonApp = app;
    memConnected = true;
    write(STORAGE.CONNECTED, true);
    console.log("[mcp-app] connected to host");
    notify();
  } catch (err) {
    console.warn("[mcp-app] connect failed (not in MCP host?):", err);
  }
}

// Kick off connection once (module-level, guarded)
if (typeof window !== "undefined" && window.self !== window.top) {
  ensureConnected();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that provides the MCP Apps bridge state.
 *
 * The underlying `App` instance is a singleton — created once when the module
 * loads inside an iframe. Tool data is persisted to `sessionStorage` so it
 * survives navigations and module re-evaluations.
 */
export function useMcpApp() {
  const connected = useSyncExternalStore(
    subscribe,
    () => memConnected,
    () => false,
  );
  const toolInput = useSyncExternalStore(
    subscribe,
    () => memToolInput,
    () => null,
  );
  const toolResult = useSyncExternalStore(
    subscribe,
    () => memToolResult,
    () => null,
  );

  return { app: singletonApp, connected, toolInput, toolResult };
}
