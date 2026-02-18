import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock viem before importing the module under test
vi.mock("viem", () => {
  const mockVerifyMessage = vi.fn();
  return {
    createPublicClient: vi.fn(() => ({
      verifyMessage: mockVerifyMessage,
    })),
    http: vi.fn((url: string) => url),
    __mockVerifyMessage: mockVerifyMessage,
  };
});

vi.mock("@reown/appkit-siwe", () => ({
  getAddressFromMessage: vi.fn(),
  getChainIdFromMessage: vi.fn(),
}));

vi.mock("@/lib/hot-wallet", () => ({
  createHotWallet: vi.fn(() => ({
    address: "0xhotwallet",
    encryptedPrivateKey: "encrypted-key",
  })),
}));

import { createPublicClient, http } from "viem";
import { createHotWallet } from "@/lib/hot-wallet";
import { User } from "@/lib/models/user";
import { HotWallet } from "@/lib/models/hot-wallet";
import {
  extractCredentials,
  verifySignature,
  upsertUser,
  authOptions,
} from "../auth-config";
import { resetTestDb } from "../../test/helpers/db";

// Access the mock verifyMessage function
const mockVerifyMessage = (
  (await import("viem")) as unknown as { __mockVerifyMessage: ReturnType<typeof vi.fn> }
).__mockVerifyMessage;

describe("extractCredentials", () => {
  it("returns message and signature when both are provided", () => {
    const result = extractCredentials({
      message: "hello",
      signature: "0xsig",
    });
    expect(result).toEqual({ message: "hello", signature: "0xsig" });
  });

  it("throws when credentials is undefined", () => {
    expect(() => extractCredentials(undefined)).toThrow(
      "Missing message or signature",
    );
  });

  it("throws when message is missing", () => {
    expect(() => extractCredentials({ signature: "0xsig" })).toThrow(
      "Missing message or signature",
    );
  });

  it("throws when signature is missing", () => {
    expect(() => extractCredentials({ message: "hello" })).toThrow(
      "Missing message or signature",
    );
  });

  it("throws when message is empty string", () => {
    expect(() =>
      extractCredentials({ message: "", signature: "0xsig" }),
    ).toThrow("Missing message or signature");
  });

  it("throws when signature is empty string", () => {
    expect(() =>
      extractCredentials({ message: "hello", signature: "" }),
    ).toThrow("Missing message or signature");
  });
});

describe("verifySignature", () => {
  beforeEach(() => {
    vi.mocked(createPublicClient).mockClear();
    mockVerifyMessage.mockReset();
    vi.mocked(http).mockClear();
  });

  it("returns true for a valid signature", async () => {
    mockVerifyMessage.mockResolvedValue(true);

    const result = await verifySignature(
      "siwe message",
      "0xAbC123",
      "0xsignature",
      "eip155:1",
    );

    expect(result).toBe(true);
    expect(mockVerifyMessage).toHaveBeenCalledWith({
      message: "siwe message",
      address: "0xAbC123",
      signature: "0xsignature",
    });
  });

  it("returns false for an invalid signature", async () => {
    mockVerifyMessage.mockResolvedValue(false);

    const result = await verifySignature(
      "siwe message",
      "0xAbC123",
      "0xbadsig",
      "eip155:1",
    );

    expect(result).toBe(false);
  });

  it("uses WalletConnect RPC URL with chainId and projectId", async () => {
    mockVerifyMessage.mockResolvedValue(true);

    await verifySignature("msg", "0xAddr", "0xsig", "eip155:84532");

    expect(http).toHaveBeenCalledWith(
      expect.stringContaining("chainId=eip155:84532"),
    );
    expect(http).toHaveBeenCalledWith(
      expect.stringContaining("projectId=test-project-id"),
    );
    expect(http).toHaveBeenCalledWith(
      expect.stringContaining("rpc.walletconnect.org"),
    );
  });
});

describe("upsertUser", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.mocked(createHotWallet).mockClear();
  });

  it("returns existing user when found", async () => {
    // Seed a user and hot wallet directly in the in-memory DB
    const existingUser = await User.create({
      walletAddress: "0xexisting",
    });
    await HotWallet.create({
      address: "0xhot",
      encryptedPrivateKey: "enc",
      userId: existingUser._id,
    });

    const user = await upsertUser("0xexisting");

    expect(user.id).toBe(existingUser.id);
    expect(user.walletAddress).toBe("0xexisting");
    expect(createHotWallet).not.toHaveBeenCalled();
  });

  it("creates new user with hot wallet for new address", async () => {
    const user = await upsertUser("0xnewuser");

    expect(user.walletAddress).toBe("0xnewuser");
    expect(createHotWallet).toHaveBeenCalledOnce();

    // Verify user was created in the database
    const userCount = await User.countDocuments();
    expect(userCount).toBe(1);

    // Verify hot wallet was created
    const hotWallet = await HotWallet.findOne({ userId: user._id }).lean();
    expect(hotWallet).not.toBeNull();
    expect(hotWallet!.address).toBe("0xhotwallet");
  });
});

describe("authOptions callbacks", () => {
  const jwtCallback = authOptions.callbacks!.jwt as (params: { token: Record<string, unknown>; user?: { id: string; address: string; chainId: number } }) => Record<string, unknown>;
  const sessionCallback = authOptions.callbacks!.session as (params: { session: Record<string, unknown>; token: Record<string, unknown> }) => Record<string, unknown>;

  describe("jwt callback", () => {
    it("sets userId, address, chainId on token when user is provided", () => {
      const token: Record<string, unknown> = { sub: "sub-1" };
      const user = { id: "user-1", address: "0xabc", chainId: 1 };

      const result = jwtCallback({ token, user });

      expect(result.userId).toBe("user-1");
      expect(result.address).toBe("0xabc");
      expect(result.chainId).toBe(1);
    });

    it("returns token unchanged when no user is provided", () => {
      const token: Record<string, unknown> = {
        sub: "sub-1",
        userId: "existing",
        address: "0xold",
        chainId: 42,
      };

      const result = jwtCallback({ token, user: undefined });

      expect(result.userId).toBe("existing");
      expect(result.address).toBe("0xold");
      expect(result.chainId).toBe(42);
    });
  });

  describe("session callback", () => {
    it("enriches session with userId, address, chainId from token", () => {
      const session: Record<string, unknown> = {};
      const token: Record<string, unknown> = {
        userId: "user-1",
        address: "0xabc",
        chainId: 1,
      };

      const result = sessionCallback({ session, token });

      expect(result.userId).toBe("user-1");
      expect(result.address).toBe("0xabc");
      expect(result.chainId).toBe(1);
    });
  });
});
