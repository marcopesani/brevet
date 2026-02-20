import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ── Hoisted mock state ──────────────────────────────────────────────
const { mockCreatePolicy, mockToastSuccess } = vi.hoisted(() => ({
  mockCreatePolicy: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock("@/app/actions/policies", () => ({
  createPolicy: mockCreatePolicy,
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess },
}));

// ── Import after mocks ─────────────────────────────────────────────
import { AddPolicyDialog } from "@/components/add-policy-dialog";

// ── Helpers ─────────────────────────────────────────────────────────
function renderDialog(onSuccess = vi.fn(), onOpenChange = vi.fn()) {
  return {
    onSuccess,
    onOpenChange,
    ...render(
      <AddPolicyDialog
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    ),
  };
}

// ── Setup ───────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("AddPolicyDialog", () => {
  it("shows toast and closes dialog on successful creation", async () => {
    mockCreatePolicy.mockResolvedValueOnce({
      success: true,
      policy: { id: "p1", endpointPattern: "https://api.example.com", autoSign: false },
    });

    const { onSuccess, onOpenChange } = renderDialog();

    const input = screen.getByPlaceholderText("https://api.example.com/*");
    fireEvent.change(input, { target: { value: "https://api.example.com" } });

    const submitButton = screen.getByRole("button", { name: "Create Policy" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Policy created");
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalled();
  });

  it("displays error message in dialog for duplicate policy", async () => {
    mockCreatePolicy.mockResolvedValueOnce({
      success: false,
      error: "A policy for this endpoint pattern already exists",
    });

    renderDialog();

    const input = screen.getByPlaceholderText("https://api.example.com/*");
    fireEvent.change(input, { target: { value: "https://api.example.com" } });

    const submitButton = screen.getByRole("button", { name: "Create Policy" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText("A policy for this endpoint pattern already exists"),
      ).toBeInTheDocument();
    });

    // Should NOT show toast or close dialog
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("displays fallback error message for unexpected errors", async () => {
    mockCreatePolicy.mockRejectedValueOnce(new Error("Network failure"));

    renderDialog();

    const input = screen.getByPlaceholderText("https://api.example.com/*");
    fireEvent.change(input, { target: { value: "https://api.example.com" } });

    const submitButton = screen.getByRole("button", { name: "Create Policy" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Failed to create policy")).toBeInTheDocument();
    });

    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
