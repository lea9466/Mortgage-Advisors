import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { buildComposedPdf, PdfToolError } from "@/lib/cases/pdfTools";

async function pdfWithPages(count: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < count; i++) pdf.addPage([595, 842]);
  return pdf.save();
}

// Tiny valid PNGs: 2x1 (wide) and 1x2 (tall), red pixels.
const WIDE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAMAAH+9UIFAAAAAElFTkSuQmCC",
  "base64",
);
const TALL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAIAAAAW4yFwAAAAEElEQVR4nGP4z8DAwMDAAAAMAAH+9UIFAAAAAElFTkSuQmCC",
  "base64",
);

const pdfSource = async (count: number) => ({ bytes: await pdfWithPages(count), contentType: "application/pdf" });

describe("building a new PDF from pages", () => {
  it("merges whole documents and pictures, in order", async () => {
    const sources = new Map([
      ["a", await pdfSource(2)],
      ["img", { bytes: WIDE_PNG, contentType: "image/png" }],
      ["b", await pdfSource(3)],
    ]);
    const pages = [
      { source: "a", page: 0 },
      { source: "a", page: 1 },
      { source: "img", page: 0 },
      { source: "b", page: 0 },
      { source: "b", page: 1 },
      { source: "b", page: 2 },
    ].map((page) => ({ ...page, rotation: 0 as const }));
    const result = await PDFDocument.load(await buildComposedPdf(sources, pages, "מסמך מאוחד"));
    expect(result.getPageCount()).toBe(6);
    expect(result.getTitle()).toBe("מסמך מאוחד");
  });

  it("takes only some pages, in a new order, turned, and the same page twice", async () => {
    // Pages of different sizes, so the order can be read back from the result.
    const pdf = await PDFDocument.create();
    for (const width of [100, 200, 300, 400]) pdf.addPage([width, 500]);
    const sources = new Map([["a", { bytes: await pdf.save(), contentType: "application/pdf" }]]);
    const result = await PDFDocument.load(
      await buildComposedPdf(
        sources,
        [
          { source: "a", page: 3, rotation: 0 },
          { source: "a", page: 0, rotation: 90 },
          { source: "a", page: 3, rotation: 180 },
        ],
        "חלק",
      ),
    );
    expect(result.getPages().map((page) => page.getWidth())).toEqual([400, 100, 400]);
    expect(result.getPages().map((page) => page.getRotation().angle)).toEqual([0, 90, 180]);
  });

  it("turns a wide picture into a landscape page and a tall one into a portrait page", async () => {
    const sources = new Map([
      ["wide", { bytes: WIDE_PNG, contentType: "image/png" }],
      ["tall", { bytes: TALL_PNG, contentType: "image/png" }],
    ]);
    const result = await PDFDocument.load(
      await buildComposedPdf(sources, [{ source: "wide", page: 0, rotation: 0 }, { source: "tall", page: 0, rotation: 0 }], "תמונות"),
    );
    const [wide, tall] = result.getPages();
    expect(wide && wide.getWidth() > wide.getHeight()).toBe(true);
    expect(tall && tall.getHeight() > tall.getWidth()).toBe(true);
  });

  it("enlarges a small picture to fill the page, so every picture page looks the same size", async () => {
    const sources = new Map([["tiny", { bytes: TALL_PNG, contentType: "image/png" }]]);
    const bytes = await buildComposedPdf(sources, [{ source: "tiny", page: 0, rotation: 0 }], "x");
    // The 1x2 pixel picture is drawn at the full page height minus the margins (841.89 - 48 points).
    const pdf = await PDFDocument.load(bytes);
    const contents = pdf.getPage(0).node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    const drawn = refs
      .map((ref) => (ref ? pdf.context.lookup(ref) : undefined))
      .map((stream) => (stream instanceof PDFRawStream ? inflateSync(stream.getContents()).toString("latin1") : ""))
      .join(" ");
    expect(drawn).toContain("396.945 0 0 793.89");
  });

  it("refuses a page that does not exist, Office files and broken files", async () => {
    const one = new Map([["a", await pdfSource(1)]]);
    await expect(buildComposedPdf(one, [{ source: "a", page: 1, rotation: 0 }], "x")).rejects.toMatchObject({ reason: "bad-page" });
    const office = new Map([["a", { bytes: new Uint8Array([1, 2, 3]), contentType: "application/msword" }]]);
    await expect(buildComposedPdf(office, [{ source: "a", page: 0, rotation: 0 }], "x")).rejects.toThrow(PdfToolError);
    const broken = new Map([["a", { bytes: new Uint8Array([1, 2, 3]), contentType: "application/pdf" }]]);
    await expect(buildComposedPdf(broken, [{ source: "a", page: 0, rotation: 0 }], "x")).rejects.toMatchObject({ reason: "unreadable" });
  });
});
