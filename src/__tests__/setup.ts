import 'fake-indexeddb/auto';

// jsdom has no canvas or PDF worker; the tests that need pixels build their own
// ImageData by hand, so only the bits that run at import time need stubbing.
if (!('ImageData' in globalThis)) {
  // jsdom ships no canvas, but ImageData itself is a plain data holder.
  // @ts-expect-error minimal stand-in matching the browser constructor
  globalThis.ImageData = class ImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
      if (typeof a === 'number') {
        this.width = a;
        this.height = b;
        this.data = new Uint8ClampedArray(a * b * 4);
      } else {
        this.data = a;
        this.width = b;
        this.height = c ?? a.length / 4 / b;
      }
    }
  };
}

if (!('DOMMatrix' in globalThis)) {
  // @ts-expect-error minimal stub for pdfjs' module-level initialisation
  globalThis.DOMMatrix = class {
    multiply() {
      return this;
    }
  };
}

if (!('ResizeObserver' in globalThis)) {
  // jsdom has no layout, so nothing ever resizes; the editors only use this to
  // keep their overlay on the page image, which has no size here anyway.
  // @ts-expect-error minimal stand-in
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!('createImageBitmap' in globalThis)) {
  // Decoding is a browser capability; page rendering is covered end to end
  // against a real browser instead.
  // @ts-expect-error minimal stand-in
  globalThis.createImageBitmap = () => Promise.reject(new Error('no decoder in jsdom'));
}
