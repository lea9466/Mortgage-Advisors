import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildMergedPdf, PdfToolError } from "@/lib/cases/pdfTools";

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

describe("merging into one PDF", () => {
  it("keeps every PDF page, in order, and adds one page per picture", async () => {
    const merged = await buildMergedPdf(
      [
        { bytes: await pdfWithPages(2), contentType: "application/pdf" },
        { bytes: WIDE_PNG, contentType: "image/png" },
        { bytes: await pdfWithPages(3), contentType: "application/pdf" },
      ],
      "מסמך מאוחד",
    );
    const result = await PDFDocument.load(merged);
    expect(result.getPageCount()).toBe(6);
    expect(result.getTitle()).toBe("מסמך מאוחד");
  });

  it("turns a wide picture into a landscape page and a tall one into a portrait page", async () => {
    const result = await PDFDocument.load(
      await buildMergedPdf([{ bytes: WIDE_PNG, contentType: "image/png" }, { bytes: TALL_PNG, contentType: "image/png" }], "תמונות"),
    );
    const [wide, tall] = result.getPages();
    expect(wide && wide.getWidth() > wide.getHeight()).toBe(true);
    expect(tall && tall.getHeight() > tall.getWidth()).toBe(true);
  });

  it("refuses Office files and broken files with a clear reason", async () => {
    await expect(buildMergedPdf([{ bytes: new Uint8Array([1, 2, 3]), contentType: "application/msword" }], "x")).rejects.toThrow(PdfToolError);
    await expect(buildMergedPdf([{ bytes: new Uint8Array([1, 2, 3]), contentType: "application/pdf" }], "x")).rejects.toMatchObject({ reason: "unreadable" });
  });
});
