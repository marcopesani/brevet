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

function wrapperWithInitialChain(initialChainId: number) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ChainProvider initialChainId={initialChainId}>{children}</ChainProvider>
    );
  };
}

function wrapperWithEnabledChains(enabledChains: number[], initialChainId?: number) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ChainProvider enabledChains={enabledChains} initialChainId={initialChainId}>
        {children}
      </ChainProvider>
    );
  };
}

// ── Setup ───────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockState.walletChainId = undefined;
  mockState.isConnected = false;
  mockState.isPending = false;
  document.cookie = "";
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

    it("sets cookie when chain changes and no wallet", async () => {
      mockState.isConnected = false;

      const { result } = renderHook(() => useChain(), { wrapper });

      await act(async () => {
        await result.current.setActiveChainId(42161);
      });

      expect(document.cookie).toContain("brevet-active-chain=42161");
    });

    it("sets cookie with Secure attribute", async () => {
      mockState.isConnected = false;

      // JSDOM strips cookie attributes from reads, so spy on the setter to capture full string.
      const setCalls: string[] = [];
      const desc = Object.getOwnPropertyDescriptor(document, "cookie")
        ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(document), "cookie");
      const originalSetter = desc?.set;
      Object.defineProperty(document, "cookie", {
        get: desc?.get?.bind(document) ?? (() => ""),
        set(value: string) {
          setCalls.push(value);
          originalSetter?.call(document, value);
        },
        configurable: true,
      });

      const { result } = renderHook(() => useChain(), { wrapper });

      await act(async () => {
        await result.current.setActiveChainId(42161);
      });

      const chainCookieCall = setCalls.find((s) => s.includes("brevet-active-chain=42161"));
      expect(chainCookieCall).toBeDefined();
      expect(chainCookieCall).toContain("Secure");

      // Restore
      if (desc) Object.defineProperty(document, "cookie", desc);
    });
  });

  describe("initialChainId", () => {
    it("uses initialChainId when provided", () => {
      const { result } = renderHook(() => useChain(), {
        wrapper: wrapperWithInitialChain(42161),
      });

      expect(result.current.activeChain.chain.id).toBe(42161);
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

    it("does not sync to wallet chain outside user's enabled chains", () => {
      mockState.isConnected = true;
      mockState.walletChainId = 1; // Ethereum mainnet — supported but not enabled

      const { result } = renderHook(() => useChain(), {
        wrapper: wrapperWithEnabledChains([84532, 42161], 84532),
      });

      expect(result.current.activeChain.chain.id).toBe(84532);
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

  describe("enabledChains filtering", () => {
    it("filters supportedChains to only enabled chains", () => {
      const { result } = renderHook(() => useChain(), {
        wrapper: wrapperWithEnabledChains([8453, 42161]),
      });

      const chainIds = result.current.supportedChains.map((c) => c.chain.id);
      expect(chainIds).toEqual([8453, 42161]);
    });

    it("shows all chains when enabledChains is not provided", () => {
      const { result } = renderHook(() => useChain(), { wrapper });

      expect(result.current.supportedChains.length).toBeGreaterThan(2);
    });

    it("shows all chains when enabledChains is empty", () => {
      const { result } = renderHook(() => useChain(), {
        wrapper: wrapperWithEnabledChains([]),
      });

      expect(result.current.supportedChains.length).toBeGreaterThan(2);
    });

    it("auto-switches to first enabled chain when active chain is not enabled", () => {
      // Default chain is 8453 (Base), but we only enable Arbitrum
      const { result } = renderHook(() => useChain(), {
        wrapper: wrapperWithEnabledChains([42161]),
      });

      expect(result.current.activeChain.chain.id).toBe(42161);
    });

    it("keeps active chain if it is in the enabled set", () => {
      const { result } = renderHook(() => useChain(), {
        wrapper: wrapperWithEnabledChains([8453, 42161], 8453),
      });

      expect(result.current.activeChain.chain.id).toBe(8453);
    });

    it("initializes to first enabled testnet when initialChainId is mainnet and only testnets enabled", () => {
      const testnetIds = [84532, 11155111, 421614, 11155420, 80002];
      const { result } = renderHook(() => useChain(), {
        wrapper: wrapperWithEnabledChains(testnetIds, 8453),
      });

      // filteredChains follows allChains order (numeric key sort), so 80002 comes first
      expect(testnetIds).toContain(result.current.activeChain.chain.id);
      expect(result.current.activeChain.isTestnet).toBe(true);
    });

    it("initializes to first enabled chain when initialChainId is not in enabledChains", () => {
      const { result } = renderHook(() => useChain(), {
        wrapper: wrapperWithEnabledChains([42161], 8453),
      });

      expect(result.current.activeChain.chain.id).toBe(42161);
    });

    it("uses initialChainId when it is in enabledChains", () => {
      const { result } = renderHook(() => useChain(), {
        wrapper: wrapperWithEnabledChains([84532, 42161], 84532),
      });

      expect(result.current.activeChain.chain.id).toBe(84532);
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
