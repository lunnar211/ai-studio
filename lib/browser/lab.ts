// Client-safe sRGB <-> CIELAB conversion (no Node imports, no Sharp).
//
// Same math as lib/ai/lab.ts, but over plain typed arrays so it runs in
// the browser and in a Web Worker. Layout: RGB interleaved Uint8;
// Lab as Float32Array, L in 0..100, a/b in about -128..127.
// The browser colorize path uses this to LAB-merge: keep the ORIGINAL
// photo's L channel (detail never comes from the model) and take only
// a/b from the model output, scaled by intensity.

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const s = i / 255;
  SRGB_TO_LINEAR[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

const F_STEPS = 4096;
const F_MAX = 1.2;
const F_LUT = new Float32Array(F_STEPS + 1);
const DELTA = 6 / 29;
const DELTA3 = DELTA * DELTA * DELTA;
for (let i = 0; i <= F_STEPS; i++) {
  const t = (i / F_STEPS) * F_MAX;
  F_LUT[i] = t > DELTA3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29;
}
function f(t: number): number {
  if (t <= 0) return 4 / 29;
  if (t >= F_MAX) return Math.cbrt(t);
  const pos = (t / F_MAX) * F_STEPS;
  const i = Math.floor(pos);
  const frac = pos - i;
  return F_LUT[i] * (1 - frac) + F_LUT[Math.min(i + 1, F_STEPS)] * frac;
}

const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

export function rgbToLab(rgb: Uint8Array | Uint8ClampedArray, pixelCount: number): Float32Array {
  const lab = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p++) {
    const o = p * 3;
    const r = SRGB_TO_LINEAR[rgb[o]];
    const g = SRGB_TO_LINEAR[rgb[o + 1]];
    const b = SRGB_TO_LINEAR[rgb[o + 2]];
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / XN;
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / YN;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / ZN;
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    lab[p * 3] = 116 * fy - 16;
    lab[p * 3 + 1] = 500 * (fx - fy);
    lab[p * 3 + 2] = 200 * (fy - fz);
  }
  return lab;
}

function fInv(t: number): number {
  return t > DELTA ? t * t * t : 3 * DELTA * DELTA * (t - 4 / 29);
}

export function labToRgb(lab: Float32Array, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p++) {
    const L = lab[p * 3];
    const a = lab[p * 3 + 1];
    const b = lab[p * 3 + 2];
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const x = fInv(fx) * XN;
    // fy > delta ⟺ L > 116·(6/29) − 16 = 8 (see lib/ai/lab.ts).
    const y = L > 8 ? Math.pow(fy, 3) : L / 903.3;
    const z = fInv(fz) * ZN;
    const r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
    const g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
    const bl = 0.0557 * x - 0.204 * y + 1.057 * z;
    const toSrgb = (c: number): number => {
      const cl = Math.min(1, Math.max(0, c));
      const s = cl <= 0.0031308 ? 12.92 * cl : 1.055 * Math.pow(cl, 1 / 2.4) - 0.055;
      return Math.min(255, Math.max(0, Math.round(s * 255)));
    };
    out[p * 3] = toSrgb(r);
    out[p * 3 + 1] = toSrgb(g);
    out[p * 3 + 2] = toSrgb(bl);
  }
  return out;
}

/**
 * Merge step for colorize: keep the ORIGINAL image's L channel and
 * take only a/b from the model output, scaled by `intensity` (0..1).
 * Both Lab buffers must share the same dimensions.
 */
export function mergeLabLuminance(
  originalLab: Float32Array,
  modelLab: Float32Array,
  intensity: number
): Float32Array {
  const out = new Float32Array(originalLab.length);
  const k = Math.min(1, Math.max(0, intensity));
  for (let i = 0; i < originalLab.length; i += 3) {
    out[i] = originalLab[i];
    out[i + 1] = modelLab[i + 1] * k;
    out[i + 2] = modelLab[i + 2] * k;
  }
  return out;
}
