# ajuba scanner

**Live: https://ianaaya11.github.io/ajuba-scanner**


A document scanner and PDF editor that runs in a desktop browser and as a native
Android app from one TypeScript codebase. Nothing leaves the device — no
account, no server, no upload.

## What it does

**Scan** — a live camera with framing guides opens in the browser (the Android
app uses the system camera). Take a photo and the page boundary is found automatically with a
Sobel + Hough line detector. Drag any of the four corners to correct it, then a
perspective warp flattens the page into a rectangle.

**Clean up** — five looks: Auto (divides out uneven lighting so a phone photo
reads like a flatbed scan), B&W (Sauvola adaptive threshold, so a shadowed page
still binarises correctly), Greyscale, Colour, and Original.

**Edit pages** — reorder, rotate, delete, split a document in two, merge fresh
scans with pages imported from an existing PDF. Delete a whole document from
the library list or from inside the document itself. On desktop you can drag PDFs and
images straight onto the window to import them.

**Annotate and sign** — pen, highlighter, text notes, signatures and date
stamps. The Select tool picks any single mark: tap it to see it outlined, drag
to reposition, Delete to remove just that one. A signature comes up selected
the moment it is placed, so a bad one goes straight back out without undoing
anything else or rescanning. To sign, pick the Sign tool and drag out the area to sign in; the
signature is drawn on a pad and fitted into that area preserving its aspect
ratio, and can be remembered on the device for reuse. The Date tool drops a
formatted date, or any text you prefer, wherever you tap. Everything exports as
real PDF vectors and text rather than flattened pixels, so a signed page stays
crisp and the date stays selectable. (Keyboard: `p` `h` `t` `s` `d` `v` to
switch tool, arrow keys to change page, Cmd/Ctrl+Z to undo.) Marks are stored as vectors in
unrotated page space, so rotating a page never disturbs what is on it, and they
are drawn into the exported PDF as real vector content rather than flattened
pixels.

**OCR** — Tesseract runs fully offline (the model ships with the app). Exported
PDFs get a positioned invisible text layer, so the scan stays a scan but the
text is searchable and selectable in any PDF reader.

Open it in a browser and install it as a desktop app, or build the Android APK
below. Pushing to `main` rebuilds and redeploys the site automatically.

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

### Publishing to the Play Store

`npm run assets:play` builds the listing assets into `brand/play-store/`:

| File | Size | Notes |
| --- | --- | --- |
| `icon-512.png` | 512x512 | Opaque, no alpha, no pre-applied rounding |
| `feature-graphic-1024x500.png` | 1024x500 | Exact size required |
| `screenshot-*.png` | 1080x1920 | Real screens. 1080x1920 is inside Play's 2:1 aspect limit; the app's own 412-wide captures are 1:2.14 and would be rejected |

`npm run android:bundle` produces `app-release.aab`. Play requires an app
bundle, not an APK, for a new app.

To sign it, copy `android/keystore.properties.example` to
`android/keystore.properties` and create a key:

```bash
cd android/app
keytool -genkeypair -v -keystore upload.jks -alias upload \
        -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` prompts for the passwords, so they stay with you. The build reads
that file if it is present and signs the release; without it the release stays
unsigned and everything else still builds, so a fresh clone needs no setup.
Both the key and the properties file are git ignored.

Back the key up off this machine. Losing it means the app can never be updated
under this listing.

**Still not doable from here:** the upload itself. It needs an interactive Play
Console session under your developer account.

### Desktop

`npm run build` produces a static, installable PWA in `dist/`. Serve it over
HTTPS (or localhost) and the browser offers to install it as a desktop app; the
service worker caches the shell, and the OCR model is cached on first use.

## Look

Porcelain by day, midnight by night. The theme control in the header cycles
auto, light and dark; auto follows the device's `prefers-color-scheme`, and both halves share the same indigo-to-rose accent so
the app reads as one identity rather than two. Every colour is a token on
`:root`; no component rule knows which scheme is active.

Surfaces are translucent with a hairline of light along the top edge, blurred
where there is something behind them. Blur is deliberately kept off the page
images so scans stay sharp.

Two marks, both in `scripts/logo.mjs`, so nothing can drift apart:

- **page** — the contour portrait on a document page, held in viewfinder
  brackets and crossed by the beam. Used for the web build (favicon and PWA
  icons) and mirrored by the animated watermark.
- **badge** — the embossed portrait in a ring. Used for the Android launcher
  and the Play Store listing, where the icon is seen large and on its own and
  the relief reads as a struck seal. The
same mark sits behind the library as a greyscale watermark with the beam
sweeping the page; that motion stops under `prefers-reduced-motion`.

The portrait is a **contour**, not the photograph. `scripts/make-contour.mjs`
runs the source through the same kind of pipeline the scanner itself uses —
greyscale, blur, Sobel, threshold — tuned for a face rather than a page, then
crops to head and shoulders and thickens the ink so it survives being shrunk to
32px, where a photograph turns to mush. Only the derived line art is in this
repo; the source photograph is not:

```bash
node scripts/make-contour.mjs  /path/to/photo.jpg  # -> brand/contour.png   (web)
node scripts/make-portrait.mjs /path/to/photo.jpg  # -> embossed badge      (app)
npm run assets:icons                               # re-render every icon
```

`npm run assets:icons` also writes `brand/play-store-icon.png`: 512 square,
full bleed and opaque, with no alpha channel and no pre-applied rounding, which
is what the Play Console expects — it applies its own masking, so a
pre-rounded icon shows corner artefacts.

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
  logo.mjs               the mark, as one canonical SVG
  make-icons.mjs         rasterises it to every size the platforms need
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
- The IndexedDB store is named after the app. Because IndexedDB is keyed by
  database name, renaming the app would strand existing scans, so `db.ts`
  migrates from the earlier names on first run and never deletes the old store.
- The browser camera needs a **secure context**: HTTPS or `localhost`. Opening
  the dev server over a LAN IP such as `http://192.168.x.x:5180` leaves
  `getUserMedia` undefined and the camera cannot start — the app says so and
  offers importing instead. Use `vite --https`, a tunnel, or the deployed site
  when testing on a phone.
- All three LSTM Tesseract cores are bundled. Tesseract picks one at runtime
  from the device's SIMD support, and OCR fails to start on any device that
  picks a missing one.
