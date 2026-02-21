import { describe, it, expect } from "vitest";
import { humanHash, humanHashFromBytes, WORDLIST } from "../human-hash";

describe("WORDLIST validation", () => {
  it("has exactly 256 entries", () => {
    expect(WORDLIST).toHaveLength(256);
  });

  it("has no duplicates", () => {
    const unique = new Set(WORDLIST);
    expect(unique.size).toBe(256);
  });

  it("contains only lowercase alphabetic strings", () => {
    for (const word of WORDLIST) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it("has no empty strings", () => {
    for (const word of WORDLIST) {
      expect(word.length).toBeGreaterThan(0);
    }
  });
});

describe("humanHash — determinism", () => {
  it("returns the same hash for the same ObjectId hex (10 calls)", () => {
    const hex = "507f1f77bcf86cd799439011";
    const first = humanHash(hex);
    for (let i = 0; i < 10; i++) {
      expect(humanHash(hex)).toBe(first);
    }
  });

  it("returns different hashes for different ObjectId hex strings", () => {
    const a = humanHash("507f1f77bcf86cd799439011");
    const b = humanHash("607f1f77bcf86cd799439012");
    expect(a).not.toBe(b);
  });
});

describe("humanHash — format", () => {
  it("outputs 4 words joined by underscores, all lowercase", () => {
    const hash = humanHash("507f1f77bcf86cd799439011");
    expect(hash).toMatch(/^[a-z]+_[a-z]+_[a-z]+_[a-z]+$/);
  });

  it("each word exists in WORDLIST", () => {
    const hash = humanHash("507f1f77bcf86cd799439011");
    const words = hash.split("_");
    const wordSet = new Set<string>(WORDLIST);
    for (const word of words) {
      expect(wordSet.has(word)).toBe(true);
    }
  });
});

describe("humanHash — collision resistance", () => {
  it("has zero collisions across 100,000 random ObjectId hex strings", () => {
    // Use a seeded PRNG for deterministic results.
    // With Math.random(), birthday paradox predicts ~1.2 collisions per 100K
    // inputs in a 256^4 space, making the test flaky.
    let seed = 0;
    function nextByte(): number {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) & 0xff;
    }

    const hashes = new Set<string>();
    const count = 100_000;

    for (let i = 0; i < count; i++) {
      const bytes = new Uint8Array(12);
      for (let j = 0; j < 12; j++) {
        bytes[j] = nextByte();
      }
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      hashes.add(humanHash(hex));
    }

    const collisions = count - hashes.size;
    expect(collisions).toBe(0);
  });

  it("sequential ObjectIds produce 1,000 unique hashes from 1,000 sequential IDs", () => {
    // ObjectId structure: 4-byte timestamp | 5-byte random | 3-byte counter
    // With byte interleaving (byte j → segment j % 4), counter bytes [9,10,11]
    // are spread across segments 1, 2, and 3 — so incrementing the counter
    // changes 3 out of 4 segments, giving far more than 256 unique hashes.
    const timestamp = "65a1b2c3"; // 4 bytes
    const random = "aabbccddee"; // 5 bytes
    const hashes = new Set<string>();

    for (let counter = 0; counter < 1_000; counter++) {
      const counterHex = counter.toString(16).padStart(6, "0"); // 3 bytes
      const hex = timestamp + random + counterHex;
      hashes.add(humanHash(hex));
    }

    expect(hashes.size).toBe(1_000);
  });

  it("produces zero collisions for ObjectIds sharing timestamp but differing in random/counter bytes", () => {
    const timestamp = "65a1b2c3"; // shared 4-byte timestamp
    const hashes = new Set<string>();

    for (let i = 0; i < 1_000; i++) {
      // Different random (5 bytes) + counter (3 bytes) each iteration
      const suffix = new Uint8Array(8);
      for (let j = 0; j < 8; j++) {
        suffix[j] = Math.floor(Math.random() * 256);
      }
      const suffixHex = Array.from(suffix)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      hashes.add(humanHash(timestamp + suffixHex));
    }

    const collisions = 1_000 - hashes.size;
    expect(collisions).toBe(0);
  });
});

describe("humanHash — edge cases", () => {
  it("handles all-zero ObjectId", () => {
    const hash = humanHash("000000000000000000000000");
    expect(hash).toMatch(/^[a-z]+_[a-z]+_[a-z]+_[a-z]+$/);
    // All zeros XOR-fold to 0 for each segment → WORDLIST[0] four times
    expect(hash).toBe(`${WORDLIST[0]}_${WORDLIST[0]}_${WORDLIST[0]}_${WORDLIST[0]}`);
  });

  it("handles all-FF ObjectId", () => {
    const hash = humanHash("ffffffffffffffffffffffff");
    expect(hash).toMatch(/^[a-z]+_[a-z]+_[a-z]+_[a-z]+$/);
    // Each segment: 0xFF ^ 0xFF ^ 0xFF = 0xFF (3 bytes XOR-folded)
    expect(hash).toBe(`${WORDLIST[255]}_${WORDLIST[255]}_${WORDLIST[255]}_${WORDLIST[255]}`);
  });

  it("produces different hashes for single-bit differences", () => {
    const base = "507f1f77bcf86cd799439011";
    // Flip the lowest bit of the first byte: 50 → 51
    const flipped = "517f1f77bcf86cd799439011";
    expect(humanHash(base)).not.toBe(humanHash(flipped));
  });

  it("rejects non-hex strings", () => {
    expect(() => humanHash("zzzzzzzzzzzzzzzzzzzzzzzz")).toThrow();
  });

  it("rejects wrong-length hex strings", () => {
    expect(() => humanHash("507f1f77")).toThrow();
    expect(() => humanHash("507f1f77bcf86cd799439011aa")).toThrow();
  });
});

describe("humanHash — wordlist coverage", () => {
  it("all 256 words are reachable", () => {
    const seen = new Set<string>();
    let attempts = 0;
    const maxAttempts = 500_000;

    while (seen.size < 256 && attempts < maxAttempts) {
      const bytes = new Uint8Array(12);
      for (let j = 0; j < 12; j++) {
        bytes[j] = Math.floor(Math.random() * 256);
      }
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const words = humanHash(hex).split("_");
      for (const w of words) {
        seen.add(w);
      }
      attempts++;
    }

    expect(seen.size).toBe(256);
  });
});

describe("humanHashFromBytes", () => {
  it("produces a known output for a known input (test vector)", () => {
    // 4 bytes: [0, 1, 2, 3] → segmentSize = 1 byte each
    // Segment 0: 0 → WORDLIST[0]
    // Segment 1: 1 → WORDLIST[1]
    // Segment 2: 2 → WORDLIST[2]
    // Segment 3: 3 → WORDLIST[3]
    const bytes = new Uint8Array([0, 1, 2, 3]);
    const result = humanHashFromBytes(bytes);
    expect(result).toBe(`${WORDLIST[0]}_${WORDLIST[1]}_${WORDLIST[2]}_${WORDLIST[3]}`);
  });

  it("produces 4-word output for 4-byte input", () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);
    const result = humanHashFromBytes(bytes);
    const words = result.split("_");
    expect(words).toHaveLength(4);
    expect(result).toBe(`${WORDLIST[10]}_${WORDLIST[20]}_${WORDLIST[30]}_${WORDLIST[40]}`);
  });

  it("XOR-folds 12 bytes into 4 words (interleaved: byte j → segment j % 4)", () => {
    // 12 bytes interleaved across 4 segments:
    // Segment 0 (j%4=0): bytes[0]=0xAA, bytes[4]=0x22, bytes[8]=0xFF → 0xAA ^ 0x22 ^ 0xFF = 0x77 (119)
    // Segment 1 (j%4=1): bytes[1]=0xBB, bytes[5]=0x33, bytes[9]=0x01 → 0xBB ^ 0x33 ^ 0x01 = 0x89 (137)
    // Segment 2 (j%4=2): bytes[2]=0xCC, bytes[6]=0xFF, bytes[10]=0x02 → 0xCC ^ 0xFF ^ 0x02 = 0x31 (49)
    // Segment 3 (j%4=3): bytes[3]=0x11, bytes[7]=0x00, bytes[11]=0x04 → 0x11 ^ 0x00 ^ 0x04 = 0x15 (21)
    const bytes = new Uint8Array([0xAA, 0xBB, 0xCC, 0x11, 0x22, 0x33, 0xFF, 0x00, 0xFF, 0x01, 0x02, 0x04]);
    const result = humanHashFromBytes(bytes);
    expect(result).toBe(`${WORDLIST[0x77]}_${WORDLIST[0x89]}_${WORDLIST[0x31]}_${WORDLIST[0x15]}`);
  });

  it("throws for empty input", () => {
    expect(() => humanHashFromBytes(new Uint8Array([]))).toThrow(
      "humanHashFromBytes: input must not be empty"
    );
  });

  it("handles single-byte input (all 4 segments map from 1 byte or are empty-folded)", () => {
    // 1 byte: segmentSize = ceil(1/4) = 1
    // Segment 0: [byte] → byte
    // Segments 1–3: start >= length → folded = 0 → WORDLIST[0]
    const bytes = new Uint8Array([42]);
    const result = humanHashFromBytes(bytes);
    expect(result).toBe(`${WORDLIST[42]}_${WORDLIST[0]}_${WORDLIST[0]}_${WORDLIST[0]}`);
  });
});
