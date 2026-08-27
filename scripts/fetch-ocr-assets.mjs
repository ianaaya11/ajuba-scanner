/**
 * Copies the Tesseract worker and WASM core into public/ and downloads the
 * English model, so OCR runs entirely offline — no CDN call at scan time.
 */
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'tesseract');

const MODEL_URL = 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz';

const exists = (p) => stat(p).then(() => true, () => false);

await mkdir(out, { recursive: true });

// Tesseract picks its core at runtime from the device's SIMD support, and asks
// for one of these three names when recognising with LSTM (the default). All
// three must be present or OCR fails to start on whichever devices pick the
// missing one — see node_modules/tesseract.js/src/worker-script/browser/getCore.js.
const CORES = [
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-lstm.wasm.js',
];

const copies = [
  [require.resolve('tesseract.js/dist/worker.min.js'), 'worker.min.js'],
  ...CORES.map((name) => [require.resolve(`tesseract.js-core/${name}`), name]),
];

for (const [from, name] of copies) {
  await copyFile(from, join(out, name));
  console.log(`copied  ${name}`);
}

// The model is stored uncompressed on purpose. Android's mergeAssets task
// gunzips any `.gz` asset and drops the extension, so a bundled
// `eng.traineddata.gz` would be missing at runtime inside the APK. The APK zip
// compresses it again anyway, so nothing is lost.
const model = join(out, 'eng.traineddata');
if (await exists(model)) {
  console.log('skipped eng.traineddata (already present)');
} else {
  console.log(`fetching ${MODEL_URL}`);
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  await writeFile(model, gunzipSync(Buffer.from(await response.arrayBuffer())));
  const { size } = await stat(model);
  console.log(`saved   eng.traineddata (${(size / 1e6).toFixed(1)} MB)`);
}
