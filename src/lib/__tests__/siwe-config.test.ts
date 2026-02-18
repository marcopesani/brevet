import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth/react", () => ({
  getCsrfToken: vi.fn(),
  getSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@reown/appkit-siwe", () => ({
  formatMessage: vi.fn(
    (_args: unknown, address: string) => `formatted:${address}`,
  ),
  createSIWEConfig: vi.fn((config: unknown) => config),
}));

vi.mock("@/lib/walletconnect", () => ({
  networks: [{ id: 8453 }, { id: 84532 }],
}));

import { getCsrfToken, getSession, signIn, signOut } from "next-auth/react";
import { formatMessage } from "@reown/appkit-siwe";
import {
  getMessageParams,
  createSiweMessage,
  fetchNonce,
  fetchSession,
  verifySiweMessage,
  signOutSession,
} from "../siwe-config";

const mockGetCsrfToken = vi.mocked(getCsrfToken);
const mockGetSession = vi.mocked(getSession);
const mockSignIn = vi.mocked(signIn);
const mockSignOut = vi.mocked(signOut);
const mockFormatMessage = vi.mocked(formatMessage);

describe("getMessageParams", () => {
  it("returns correct domain, uri, chains, and statement", async () => {
    const params = await getMessageParams();

    // happy-dom includes port in host
    expect(params.domain).toBe(window.location.host);
    expect(params.uri).toBe(window.location.origin);
    expect(params.chains).toEqual([8453, 84532]);
    expect(params.statement).toBe("Please sign with your account");
  });
});

describe("createSiweMessage", () => {
  beforeEach(() => {
    mockFormatMessage.mockClear();
  });

  it("calls formatMessage with correct args", () => {
    const args = {
      address: "0xAbC123" as `0x${string}`,
      nonce: "abc",
      chainId: 1,
      version: "1" as const,
      iat: "now",
    };

    const result = createSiweMessage(args);

    expect(mockFormatMessage).toHaveBeenCalledWith(
      { nonce: "abc", chainId: 1, version: "1", iat: "now" },
      "0xAbC123",
    );
    expect(result).toBe("formatted:0xAbC123");
  });
});

describe("fetchNonce", () => {
  beforeEach(() => {
    mockGetCsrfToken.mockReset();
  });

  it("returns nonce from getCsrfToken", async () => {
    mockGetCsrfToken.mockResolvedValue("test-nonce");

    const nonce = await fetchNonce();

    expect(nonce).toBe("test-nonce");
  });

  it("throws when getCsrfToken returns null", async () => {
    mockGetCsrfToken.mockResolvedValue(null as unknown as string);

    await expect(fetchNonce()).rejects.toThrow("Failed to get nonce!");
  });

  it("throws when getCsrfToken returns undefined", async () => {
    mockGetCsrfToken.mockResolvedValue(undefined as unknown as string);

    await expect(fetchNonce()).rejects.toThrow("Failed to get nonce!");
  });
});

describe("fetchSession", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  it("returns address and chainId when session is valid", async () => {
    mockGetSession.mockResolvedValue({
      address: "0xabc",
      chainId: 1,
      expires: "",
    } as unknown as Awaited<ReturnType<typeof getSession>>);

    const session = await fetchSession();

    expect(session).toEqual({ address: "0xabc", chainId: 1 });
  });

  it("returns null when getSession returns null", async () => {
    mockGetSession.mockResolvedValue(null);

    const session = await fetchSession();

    expect(session).toBeNull();
  });

  it("returns null when address is not a string", async () => {
    mockGetSession.mockResolvedValue({
      address: 123,
      chainId: 1,
      expires: "",
    } as unknown as Awaited<ReturnType<typeof getSession>>);

    const session = await fetchSession();

    expect(session).toBeNull();
  });

  it("returns null when chainId is not a number", async () => {
    mockGetSession.mockResolvedValue({
      address: "0xabc",
      chainId: "1",
      expires: "",
    } as unknown as Awaited<ReturnType<typeof getSession>>);

    const session = await fetchSession();

    expect(session).toBeNull();
  });
});

describe("verifySiweMessage", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
  });

  it("calls signIn with correct params", async () => {
    mockSignIn.mockResolvedValue({ ok: true } as unknown as Awaited<ReturnType<typeof signIn>>);

    await verifySiweMessage({ message: "msg", signature: "sig" });

    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      message: "msg",
      redirect: false,
      signature: "sig",
      callbackUrl: "/dashboard",
    });
  });

  it("returns true when signIn returns ok: true", async () => {
    mockSignIn.mockResolvedValue({ ok: true } as unknown as Awaited<ReturnType<typeof signIn>>);

    const result = await verifySiweMessage({
      message: "msg",
      signature: "sig",
    });

    expect(result).toBe(true);
  });

  it("returns false when signIn returns ok: false", async () => {
    mockSignIn.mockResolvedValue({ ok: false } as unknown as Awaited<ReturnType<typeof signIn>>);

    const result = await verifySiweMessage({
      message: "msg",
      signature: "sig",
    });

    expect(result).toBe(false);
  });

  it("returns false when signIn throws", async () => {
    mockSignIn.mockRejectedValue(new Error("network error"));

    const result = await verifySiweMessage({
      message: "msg",
      signature: "sig",
    });

    expect(result).toBe(false);
  });
});

describe("signOutSession", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
  });

  it("calls signOut with redirect: false", async () => {
    mockSignOut.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof signOut>>);

    await signOutSession();

    expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
  });

  it("returns true on success", async () => {
    mockSignOut.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof signOut>>);

    const result = await signOutSession();

    expect(result).toBe(true);
  });

  it("returns false when signOut throws", async () => {
    mockSignOut.mockRejectedValue(new Error("signout failed"));

    const result = await signOutSession();

    expect(result).toBe(false);
  });
});
