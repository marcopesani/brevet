import { describe, it, expect } from "vitest";
import {
  getCursorDeeplink,
  getVSCodeDeeplink,
  getClaudeCodeCommand,
  getClaudeDesktopConfig,
  getClaudeDesktopConfigPath,
  getWindsurfConfig,
  getWindsurfConfigPath,
  getUniversalCommand,
  getChatGPTInstructions,
  MCP_CLIENTS,
} from "../mcp-install";

const TEST_MCP_URL = "https://brevet.example.com/api/mcp/abc123";
const TEST_API_KEY = "brv_test1234567890abcdef";

describe("MCP_CLIENTS", () => {
  it("defines all expected clients", () => {
    const ids = MCP_CLIENTS.map((c) => c.id);
    expect(ids).toEqual([
      "cursor",
      "vscode",
      "claude-code",
      "claude-desktop",
      "chatgpt",
      "windsurf",
      "universal",
    ]);
  });

  it("marks cursor and vscode as deeplink-capable", () => {
    const deeplinkClients = MCP_CLIENTS.filter((c) => c.hasDeeplink);
    expect(deeplinkClients.map((c) => c.id)).toEqual(["cursor", "vscode"]);
  });
});

describe("getCursorDeeplink", () => {
  it("generates a valid cursor:// deeplink", () => {
    const url = getCursorDeeplink(TEST_MCP_URL, TEST_API_KEY);
    expect(url).toMatch(/^cursor:\/\/anysphere\.cursor\.code\/mcp\/install\?/);
  });

  it("includes the MCP URL as a parameter", () => {
    const url = getCursorDeeplink(TEST_MCP_URL, TEST_API_KEY);
    expect(url).toContain(`url=${encodeURIComponent(TEST_MCP_URL)}`);
  });

  it("includes the server name", () => {
    const url = getCursorDeeplink(TEST_MCP_URL, TEST_API_KEY);
    expect(url).toContain("name=brevet");
  });

  it("includes authorization headers", () => {
    const url = getCursorDeeplink(TEST_MCP_URL, TEST_API_KEY);
    const parsed = new URL(url);
    const headers = JSON.parse(parsed.searchParams.get("headers")!);
    expect(headers).toEqual({
      Authorization: `Bearer ${TEST_API_KEY}`,
    });
  });
});

describe("getVSCodeDeeplink", () => {
  it("generates a valid vscode:// deeplink", () => {
    const url = getVSCodeDeeplink(TEST_MCP_URL, TEST_API_KEY);
    expect(url).toMatch(
      /^vscode:\/\/modelcontextprotocol\.mcp\/install\?/
    );
  });

  it("includes the MCP URL as a parameter", () => {
    const url = getVSCodeDeeplink(TEST_MCP_URL, TEST_API_KEY);
    expect(url).toContain(`url=${encodeURIComponent(TEST_MCP_URL)}`);
  });

  it("includes authorization headers", () => {
    const url = getVSCodeDeeplink(TEST_MCP_URL, TEST_API_KEY);
    const parsed = new URL(url);
    const headers = JSON.parse(parsed.searchParams.get("headers")!);
    expect(headers).toEqual({
      Authorization: `Bearer ${TEST_API_KEY}`,
    });
  });
});

describe("getClaudeCodeCommand", () => {
  it("returns a claude mcp add command", () => {
    const cmd = getClaudeCodeCommand(TEST_MCP_URL, TEST_API_KEY);
    expect(cmd).toContain("claude mcp add brevet");
  });

  it("includes the transport flag", () => {
    const cmd = getClaudeCodeCommand(TEST_MCP_URL, TEST_API_KEY);
    expect(cmd).toContain("--transport http");
  });

  it("includes the MCP URL", () => {
    const cmd = getClaudeCodeCommand(TEST_MCP_URL, TEST_API_KEY);
    expect(cmd).toContain(TEST_MCP_URL);
  });

  it("includes the authorization header", () => {
    const cmd = getClaudeCodeCommand(TEST_MCP_URL, TEST_API_KEY);
    expect(cmd).toContain(`Bearer ${TEST_API_KEY}`);
  });
});

describe("getClaudeDesktopConfig", () => {
  it("returns valid JSON", () => {
    const config = getClaudeDesktopConfig(TEST_MCP_URL, TEST_API_KEY);
    expect(() => JSON.parse(config)).not.toThrow();
  });

  it("has the correct structure with mcpServers.brevet", () => {
    const config = JSON.parse(getClaudeDesktopConfig(TEST_MCP_URL, TEST_API_KEY));
    expect(config.mcpServers.brevet).toBeDefined();
    expect(config.mcpServers.brevet.url).toBe(TEST_MCP_URL);
  });

  it("includes authorization header", () => {
    const config = JSON.parse(getClaudeDesktopConfig(TEST_MCP_URL, TEST_API_KEY));
    expect(config.mcpServers.brevet.headers.Authorization).toBe(
      `Bearer ${TEST_API_KEY}`
    );
  });
});

describe("getClaudeDesktopConfigPath", () => {
  it("returns macOS path", () => {
    expect(getClaudeDesktopConfigPath("mac")).toContain(
      "Library/Application Support/Claude"
    );
  });

  it("returns Windows path", () => {
    expect(getClaudeDesktopConfigPath("windows")).toContain("%APPDATA%");
  });

  it("returns Linux path", () => {
    expect(getClaudeDesktopConfigPath("linux")).toContain(".config/Claude");
  });
});

describe("getWindsurfConfig", () => {
  it("returns valid JSON", () => {
    const config = getWindsurfConfig(TEST_MCP_URL, TEST_API_KEY);
    expect(() => JSON.parse(config)).not.toThrow();
  });

  it("has the correct structure with mcpServers.brevet", () => {
    const config = JSON.parse(getWindsurfConfig(TEST_MCP_URL, TEST_API_KEY));
    expect(config.mcpServers.brevet).toBeDefined();
    expect(config.mcpServers.brevet.url).toBe(TEST_MCP_URL);
  });

  it("includes authorization header", () => {
    const config = JSON.parse(getWindsurfConfig(TEST_MCP_URL, TEST_API_KEY));
    expect(config.mcpServers.brevet.headers.Authorization).toBe(
      `Bearer ${TEST_API_KEY}`
    );
  });
});

describe("getWindsurfConfigPath", () => {
  it("returns macOS path", () => {
    expect(getWindsurfConfigPath("mac")).toContain(".codeium/windsurf");
  });

  it("returns Windows path", () => {
    expect(getWindsurfConfigPath("windows")).toContain(
      "%USERPROFILE%\\.codeium\\windsurf"
    );
  });

  it("returns Linux path", () => {
    expect(getWindsurfConfigPath("linux")).toContain(".codeium/windsurf");
  });
});

describe("getUniversalCommand", () => {
  it("returns an npx add-mcp command", () => {
    const cmd = getUniversalCommand(TEST_MCP_URL, TEST_API_KEY);
    expect(cmd).toContain("npx add-mcp brevet");
  });

  it("includes the MCP URL", () => {
    const cmd = getUniversalCommand(TEST_MCP_URL, TEST_API_KEY);
    expect(cmd).toContain(TEST_MCP_URL);
  });

  it("includes the authorization header", () => {
    const cmd = getUniversalCommand(TEST_MCP_URL, TEST_API_KEY);
    expect(cmd).toContain(`Bearer ${TEST_API_KEY}`);
  });
});

describe("getChatGPTInstructions", () => {
  it("returns an array of steps", () => {
    const steps = getChatGPTInstructions();
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
  });

  it("each step is a non-empty string", () => {
    const steps = getChatGPTInstructions();
    for (const step of steps) {
      expect(typeof step).toBe("string");
      expect(step.length).toBeGreaterThan(0);
    }
  });
});
