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
