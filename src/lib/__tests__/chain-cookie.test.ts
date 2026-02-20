import { describe, it, expect } from "vitest";
import {
  getInitialChainIdFromCookie,
  CHAIN_COOKIE_NAME,
} from "@/lib/chain-cookie";
import { getDefaultChainConfig } from "@/lib/chain-config";

describe("getInitialChainIdFromCookie", () => {
  const defaultChainId = getDefaultChainConfig().chain.id;

  it("returns default chain ID when cookie header is null", () => {
    expect(getInitialChainIdFromCookie(null)).toBe(defaultChainId);
  });

  it("returns default chain ID when cookie header is empty string", () => {
    expect(getInitialChainIdFromCookie("")).toBe(defaultChainId);
  });

  it("returns default chain ID when cookie is missing", () => {
    expect(getInitialChainIdFromCookie("other=value")).toBe(defaultChainId);
  });

  it("returns chain ID when valid cookie is present", () => {
    expect(getInitialChainIdFromCookie(`${CHAIN_COOKIE_NAME}=42161`)).toBe(
      42161,
    );
    expect(getInitialChainIdFromCookie(`${CHAIN_COOKIE_NAME}=84532`)).toBe(
      84532,
    );
  });

  it("returns chain ID when cookie appears among others", () => {
    const header = `session=abc; ${CHAIN_COOKIE_NAME}=8453; path=/`;
    expect(getInitialChainIdFromCookie(header)).toBe(8453);
  });

  it("returns default chain ID when value is not a supported chain", () => {
    expect(getInitialChainIdFromCookie(`${CHAIN_COOKIE_NAME}=999999`)).toBe(
      defaultChainId,
    );
  });

  it("returns default chain ID when value is not numeric", () => {
    expect(
      getInitialChainIdFromCookie(`${CHAIN_COOKIE_NAME}=base`),
    ).toBe(defaultChainId);
  });
});
