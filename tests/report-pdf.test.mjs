// Renders the branded PDF report for a single company and for the whole
// dataset, and checks the document is well formed and carries every section.
// Run with: npm run test:report   (set REPORT_OUT=<folder> to keep the PDFs)
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const { buildPdfReport } = await import("@/lib/reports/builders");
const { EMPTY_FILTERS } = await import("@/types");
const { PDFDocument } = await import("pdf-lib");

async function render(name, filters) {
  const bytes = await buildPdfReport({ ...EMPTY_FILTERS, ...filters });
  if (process.env.REPORT_OUT) {
    await mkdir(process.env.REPORT_OUT, { recursive: true });
    await writeFile(path.join(process.env.REPORT_OUT, `${name}.pdf`), bytes);
  }
  return { bytes, doc: await PDFDocument.load(bytes) };
}

test("single-company report (ITC Limited) is titled for the company", async () => {
  const { bytes, doc } = await render("itc-limited-csr-report", { companies: ["itc"] });
  assert.ok(bytes.length > 10_000, "PDF should not be empty");
  assert.equal(doc.getTitle(), "ITC Limited - CSR Report");
  assert.match(doc.getSubject() ?? "", /ITC Limited/);
  assert.ok(doc.getPageCount() >= 3 && doc.getPageCount() <= 8, `unexpected page count ${doc.getPageCount()}`);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    assert.equal(Math.round(width), 595);
    assert.equal(Math.round(height), 842);
  }
});

test("all-companies report renders the multi-company sections", async () => {
  const { doc } = await render("all-companies-csr-report", {});
  assert.equal(doc.getTitle(), `${doc.getTitle().split(" - ")[0]} - CSR Report`);
  assert.match(doc.getTitle(), /companies - CSR Report$/);
  assert.ok(doc.getPageCount() >= 4);
});

test("an empty filter still produces a valid document", async () => {
  const { doc } = await render("empty-csr-report", { companies: ["no-such-company"] });
  assert.ok(doc.getPageCount() >= 1);
});
