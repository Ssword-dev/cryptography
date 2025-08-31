import { Buffer } from "node:buffer";

// config
const config = {
  initialValues: new Uint32Array([
    // for those who are reading this code wondering
    // why the constants, the weird constants are chosen
    // for uniqueness and also for the funny.
    // like legit, i chose pluto demotion timestamp. idk why
    // but somehow it works.
    696342, // sun's radius
    Math.floor(3.86e26 % 0xffffffff) >>> 0, // sun luminosity wrapped
    Math.floor(Math.sqrt(4.5682 * 4_568_200_000)) >>> 0, // earth distance
    Math.floor(Math.sqrt(1156377600000)), // Pluto demotion timestamp
    Math.floor(Math.sqrt(9_460_730_472)), // lightyear constant

    // serious constants. no but actually, these adds entropy.
    // the other funny constants are fine because well, it also
    // adds entropy, cuz its results are also square roots
    // of a constant. but primes help a ton.
    Math.floor(Math.sqrt(4294967231)), // prime 1
    Math.floor(Math.sqrt(4294967279)), // prime 2
    Math.floor(Math.sqrt(4294967291)), // prime 3
  ]),
  rotLeftAmount: 5,
  rotRightAmount: 3,
  nlConstants: {
    // first multiplication
    scale: 0xb7e15162,

    // second multiplication
    grow: 0x9e3779b9,

    // flip (entropy up)
    flip: 0x7f4a7c15,

    // collapse (entropy collapse)
    collapse: 0x243f6a88,
  },

  // number of left rotations.
  nlShift: 7,

  // higher rounds = better entropy.
  roundsPerByte: 3,
};

// utils

// wrap to 32 bit.
// aka wrap to 32 bit ULL.
const wrap32 = (x: number): number => x >>> 0;

// rotate left
const rotL = (x: number, n: number): number =>
  ((x << n) | (x >>> (32 - n))) >>> 0;

// rotate right
const rotR = (x: number, n: number): number =>
  ((x >>> n) | (x << (32 - n))) >>> 0;

// zeta
const zetaValue = (alpha: number, beta: number): number =>
  (alpha ^ beta) + (alpha & beta);

// high entropy non linear function.
// produces gamma.
const gammaValue = (alpha: number, beta: number, u: number): number => {
  // get constants
  const { scale, grow, flip, collapse } = config.nlConstants;

  // z is our gamma value. its the non linearity of alpha
  // and beta with respect u.
  // initializes to ULL32 value of scale multiplied
  // by the zeta of alpha and beta left shifted 3 places.
  let z = wrap32((scale * zetaValue(alpha, beta)) << 3);

  // grows ganna with respect to u and the grow constant.
  z = (z + u * grow) >>> 0;

  // flip the gamma with the flip constant
  // through XOR (high entropy through iterations)
  z = rotL(z ^ flip, config.nlShift);

  // collapses gamma value.
  z = wrap32(z & collapse);
  return z;
};

// produces a hash for a state
// this is the value of the state
// without a key.
// is a mix of linear and non linearity.
// there is 2 linear values alpha and beta
// that is added to the gamma value while wrapping.
// the gamma value is a high non linearity value with respect
// to the variables alpha, beta, and the current byte.
// with gamma's high entanglement to the variables, its pretty hard
// to crack i hope.
const hashByte = (b: number, u: number): number => {
  // alpha value.
  const alpha = rotL(b ^ u, config.rotLeftAmount);

  // beta value.
  const beta = rotR(wrap32(b + u), config.rotRightAmount);

  // gamma value. non linearity layer.
  const gamma = gammaValue(alpha, beta, u);

  // return alpha + beta + gamma
  return wrap32(alpha + beta + gamma);
};

// wrapper for hashByte, round trips calls of hashByte for
// higher entropy.
const roundMix = (b: number, u: number): number => {
  let val = b;
  for (let i = 0; i < config.roundsPerByte; i++) {
    val = hashByte(val, u);
  }
  return val;
};

// rotates each state using M for higher entropy.
const entangle = (u: number, args: Uint32Array): number => {
  let prev = args[0];
  for (let i = 1; i < args.length; i++) {
    prev = roundMix(wrap32(prev + args[i]), u);
  }
  return prev;
};

// produces key offset. increases entropy.
// this is known as caesar shifting.
// now, dont let it fool you, the key drastically
// effects the output even if it's basic caesar shifting
// due to severe avalanche effect.
const shiftValue = (b: Uint8Array, i: number): number => b[i % b.length] || 0;

// hashes raw buffers. will not work in browser.
// optimized for node.
function sea256Raw(bytes: Buffer, key: Buffer): Buffer {
  const state = config.initialValues.slice(); // clones the initial values.
  let i = 1; // index.

  for (const u of bytes) {
    const k = shiftValue(key, i); // produce caesar shift.

    // for each state, update.
    for (let j = 0; j < state.length; j++) {
      // activates the character hashing algorithm.
      // adds the caesar shift from the key.
      state[j] = entangle(u, state) + k;
    }
    i++;
  }

  // create the final buffer
  const rb = Buffer.alloc(state.length * 4);
  state.forEach((v, idx) => {
    const offset = idx * 4;
    rb[offset] = (v >> 24) & 0xff;
    rb[offset + 1] = (v >> 16) & 0xff;
    rb[offset + 2] = (v >> 8) & 0xff;
    rb[offset + 3] = v & 0xff;
  });

  return rb;
}

function sea256(s: string, key: string): Buffer;
function sea256(s: string, key: string, encoding: BufferEncoding): string;

function sea256(s: string, key: string, encoding?: BufferEncoding) {
  const sbuf = Buffer.from(s, "utf-8");
  const keybuf = Buffer.from(key, "utf-8");

  if (encoding) {
    return sea256Raw(sbuf, keybuf).toString(encoding);
  }

  return sea256Raw(sbuf, keybuf);
}
// export
export { sea256 };

// run if main
// __filename replacement
