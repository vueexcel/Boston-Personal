/**
 * When `output: "standalone"` is enabled, Next does not copy `.next/static` into
 * `.next/standalone/.next/static` automatically. Without that folder, the server
 * serves HTML but all `/_next/static/*` assets (including compiled Tailwind CSS)
 * 404 — the UI looks completely unstyled.
 *
 * Run automatically via `npm run postbuild` after `next build`.
 */
const fs = require("fs");
const path = require("path");

const standalone = path.join(".next", "standalone");
const staticSrc = path.join(".next", "static");
const staticDest = path.join(standalone, ".next", "static");

if (!fs.existsSync(standalone)) {
  process.exit(0);
}

if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true });
  console.log("[postbuild] Copied .next/static → .next/standalone/.next/static");
}

const publicSrc = path.join("public");
const publicDest = path.join(standalone, "public");
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true });
  console.log("[postbuild] Copied public → .next/standalone/public");
}

/** pdf-parse / pdfjs-dist needs the worker beside pdf.mjs in standalone output. */
const pdfWorkerSrc = path.join(
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.mjs",
);
const pdfWorkerDest = path.join(
  standalone,
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.mjs",
);
if (fs.existsSync(pdfWorkerSrc)) {
  fs.mkdirSync(path.dirname(pdfWorkerDest), { recursive: true });
  fs.copyFileSync(pdfWorkerSrc, pdfWorkerDest);
  console.log(
    "[postbuild] Copied pdfjs-dist worker → .next/standalone/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
}
