#!/usr/bin/node
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { basename } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { HashFunction } from "./types";

const require = createRequire(new URL(import.meta.url));
export class HashTester {
  private hashFn: HashFunction;
  private testingKey: string;

  constructor(hashFn: HashFunction, testingKey: string = "test-key") {
    this.hashFn = hashFn;
    this.testingKey = testingKey;
  }

  // flip a bit in string (utf-8)
  private flipBit(input: string, bitPos: number): string {
    const buf = Buffer.from(input, "utf8");
    const byteIndex = Math.floor(bitPos / 8);
    const bitIndex = bitPos % 8;
    buf[byteIndex] ^= 1 << bitIndex;
    return buf.toString("utf8");
  }

  // count differing bits between two hex strings
  static hammingDistance(hex1: string, hex2: string): number {
    const buf1 = Buffer.from(hex1, "hex");
    const buf2 = Buffer.from(hex2, "hex");
    let dist = 0;
    for (let i = 0; i < buf1.length; i++) {
      let xor = buf1[i] ^ buf2[i];
      while (xor) {
        dist++;
        xor &= xor - 1; // clear lowest set bit
      }
    }
    return dist;
  }

  // count differing bits between two hex-encoded hashes
  static bitDiff(hexA: string, hexB: string): number {
    const a = Buffer.from(hexA, "hex");
    const b = Buffer.from(hexB, "hex");
    const maxLen = Math.max(a.length, b.length);

    let dist = 0;
    for (let i = 0; i < maxLen; i++) {
      const ai = i < a.length ? a[i] : 0;
      const bi = i < b.length ? b[i] : 0;
      let xor = ai ^ bi;
      // popcount
      while (xor) {
        dist++;
        xor &= xor - 1;
      }
    }
    return dist;
  }

  avalanche(input: string, flips = 100): { avg: number; bits: number[] } {
    const originalHash = this.hashFn({
      input: input,
      key: this.testingKey,
    });
    let total = 0;
    const distances: number[] = [];

    for (let i = 0; i < flips; i++) {
      const pos = Math.floor(Math.random() * (input.length * 8));
      const flipped = this.flipBit(input, pos);
      const newHash = this.hashFn({
        input: flipped,
        key: this.testingKey,
      });
      const dist = HashTester.hammingDistance(originalHash, newHash);
      total += dist;
      distances.push(dist);
    }

    return { avg: total / flips, bits: distances };
  }

  diffusion(input: string, flips: number = 100): number {
    const originalHash = this.hashFn({
      input: input,
      key: this.testingKey,
    });
    const hashBits = Buffer.from(originalHash, "hex").length * 8; // total bits
    let totalDiffBits = 0;

    for (let i = 0; i < flips; i++) {
      const flipped = this.flipBit(input, i % (input.length * 8));
      const newHash = this.hashFn({
        input: flipped,
        key: this.testingKey,
      });
      totalDiffBits += HashTester.bitDiff(originalHash, newHash);
    }

    const avgDiffBits = totalDiffBits / flips;
    return avgDiffBits / hashBits;
  }

  preimage(output: string, inputLength = 10, attempts = 1e6) {
    for (let i = 0; i < attempts; i++) {
      const candidate = crypto.randomBytes(inputLength).toString("utf-8"); // random string
      if (
        this.hashFn({
          input: candidate,
          key: this.testingKey,
        }) === output
      ) {
        return { found: true, candidate, tries: i + 1 };
      }
    }
    return { found: false, tries: attempts };
  }

  collision(iterations: number = 1e6) {
    const seen = new Set();
    let collisions = 0;

    for (let i = 0; i < iterations; i++) {
      const input = crypto.randomBytes(16 / 2).toString("hex");
      const hash = this.hashFn({
        input,
        key: this.testingKey,
      });

      if (seen.has(hash)) {
        collisions++;
      } else {
        seen.add(hash);
      }
    }

    return { collisions, iterations };
  }
}

// ---------------------- CLI loader ----------------------

function loadHashFunctionFromExports(
  exports: unknown,
  hashFunctionExport?: string,
): HashFunction {
  if (
    !exports ||
    (typeof exports !== "object" && typeof exports !== "function")
  ) {
    throw new Error(
      "Exports of hash modules must either be a function or an object",
    );
  }

  if (hashFunctionExport) {
    if (!(hashFunctionExport in exports)) {
      throw new Error(`Hash function "${hashFunctionExport}" is not exported.`);
    }

    if (typeof exports[hashFunctionExport as keyof object] !== "function") {
      throw new Error(`Hash function exports must be a function.`);
    }

    return exports[hashFunctionExport as keyof object] as HashFunction;
  }

  if ("default" in exports) {
    return exports.default as HashFunction;
  } else if ("hash" in exports) {
    return exports.hash as HashFunction;
  } else {
    throw new Error(`Failed to resolve a hash function from exports.`);
  }
}

async function xImport(moduleId: string) {
  try {
    return await import(moduleId);
  } catch (_) {
    try {
      return require(moduleId);
    } catch (_) {
      throw new Error(`Failed to import ${moduleId}`);
    }
  }
}

const requireCwd = createRequire(process.cwd() + "/");

function resolveModule(id: string): string {
  try {
    // try resolving relative to current working directory
    return requireCwd.resolve(id);
  } catch (_) {
    try {
      // try raw Node resolution
      return require.resolve(id);
    } catch (_) {
      throw new Error(
        `Cannot resolve module "${id}". Tried CWD and global require.resolve.`,
      );
    }
  }
}

export async function main() {
  const args = await yargs(hideBin(process.argv))
    .option("module", { alias: "r", demandOption: true, string: true })
    .option("function", { alias: "h", string: true })
    .option("hash-input", { alias: "i", string: true, demandOption: true })
    .option("test-iteration", { alias: "t", number: true, demandOption: true })
    .parseAsync();

  const { module, function: fn, hashInput, testIteration } = args;
  const hashModulePath = resolveModule(module);
  const hashModuleExports = await xImport(hashModulePath);
  const hashFunction = loadHashFunctionFromExports(hashModuleExports, fn);
  const tester = new HashTester(hashFunction);

  // statistics
  const length = hashInput.length;
  const diffusion = tester.diffusion(hashInput, testIteration);
  const avalanche = tester.avalanche(hashInput, testIteration);
  const collisions = tester.collision(testIteration);
  const preimage = tester.preimage(
    hashFunction({
      input: "test",
      key: "test-key",
    }),
    length,
    testIteration,
  );

  console.log(`Statistics:`);
  console.log(`Average Diffusion: ${diffusion * 100}%`);
  console.log(`Average avalanche: ${avalanche.avg}`);
  console.log(`Collisions: ${collisions.collisions}`);
  console.log(
    `Preimage result: ${preimage.found ? "found" : "not found"} in ${preimage.tries}`,
  );
}

const __filename = import.meta.filename;

if (basename(process.argv[1]) === basename(__filename)) {
  main();
}
