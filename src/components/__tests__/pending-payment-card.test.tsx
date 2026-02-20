import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Hoisted mock state (available to vi.mock factories) ─────────────
const {
  mockSignTypedDataAsync,
  mockSwitchChainAsync,
  mockToastError,
  mockToastSuccess,
  mockApprovePendingPayment,
  mockState,
} = vi.hoisted(() => ({
  mockSignTypedDataAsync: vi.fn(),
  mockSwitchChainAsync: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockApprovePendingPayment: vi.fn().mockResolvedValue({ success: true }),
  mockState: {
    walletChainId: 8453 as number | undefined,
  },
}));

// ── Wagmi mocks ─────────────────────────────────────────────────────
vi.mock("wagmi", () => ({
  useSignTypedData: () => ({
    signTypedDataAsync: mockSignTypedDataAsync,
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
  toast: { error: mockToastError, success: mockToastSuccess },
}));

// ── Server action mocks ─────────────────────────────────────────────
vi.mock("@/app/actions/payments", () => ({
  approvePendingPayment: mockApprovePendingPayment,
  rejectPendingPayment: vi.fn().mockResolvedValue({ success: true }),
}));

// ── ChainContext mock ───────────────────────────────────────────────
vi.mock("@/contexts/chain-context", () => ({
  useChain: () => ({
    activeChain: {
      chain: { id: 8453, name: "Base" },
      usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      usdcDomain: {
        name: "USD Coin",
        version: "2",
        chainId: 8453,
        verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      },
      networkString: "eip155:8453",
      explorerUrl: "https://basescan.org",
    },
    setActiveChainId: vi.fn(),
    supportedChains: [],
    isSwitchingChain: false,
  }),
}));

// ── Import after mocks ─────────────────────────────────────────────
import PendingPaymentCard, {
  type PendingPayment,
} from "@/components/pending-payment-card";

// ── Helpers ─────────────────────────────────────────────────────────
const BASE_PAYMENT_REQUIREMENTS = JSON.stringify({
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      amount: "100000",
      payTo: "0x1234567890123456789012345678901234567890",
    },
  ],
});

const ARB_PAYMENT_REQUIREMENTS = JSON.stringify({
  accepts: [
    {
      scheme: "exact",
      network: "eip155:42161",
      amount: "100000",
      payTo: "0x1234567890123456789012345678901234567890",
    },
  ],
});

// Plain chain name (e.g. Zapper returns "base" instead of "eip155:8453")
const BASE_PLAIN_NETWORK_REQUIREMENTS = JSON.stringify({
  accepts: [
    {
      scheme: "exact",
      network: "base",
      amount: "1100",
      payTo: "0x43a2a720cd0911690c248075f4a29a5e7716f758",
    },
  ],
});

function createPayment(overrides: Partial<PendingPayment> = {}): PendingPayment {
  return {
    id: "pay-1",
    url: "https://api.example.com/resource",
    amount: 0.1,
    chainId: 8453,
    paymentRequirements: BASE_PAYMENT_REQUIREMENTS,
    status: "pending",
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderCard(payment: PendingPayment, onAction = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PendingPaymentCard
        payment={payment}
        walletAddress="0xWalletAddress1234567890123456789012345678"
        disabled={false}
        onAction={onAction}
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

describe("PendingPaymentCard chain switch guard", () => {
  it("calls switchChainAsync before signing when wallet is on wrong chain", async () => {
    mockState.walletChainId = 8453;
    const payment = createPayment({
      chainId: 42161,
      paymentRequirements: ARB_PAYMENT_REQUIREMENTS,
    });

    mockSwitchChainAsync.mockResolvedValueOnce(undefined);
    mockSignTypedDataAsync.mockResolvedValueOnce("0xsignature");

    renderCard(payment);

    const approveButtons = screen.getAllByRole("button");
    const approveButton = approveButtons.find((b) => b.textContent?.includes("Approve"));
    fireEvent.click(approveButton!);

    await waitFor(() => {
      expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 42161 });
    });

    await waitFor(() => {
      expect(mockSignTypedDataAsync).toHaveBeenCalled();
    });
  });

  it("does not call switchChainAsync when wallet is already on correct chain", async () => {
    mockState.walletChainId = 8453;
    const payment = createPayment({
      chainId: 8453,
      paymentRequirements: BASE_PAYMENT_REQUIREMENTS,
    });

    mockSignTypedDataAsync.mockResolvedValueOnce("0xsignature");

    renderCard(payment);

    const approveButtons = screen.getAllByRole("button");
    const approveButton = approveButtons.find((b) => b.textContent?.includes("Approve"));
    fireEvent.click(approveButton!);

    await waitFor(() => {
      expect(mockSignTypedDataAsync).toHaveBeenCalled();
    });

    expect(mockSwitchChainAsync).not.toHaveBeenCalled();
  });

  it("shows toast error and does not sign when chain switch is rejected", async () => {
    mockState.walletChainId = 8453;
    const payment = createPayment({
      chainId: 42161,
      paymentRequirements: ARB_PAYMENT_REQUIREMENTS,
    });

    mockSwitchChainAsync.mockRejectedValueOnce(new Error("User rejected"));

    renderCard(payment);

    const approveButtons = screen.getAllByRole("button");
    const approveButton = approveButtons.find((b) => b.textContent?.includes("Approve"));
    fireEvent.click(approveButton!);

    await waitFor(() => {
      expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 42161 });
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to switch network");
    });

    expect(mockSignTypedDataAsync).not.toHaveBeenCalled();
  });
});

describe("PendingPaymentCard payment requirement network match", () => {
  it("accepts requirement with plain network name (e.g. base) and proceeds to sign", async () => {
    const payment = createPayment({
      chainId: 8453,
      paymentRequirements: BASE_PLAIN_NETWORK_REQUIREMENTS,
    });

    mockSignTypedDataAsync.mockResolvedValueOnce("0xsignature");

    renderCard(payment);

    const approveButtons = screen.getAllByRole("button");
    const approveButton = approveButtons.find((b) => b.textContent?.includes("Approve"));
    fireEvent.click(approveButton!);

    await waitFor(() => {
      expect(mockSignTypedDataAsync).toHaveBeenCalled();
    });

    expect(mockApprovePendingPayment).toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalledWith("No supported payment requirement found");
  });
});
