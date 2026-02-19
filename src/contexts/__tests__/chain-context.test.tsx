import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

// ── Hoisted mock state (available to vi.mock factories) ─────────────
const {
  mockSwitchChainAsync,
  mockToastError,
  mockState,
} = vi.hoisted(() => ({
  mockSwitchChainAsync: vi.fn(),
  mockToastError: vi.fn(),
  mockState: {
    walletChainId: undefined as number | undefined,
    isConnected: false,
    isPending: false,
  },
}));

// ── Wagmi mock ──────────────────────────────────────────────────────
vi.mock("wagmi", () => ({
  useAccount: () => ({
    chainId: mockState.walletChainId,
    isConnected: mockState.isConnected,
  }),
  useSwitchChain: () => ({
    switchChainAsync: mockSwitchChainAsync,
    isPending: mockState.isPending,
  }),
}));

// ── Sonner mock ─────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { error: mockToastError },
}));

// ── Import after mocks ─────────────────────────────────────────────
import { ChainProvider, useChain } from "@/contexts/chain-context";

// ── Helpers ─────────────────────────────────────────────────────────
function wrapper({ children }: { children: ReactNode }) {
  return <ChainProvider>{children}</ChainProvider>;
}

// ── Setup ───────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockState.walletChainId = undefined;
  mockState.isConnected = false;
  mockState.isPending = false;
  localStorage.clear();
});

describe("ChainContext", () => {
  describe("when wallet is connected", () => {
    it("calls switchChainAsync when setActiveChainId is called", async () => {
      mockState.isConnected = true;
      mockState.walletChainId = 8453;
      // Simulate real wallet: update walletChainId on successful switch
      mockSwitchChainAsync.mockImplementationOnce(async ({ chainId }: { chainId: number }) => {
        mockState.walletChainId = chainId;
      });

      const { result } = renderHook(() => useChain(), { wrapper });

      await act(async () => {
        await result.current.setActiveChainId(42161);
      });

      expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 42161 });
      expect(result.current.activeChain.chain.id).toBe(42161);
    });

    it("reverts chain and shows toast when switchChainAsync rejects", async () => {
      mockState.isConnected = true;
      mockState.walletChainId = 8453;
      mockSwitchChainAsync.mockRejectedValueOnce(new Error("User rejected"));

      const { result } = renderHook(() => useChain(), { wrapper });

      const initialChainId = result.current.activeChain.chain.id;

      await act(async () => {
        await result.current.setActiveChainId(42161);
      });

      expect(result.current.activeChain.chain.id).toBe(initialChainId);
      expect(mockToastError).toHaveBeenCalledWith("Failed to switch network");
    });

    it("does not update localStorage on failed switch", async () => {
      mockState.isConnected = true;
      mockState.walletChainId = 8453;
      localStorage.setItem("brevet-active-chain", "8453");
      mockSwitchChainAsync.mockRejectedValueOnce(new Error("rejected"));

      const { result } = renderHook(() => useChain(), { wrapper });

      await act(async () => {
        await result.current.setActiveChainId(42161);
      });

      expect(localStorage.getItem("brevet-active-chain")).toBe("8453");
    });
  });

  describe("when wallet is not connected", () => {
    it("updates state directly without calling switchChainAsync", async () => {
      mockState.isConnected = false;

      const { result } = renderHook(() => useChain(), { wrapper });

      await act(async () => {
        await result.current.setActiveChainId(42161);
      });

      expect(mockSwitchChainAsync).not.toHaveBeenCalled();
      expect(result.current.activeChain.chain.id).toBe(42161);
    });

    it("updates localStorage when no wallet is connected", async () => {
      mockState.isConnected = false;

      const { result } = renderHook(() => useChain(), { wrapper });

      await act(async () => {
        await result.current.setActiveChainId(42161);
      });

      expect(localStorage.getItem("brevet-active-chain")).toBe("42161");
    });
  });

  describe("wallet chain sync", () => {
    it("syncs active chain to wallet chain when wallet connects", () => {
      mockState.isConnected = true;
      mockState.walletChainId = 42161;

      const { result } = renderHook(() => useChain(), { wrapper });

      expect(result.current.activeChain.chain.id).toBe(42161);
    });

    it("syncs active chain when wallet chain changes externally", () => {
      mockState.isConnected = true;
      mockState.walletChainId = 8453;

      const { result, rerender } = renderHook(() => useChain(), { wrapper });

      expect(result.current.activeChain.chain.id).toBe(8453);

      mockState.walletChainId = 42161;
      rerender();

      expect(result.current.activeChain.chain.id).toBe(42161);
    });

    it("does not sync to unsupported chain IDs", () => {
      mockState.isConnected = true;
      mockState.walletChainId = 999999;

      const { result } = renderHook(() => useChain(), { wrapper });

      expect(result.current.activeChain.chain.id).not.toBe(999999);
    });
  });

  describe("isSwitchingChain", () => {
    it("reflects the pending state from useSwitchChain", () => {
      mockState.isPending = true;

      const { result } = renderHook(() => useChain(), { wrapper });

      expect(result.current.isSwitchingChain).toBe(true);
    });

    it("is false when no switch is pending", () => {
      mockState.isPending = false;

      const { result } = renderHook(() => useChain(), { wrapper });

      expect(result.current.isSwitchingChain).toBe(false);
    });
  });

  describe("ignores invalid chainId", () => {
    it("does nothing when setActiveChainId is called with an unsupported chain", async () => {
      mockState.isConnected = false;

      const { result } = renderHook(() => useChain(), { wrapper });

      const initialChainId = result.current.activeChain.chain.id;

      await act(async () => {
        await result.current.setActiveChainId(999999);
      });

      expect(result.current.activeChain.chain.id).toBe(initialChainId);
      expect(mockSwitchChainAsync).not.toHaveBeenCalled();
    });
  });

  describe("useChain outside provider", () => {
    it("throws when used outside ChainProvider", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        renderHook(() => useChain());
      }).toThrow("useChain must be used within a ChainProvider");

      consoleSpy.mockRestore();
    });
  });
});
