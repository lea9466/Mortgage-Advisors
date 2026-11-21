// Copies the files pdf.js loads at run time (fonts, character maps, picture
// decoders, colour profiles) from node_modules to public/pdfjs, so the
// browser gets them from the app's own domain. Runs before dev and build.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "pdfjs-dist");
const target = join(root, "public", "pdfjs");
const version = JSON.parse(readFileSync(join(source, "package.json"), "utf8")).version;
const stamp = join(target, "VERSION");

if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) process.exit(0);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  // Scripting inside PDFs stays off, so its engine is not copied.
  cpSync(join(source, folder), join(target, folder), { recursive: true, filter: (path) => !path.includes("quickjs") });
}
writeFileSync(stamp, version);
console.log(`pdf.js ${version} assets copied to public/pdfjs`);
