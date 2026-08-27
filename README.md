# Recto

A document scanner and PDF editor that runs in a desktop browser and as a native
Android app from one TypeScript codebase. Nothing leaves the device — no
account, no server, no upload.

## What it does

**Scan** — take a photo, and the page boundary is found automatically with a
Sobel + Hough line detector. Drag any of the four corners to correct it, then a
perspective warp flattens the page into a rectangle.

**Clean up** — five looks: Auto (divides out uneven lighting so a phone photo
reads like a flatbed scan), B&W (Sauvola adaptive threshold, so a shadowed page
still binarises correctly), Greyscale, Colour, and Original.

**Edit pages** — reorder, rotate, delete, split a document in two, merge fresh
scans with pages imported from an existing PDF. On desktop you can drag PDFs and
images straight onto the window to import them.

**Annotate** — pen, highlighter, and text notes (keyboard: `p` `h` `t` `v` to
switch tool, arrow keys to change page, Cmd/Ctrl+Z to undo). Marks are stored as vectors in
unrotated page space, so rotating a page never disturbs what is on it, and they
are drawn into the exported PDF as real vector content rather than flattened
pixels.

**OCR** — Tesseract runs fully offline (the model ships with the app). Exported
PDFs get a positioned invisible text layer, so the scan stays a scan but the
text is searchable and selectable in any PDF reader.

## Running it

```bash
npm install
npm run dev          # desktop browser at the printed URL
npm test             # 28 unit tests
npm run shots        # screenshot every screen at phone and desktop widths
npm run e2e          # full pipeline against a synthetic photo (needs `npm run preview`)
```

`npm run shots` drives the installed Chrome against a `npm run preview` server,
seeds a few documents, and reports horizontal overflow and whether the page
image fits its stage — the two things that break silently when the CSS changes.

`npm run e2e` generates a synthetic photo of a page lying skewed and unevenly
lit on a desk, then runs the whole pipeline against it: edge detection (compared
against the known corner positions), perspective correction (compared against
the known aspect ratio), filtering, OCR, and PDF export — with the exported
file's text layer read back through pdf.js to prove the scan is searchable.

The first `npm run build` downloads the ~23 MB Tesseract model into
`public/tesseract/` (`prebuild` handles this; it is skipped once present).

### Android

Requires the Android SDK and a JDK 21 — Gradle cannot run on JDK 26, which is
the default `java` here. The `android:apk` script uses `$JAVA_HOME` if you have
one set and otherwise falls back to the Homebrew `openjdk@21`; export
`JAVA_HOME` yourself if your JDK lives elsewhere.

```bash
npm run android      # build web assets, sync, and assemble a debug APK
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk` (~24 MB,
most of it the OCR model). Install it with
`adb install -r android/app/build/outputs/apk/debug/app-debug.apk`, or open the
project in Android Studio with `npm run android:open`.

For a Play Store build you need a signing key — `npm run android:release`
produces an unsigned release APK until you add one to `android/app/build.gradle`.

### Desktop

`npm run build` produces a static, installable PWA in `dist/`. Serve it over
HTTPS (or localhost) and the browser offers to install it as a desktop app; the
service worker caches the shell, and the OCR model is cached on first use.

## One UI, two form factors

There is a single set of React components. The layout is mobile-first and CSS
handles the rest: a `min-width: 900px` breakpoint gives desktop a wider page
grid and content-width action buttons instead of phone-style full-bleed bars,
and hover styling is gated behind `@media (hover: hover)` so touch devices do
not get stuck hover states. Only the platform plumbing branches at runtime —
[platform.ts](src/lib/platform.ts) picks the native camera and share sheet on
Android, or a file picker and a download on desktop.

Pages are drawn to a canvas with their rotation already applied rather than
being spun with a CSS transform, because a transform is applied after layout —
a quarter-turned page sized to fit its unrotated box overflows the container.

## Layout

```
src/
  lib/
    imaging.ts      greyscale, box blur, Sobel, shadow removal, adaptive threshold
    detect.ts       Hough-transform page-edge detection
    warp.ts         homography solve + bilinear perspective warp
    annotations.ts  rotation-invariant annotation geometry
    pdf.ts          PDF assembly, vector annotations, invisible OCR text layer
    pdfImport.ts    rasterise an existing PDF so its pages can be edited
    ocr.ts          Tesseract worker, offline
    db.ts           IndexedDB documents + image blobs
    platform.ts     camera / gallery / export, native vs desktop
  ui/               Library, Scan, DocEditor, PageEditor
scripts/
  fetch-ocr-assets.mjs   downloads the Tesseract model and core
  make-icons.mjs         renders the app icon to PNG at every needed size
  shoot.mjs              screenshots every screen at both viewports
  make-test-photo.mjs    renders a synthetic skewed, unevenly lit page photo
  e2e.mjs                runs the whole pipeline against it and checks the PDF
```

Image processing is hand-written rather than pulled from OpenCV.js, which keeps
about 8 MB of WASM out of the bundle.

## Notes

- The OCR model is stored **uncompressed**. Android's `mergeAssets` task gunzips
  any `.gz` asset and drops the extension, so a bundled `eng.traineddata.gz`
  would be missing at the path the app requests inside the APK.
- The service worker is registered only on the web. Inside the Android WebView
  it would serve stale assets after an app update.
- Routing is hash-based so deep links survive the WebView's origin.
- All three LSTM Tesseract cores are bundled. Tesseract picks one at runtime
  from the device's SIMD support, and OCR fails to start on any device that
  picks a missing one.
