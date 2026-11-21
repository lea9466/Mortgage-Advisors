import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageRotation } from "@/lib/validation/document";

/**
 * Shows pages of case documents in the browser (pdf.js for PDFs, a canvas for
 * pictures). Browser only: import it from client components. Files come from
 * /api/documents on the app's own domain; each one is fetched once per visit.
 */

export type LoadedSource = { kind: "pdf"; pdf: PDFDocumentProxy; pageCount: number } | { kind: "image"; image: ImageBitmap; pageCount: 1 };

export class SourceLoadError extends Error {
  constructor(readonly reason: "locked" | "unreadable") {
    super(`source not shown: ${reason}`);
    this.name = "SourceLoadError";
  }
}

/** A4 proportions and margin, the same as the server uses when a picture becomes a page. */
const A4 = { width: 595.28, height: 841.89 };
const IMAGE_MARGIN = 24;

let pdfjs: Promise<typeof import("pdfjs-dist")> | null = null;
function getPdfjs() {
  pdfjs ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerPort = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
    return lib;
  });
  return pdfjs;
}

const sources = new Map<string, Promise<LoadedSource>>();

async function fetchBytes(documentId: string): Promise<ArrayBuffer> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { credentials: "same-origin" });
  if (!response.ok) throw new SourceLoadError("unreadable");
  return response.arrayBuffer();
}

async function load(documentId: string, contentType: string): Promise<LoadedSource> {
  const bytes = await fetchBytes(documentId);
  if (contentType === "application/pdf") {
    const lib = await getPdfjs();
    try {
      const pdf = await lib.getDocument({
        data: new Uint8Array(bytes),
        cMapUrl: "/pdfjs/cmaps/",
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        wasmUrl: "/pdfjs/wasm/",
        iccUrl: "/pdfjs/iccs/",
        enableXfa: false,
      }).promise;
      return { kind: "pdf", pdf, pageCount: pdf.numPages };
    } catch (error) {
      throw new SourceLoadError(error instanceof Error && error.name === "PasswordException" ? "locked" : "unreadable");
    }
  }
  try {
    return { kind: "image", image: await createImageBitmap(new Blob([bytes], { type: contentType })), pageCount: 1 };
  } catch {
    throw new SourceLoadError("unreadable");
  }
}

/** Opens a document once; later calls share the same result. A failure can be retried. */
export function loadSource(documentId: string, contentType: string): Promise<LoadedSource> {
  let promise = sources.get(documentId);
  if (!promise) {
    promise = load(documentId, contentType);
    promise.catch(() => sources.delete(documentId));
    sources.set(documentId, promise);
  }
  return promise;
}

/**
 * Draws one page on a canvas, `cssWidth` pixels wide on screen (sharp on
 * high-density screens). Returns a function that stops a drawing in progress.
 */
export function renderPage(canvas: HTMLCanvasElement, source: LoadedSource, pageIndex: number, rotation: PageRotation, cssWidth: number): { done: Promise<void>; cancel: () => void } {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (source.kind === "image") {
    drawPicturePage(canvas, source.image, rotation, cssWidth * ratio);
    return { done: Promise.resolve(), cancel: () => {} };
  }

  let task: { cancel: () => void } | null = null;
  let cancelled = false;
  const done = (async () => {
    const page = await source.pdf.getPage(pageIndex + 1);
    if (cancelled) return;
    const turn = (page.rotate + rotation) % 360;
    const scale = (cssWidth * ratio) / page.getViewport({ scale: 1, rotation: turn }).width;
    const viewport = page.getViewport({ scale, rotation: turn });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const render = page.render({ canvas, viewport });
    task = render;
    try {
      await render.promise;
    } catch (error) {
      if (!(error instanceof Error && error.name === "RenderingCancelledException")) throw error;
    }
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/** A picture on a white A4 page, laid out the way the server will lay it out. */
function drawPicturePage(canvas: HTMLCanvasElement, image: ImageBitmap, rotation: PageRotation, pixelWidth: number) {
  const landscape = image.width > image.height;
  const page = landscape ? { width: A4.height, height: A4.width } : A4;
  const sideways = rotation === 90 || rotation === 270;
  const shown = sideways ? { width: page.height, height: page.width } : page;
  const scale = pixelWidth / shown.width;
  canvas.width = Math.floor(shown.width * scale);
  canvas.height = Math.floor(shown.height * scale);

  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  const fit = Math.min((page.width - IMAGE_MARGIN * 2) / image.width, (page.height - IMAGE_MARGIN * 2) / image.height);
  const width = image.width * fit * scale;
  const height = image.height * fit * scale;
  context.drawImage(image, -width / 2, -height / 2, width, height);
}
