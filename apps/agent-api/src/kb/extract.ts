/**
 * Text extraction from uploaded files by MIME type / extension.
 * Supports: PDF, Word (.docx), plain text, markdown, CSV, XLSX/XLS.
 */
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

export interface ExtractResult {
  text: string;
  detectedType: string;
}

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "log"]);

function extOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

async function extractPdf(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    // Strip the "-- N of M --" page separators pdf-parse injects.
    return (result.text || "").replace(/^-- \d+ of \d+ --$/gm, "").trim();
  } finally {
    // best-effort cleanup of worker resources
    await (parser as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}

async function extractDocx(buf: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return (value || "").trim();
}

function extractSpreadsheet(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) parts.push(`# Sheet: ${name}\n${csv.trim()}`);
  }
  return parts.join("\n\n").trim();
}

/**
 * Extract plain text from a file buffer.
 * Uses MIME type first, falls back to file extension.
 */
export async function extractText(
  buf: Buffer,
  fileName: string,
  mimeType: string
): Promise<ExtractResult> {
  const ext = extOf(fileName);
  const mime = (mimeType || "").toLowerCase();

  // PDF
  if (mime.includes("pdf") || ext === "pdf") {
    return { text: await extractPdf(buf), detectedType: "pdf" };
  }

  // Word .docx (OOXML)
  if (
    mime.includes("officedocument.wordprocessingml") ||
    mime === "application/msword" ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return { text: await extractDocx(buf), detectedType: "docx" };
  }

  // Spreadsheets
  if (
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return { text: extractSpreadsheet(buf), detectedType: "xlsx" };
  }

  // Plain-text family (txt, md, csv, tsv, json)
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXTENSIONS.has(ext)) {
    return { text: buf.toString("utf-8").trim(), detectedType: ext || "text" };
  }

  // Last-ditch: try UTF-8 decode; if it looks like text, accept it.
  const asText = buf.toString("utf-8");
  // Heuristic: reject if it has many replacement/null chars (binary)
  const badChars = (asText.match(/\uFFFD|\u0000/g) || []).length;
  if (badChars < asText.length * 0.01) {
    return { text: asText.trim(), detectedType: "text" };
  }

  throw new Error(`Unsupported file type: mime="${mimeType}", ext="${ext}"`);
}
