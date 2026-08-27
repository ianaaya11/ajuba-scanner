/**
 * Image processing primitives. Everything works on ImageData so it runs
 * identically in a desktop browser and inside the Android WebView.
 */

export function toGray(src: ImageData): Float32Array {
  const { data, width, height } = src;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Rec. 601 luma — cheap and matches what scanners expect.
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

/** Summed-area table, one row/column of zero padding so lookups never branch. */
function integral(src: Float32Array, w: number, h: number): Float64Array {
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      sum[(y + 1) * (w + 1) + (x + 1)] = sum[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  return sum;
}

function boxSum(sum: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  const s = w + 1;
  return sum[y1 * s + x1] - sum[y0 * s + x1] - sum[y1 * s + x0] + sum[y0 * s + x0];
}

/** Mean filter with a (2r+1) square window, O(1) per pixel via the integral image. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sum = integral(src, w, h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      out[y * w + x] = boxSum(sum, w, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** Sobel gradient magnitude, used by the document-edge detector. */
export function sobel(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/** Value at the given percentile (0..1) of the data, via a 256-bucket histogram. */
export function percentile(data: Float32Array, p: number, max = 1448): number {
  const buckets = new Uint32Array(257);
  for (let i = 0; i < data.length; i++) {
    buckets[Math.min(256, Math.round((data[i] / max) * 256))]++;
  }
  const target = data.length * p;
  let seen = 0;
  for (let b = 0; b < 257; b++) {
    seen += buckets[b];
    if (seen >= target) return (b / 256) * max;
  }
  return max;
}

/**
 * Removes uneven lighting by dividing the image by a heavily blurred copy of
 * itself, then stretches the result. This is what makes a phone photo of a
 * page look like it came off a flatbed.
 */
export function removeShadows(gray: Float32Array, w: number, h: number): Float32Array {
  const radius = Math.max(8, Math.round(Math.min(w, h) / 12));
  const background = boxBlur(gray, w, h, radius);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    // Background is the local "paper white"; the ratio is reflectance.
    out[i] = Math.min(255, (gray[i] / Math.max(1, background[i])) * 255);
  }
  return out;
}

/** Linear contrast stretch between two percentiles, clipped to 0..255. */
export function stretch(src: Float32Array, lowPct = 0.02, highPct = 0.98): Float32Array {
  const lo = percentile(src, lowPct, 255);
  const hi = percentile(src, highPct, 255);
  const span = Math.max(1, hi - lo);
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = Math.max(0, Math.min(255, ((src[i] - lo) / span) * 255));
  }
  return out;
}

/**
 * Sauvola-style adaptive threshold. Local mean and standard deviation come
 * from integral images, so window size costs nothing.
 */
export function adaptiveThreshold(gray: Float32Array, w: number, h: number, k = 0.25): Float32Array {
  const r = Math.max(6, Math.round(Math.min(w, h) / 40));
  const squares = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) squares[i] = gray[i] * gray[i];
  const sum = integral(gray, w, h);
  const sumSq = integral(squares, w, h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const n = (x1 - x0) * (y1 - y0);
      const mean = boxSum(sum, w, x0, y0, x1, y1) / n;
      const variance = Math.max(0, boxSum(sumSq, w, x0, y0, x1, y1) / n - mean * mean);
      const threshold = mean * (1 + k * (Math.sqrt(variance) / 128 - 1));
      out[y * w + x] = gray[y * w + x] > threshold ? 255 : 0;
    }
  }
  return out;
}

function grayToImageData(gray: Float32Array, w: number, h: number): ImageData {
  const out = new ImageData(w, h);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const v = Math.max(0, Math.min(255, gray[p])) | 0;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}

/** Boosts contrast and saturation a little without going through greyscale. */
function punchColor(src: ImageData): ImageData {
  const { width: w, height: h } = src;
  const gray = toGray(src);
  const lo = percentile(gray, 0.02, 255);
  const hi = percentile(gray, 0.98, 255);
  const span = Math.max(1, hi - lo);
  const out = new ImageData(w, h);
  for (let i = 0; i < src.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const stretched = ((src.data[i + c] - lo) / span) * 255;
      const luma = gray[i >> 2];
      // Pull each channel away from its luma to lift saturation by ~15%.
      out.data[i + c] = Math.max(0, Math.min(255, luma + (stretched - luma) * 1.15));
    }
    out.data[i + 3] = 255;
  }
  return out;
}

export function applyFilter(src: ImageData, filter: import('../types').FilterId): ImageData {
  const { width: w, height: h } = src;
  switch (filter) {
    case 'original':
      return src;
    case 'color':
      return punchColor(src);
    case 'gray':
      return grayToImageData(stretch(toGray(src)), w, h);
    case 'magic':
      return grayToImageData(stretch(removeShadows(toGray(src), w, h), 0.05, 0.95), w, h);
    case 'bw':
      return grayToImageData(adaptiveThreshold(removeShadows(toGray(src), w, h), w, h), w, h);
  }
}
