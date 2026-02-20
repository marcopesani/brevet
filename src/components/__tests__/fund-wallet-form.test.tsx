import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Hoisted mock state (available to vi.mock factories) ─────────────
const {
  mockWriteContract,
  mockSwitchChainAsync,
  mockToastError,
  mockState,
} = vi.hoisted(() => ({
  mockWriteContract: vi.fn(),
  mockSwitchChainAsync: vi.fn(),
  mockToastError: vi.fn(),
  mockState: {
    walletChainId: 8453 as number | undefined,
  },
}));

// ── Wagmi mocks ─────────────────────────────────────────────────────
vi.mock("wagmi", () => ({
  useWriteContract: () => ({
    writeContract: mockWriteContract,
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
  }),
  useAccount: () => ({
    chainId: mockState.walletChainId,
    isConnected: true,
  }),
  useSwitchChain: () => ({
    switchChainAsync: mockSwitchChainAsync,
    isPending: false,
  }),
}));

// ── Sonner mock ─────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

// ── Import after mocks ─────────────────────────────────────────────
import FundWalletForm from "@/components/fund-wallet-form";

// ── Helpers ─────────────────────────────────────────────────────────
function renderForm(chainId?: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FundWalletForm
        accountAddress="0x1234567890123456789012345678901234567890"
        chainId={chainId}
      />
    </QueryClientProvider>,
  );
}

// ── Setup ───────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockState.walletChainId = 8453;
});

afterEach(() => {
  cleanup();
});

describe("FundWalletForm chain switch guard", () => {
  it("calls switchChainAsync before writeContract when wallet is on wrong chain", async () => {
    mockState.walletChainId = 8453;
    mockSwitchChainAsync.mockResolvedValueOnce(undefined);

    renderForm(42161);

    const amountInput = screen.getByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: "10" } });

    const fundButton = screen.getByRole("button", {
      name: /Fund Account/i,
    });
    fireEvent.click(fundButton);

    await waitFor(() => {
      expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 42161 });
    });

    await waitFor(() => {
      expect(mockWriteContract).toHaveBeenCalled();
    });
  });

  it("does not call switchChainAsync when wallet is already on correct chain", async () => {
    mockState.walletChainId = 8453;

    renderForm(8453);

    const amountInput = screen.getByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: "10" } });

    const fundButton = screen.getByRole("button", {
      name: /Fund Account/i,
    });
    fireEvent.click(fundButton);

    await waitFor(() => {
      expect(mockWriteContract).toHaveBeenCalled();
    });

    expect(mockSwitchChainAsync).not.toHaveBeenCalled();
  });

  it("shows toast error and does not call writeContract when chain switch is rejected", async () => {
    mockState.walletChainId = 8453;
    mockSwitchChainAsync.mockRejectedValueOnce(new Error("User rejected"));

    renderForm(42161);

    const amountInput = screen.getByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: "10" } });

    const fundButton = screen.getByRole("button", {
      name: /Fund Account/i,
    });
    fireEvent.click(fundButton);

    await waitFor(() => {
      expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 42161 });
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to switch network");
    });

    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it("uses default chain when no chainId prop is provided", async () => {
    mockState.walletChainId = 42161;
    mockSwitchChainAsync.mockResolvedValueOnce(undefined);

    renderForm(); // no chainId

    const amountInput = screen.getByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: "5" } });

    const fundButton = screen.getByRole("button", {
      name: /Fund Account/i,
    });
    fireEvent.click(fundButton);

    // Should switch to the default chain (84532 from NEXT_PUBLIC_CHAIN_ID in test setup)
    await waitFor(() => {
      expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 84532 });
    });
  });
});
