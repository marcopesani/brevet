/**
 * Deterministic human-readable hash from MongoDB ObjectId.
 *
 * Algorithm: 12-byte ObjectId → interleave bytes across 4 segments (byte j → segment j % 4) →
 * XOR-fold each segment to 1 byte (0–255) → map to wordlist → join with "_"
 */

// 256 crypto/web3/DeFi themed words — lowercase, alphabetic only.
// Designed to produce amusing combinations like "rekt_whale_paperhands_copium".
export const WORDLIST: readonly string[] = [
  // 0–15
  "satoshi", "vitalik", "nakamoto", "whale", "diamond", "moon", "lambo", "hodl",
  "rekt", "degen", "ape", "fomo", "shill", "airdrop", "rug", "gwei",
  // 16–31
  "wagmi", "ngmi", "copium", "hopium", "alpha", "beta", "sigma", "chad",
  "based", "bullish", "bearish", "crab", "pump", "dump", "mint", "burn",
  // 32–47
  "stake", "yield", "farm", "pool", "swap", "bridge", "wrap", "unwrap",
  "lock", "vest", "claim", "harvest", "compound", "leverage", "margin", "short",
  // 48–63
  "long", "spot", "futures", "perps", "oracle", "keeper", "vault", "safe",
  "multisig", "keystore", "ledger", "trezor", "seed", "mnemonic", "entropy", "nonce",
  // 64–79
  "block", "epoch", "slot", "shard", "rollup", "blob", "calldata", "opcode",
  "bytecode", "solidity", "vyper", "remix", "hardhat", "foundry", "truffle", "ganache",
  // 80–95
  "mainnet", "testnet", "devnet", "mempool", "gossip", "finality", "reorg", "fork",
  "merge", "surge", "verge", "purge", "splurge", "danksharding", "proposer", "validator",
  // 96–111
  "slashing", "beacon", "genesis", "consensus", "staking", "restaking", "eigen", "liquid",
  "wrapped", "pegged", "stable", "volatile", "impermanent", "divergence", "slippage", "sandwich",
  // 112–127
  "frontrun", "backrun", "arbitrage", "flashloan", "liquidated", "underwater", "insolvent", "bankrupt",
  "depegged", "exploited", "drained", "hacked", "phished", "rugged", "scammed", "honeypot",
  // 128–143
  "bagholder", "paperhands", "stonehands", "flipper", "sniper", "grinder", "farmer", "looper",
  "bridger", "minter", "burner", "staker", "trader", "bidder", "seller", "buyer",
  // 144–159
  "goblin", "gremlin", "wizard", "shaman", "druid", "paladin", "knight", "samurai",
  "ninja", "pirate", "viking", "spartan", "titan", "phoenix", "dragon", "kraken",
  // 160–175
  "unicorn", "pegasus", "griffin", "basilisk", "chimera", "hydra", "cerberus", "minotaur",
  "cyclops", "golem", "sphinx", "sentinel", "prophet", "mystic", "alchemist", "sorcerer",
  // 176–191
  "cosmic", "stellar", "lunar", "solar", "nebula", "quasar", "pulsar", "photon",
  "neutron", "proton", "quantum", "plasma", "fusion", "fission", "antimatter", "darkpool",
  // 192–207
  "origin", "exodus", "zenith", "nadir", "apex", "summit", "abyss", "void",
  "nexus", "matrix", "cipher", "enigma", "riddle", "puzzle", "labyrinth", "maze",
  // 208–223
  "thunder", "lightning", "tornado", "tempest", "tsunami", "avalanche", "blizzard", "inferno",
  "magma", "obsidian", "emerald", "sapphire", "ruby", "topaz", "onyx", "opal",
  // 224–239
  "iron", "steel", "chrome", "cobalt", "titanium", "platinum", "osmium", "iridium",
  "rhodium", "palladium", "bismuth", "mercury", "radium", "thorium", "uranium", "plutonium",
  // 240–255
  "gigabrain", "turbo", "hyper", "mega", "ultra", "supreme", "absolute", "infinite",
  "eternal", "immortal", "legendary", "mythical", "ascended", "transcendent", "omniscient", "godlike",
] as const;

/**
 * Generate a human-readable hash from raw bytes.
 * Interleaves bytes across 4 segments (byte j → segment j % 4),
 * XOR-folds each segment to 1 byte, maps to wordlist.
 */
export function humanHashFromBytes(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    throw new Error("humanHashFromBytes: input must not be empty");
  }

  const folded = [0, 0, 0, 0];
  for (let j = 0; j < bytes.length; j++) {
    folded[j % 4] ^= bytes[j];
  }

  return folded.map((b) => WORDLIST[b]).join("_");
}

/**
 * Generate a deterministic human-readable hash from a MongoDB ObjectId hex string.
 *
 * @param objectIdHex - 24-character hex string (12 bytes)
 * @returns 4-word snake_case string, e.g. "satoshi_whale_diamond_rekt"
 */
export function humanHash(objectIdHex: string): string {
  if (objectIdHex.length !== 24 || !/^[0-9a-f]+$/i.test(objectIdHex)) {
    throw new Error(
      `humanHash: expected 24-character hex string, got "${objectIdHex}"`
    );
  }

  const bytes = new Uint8Array(12);
  for (let i = 0; i < 12; i++) {
    bytes[i] = parseInt(objectIdHex.slice(i * 2, i * 2 + 2), 16);
  }

  return humanHashFromBytes(bytes);
}
