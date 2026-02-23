import { testWithSynpress } from "@synthetixio/synpress";
import { MetaMask, metaMaskFixtures } from "@synthetixio/synpress/playwright";
import baseSepoliaSetup from "../wallet-setup/base-sepolia.setup";

export const test = testWithSynpress(metaMaskFixtures(baseSepoliaSetup));
export const { expect } = test;
export { MetaMask };
