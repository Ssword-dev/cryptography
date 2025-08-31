import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const require = createRequire(new URL(import.meta.url));
export class HashTester {
  private hashFn: (s: string) => string;

  constructor(hashFn: (s: string) => string) {
    this.hashFn = hashFn;
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
    const originalHash = this.hashFn(input);
    let total = 0;
    const distances: number[] = [];

    for (let i = 0; i < flips; i++) {
      const pos = Math.floor(Math.random() * (input.length * 8));
      const flipped = this.flipBit(input, pos);
      const newHash = this.hashFn(flipped);
      const dist = HashTester.hammingDistance(originalHash, newHash);
      total += dist;
      distances.push(dist);
    }

    return { avg: total / flips, bits: distances };
  }

  diffusion(input: string, flips: number = 100): number {
    const originalHash = this.hashFn(input);
    const hashBits = Buffer.from(originalHash, "hex").length * 8; // total bits
    let totalDiffBits = 0;

    for (let i = 0; i < flips; i++) {
      const flipped = this.flipBit(input, i % (input.length * 8));
      const newHash = this.hashFn(flipped);
      totalDiffBits += HashTester.bitDiff(originalHash, newHash);
    }

    const avgDiffBits = totalDiffBits / flips;
    return avgDiffBits / hashBits; // normalized [0,1], e.g. 0.5 = 50% avalanche
  }

  preimage(output: string, inputLength = 10, attempts = 1e6) {
    for (let i = 0; i < attempts; i++) {
      const candidate = crypto.randomBytes(inputLength).toString("utf-8"); // random string
      if (this.hashFn(candidate) === output) {
        return { found: true, candidate, tries: i + 1 };
      }
    }
    return { found: false, tries: attempts };
  }
}

interface CompiledHashFunction {
  (input: string): string;
}

// ---------------------- CLI loader ----------------------
async function loadHashFn(
  modulePath: string,
  exportName?: string,
): Promise<(s: string) => string> {
  const resolvedPath = path.resolve(process.cwd(), modulePath);
  let mod: Record<string, unknown>;

  try {
    mod = await import(resolvedPath);
  } catch {
    // fallback to require for CommonJS
    mod = require(resolvedPath);
  }

  if (exportName) {
    if (!(exportName in mod))
      throw new Error(`Export "${exportName}" not found`);
    return mod[exportName] as CompiledHashFunction;
  }

  // auto-detect default function export
  if (typeof mod.default === "function")
    return mod.default as CompiledHashFunction;
  if (typeof mod.hash === "function") return mod.hash as CompiledHashFunction;

  // pick first function export
  const fnExport = Object.values(mod).find((v) => typeof v === "function");
  if (!fnExport) throw new Error("No function export found in module");
  return fnExport as CompiledHashFunction;
}

// ---------------------- CLI ----------------------
if (
  process.argv[1].endsWith("hashTester.ts") ||
  process.argv[1].endsWith("hashTester.js")
) {
  const argv = yargs(hideBin(process.argv))
    .option("module", {
      alias: "m",
      type: "string",
      demandOption: true,
      description: "Path to hash module",
    })
    .option("export", {
      alias: "f",
      type: "string",
      description: "Exported function name",
    })
    .option("input", { alias: "i", type: "string", demandOption: true })
    .option("key", { alias: "k", type: "string", default: "test-key" })
    .option("encoding", { alias: "e", type: "string", default: "hex" })
    .option("samples", { alias: "s", type: "number", default: 100 })
    .help()
    .parseSync();

  (async () => {
    const hashFn = await loadHashFn(argv.module, argv.export);
    const tester = new HashTester(hashFn);

    console.log(
      `Avalanche test for "${argv.input}":`,
      tester.avalanche(argv.input, argv.samples),
    );
    console.log(
      `Diffusion test for "${argv.input}":`,
      tester.diffusion(argv.input, argv.samples),
    );
    console.log(
      `Preimage resistance test for "${argv.input}":`,
      tester.preimage(hashFn(argv.input), argv.input.length, 100_000),
    );
  })();
}
