import path from "node:path";
import { pathToFileURL } from "node:url";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

let pdfWorkerConfigured = false;

function ensurePdfWorkerConfigured(): void {
  if (pdfWorkerConfigured) return;
  try {
    const workerPath = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    );
    PDFParse.setWorker(pathToFileURL(workerPath).href);
    pdfWorkerConfigured = true;
  } catch {
    // pdf-parse may still work if the runtime already resolved the worker.
  }
}

export const KB_FILE_MAX_BYTES = 10 * 1024 * 1024;

export type KnowledgeFileParseErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "PARSE_FAILED";

export class KnowledgeFileParseError extends Error {
  readonly code: KnowledgeFileParseErrorCode;

  constructor(code: KnowledgeFileParseErrorCode, message: string) {
    super(message);
    this.name = "KnowledgeFileParseError";
    this.code = code;
  }
}

export type ParsedKnowledgeFile = {
  text: string;
  fileName: string;
  mimeType: string;
};

type FileKind = "pdf" | "csv" | "docx";

const EXTENSION_KIND: Record<string, FileKind> = {
  ".pdf": "pdf",
  ".csv": "csv",
  ".docx": "docx",
};

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "";
  return fileName.slice(dot).toLowerCase();
}

function detectKind(fileName: string, mimeType: string): FileKind | null {
  const ext = extensionOf(fileName);
  const fromExt = EXTENSION_KIND[ext];
  if (fromExt) return fromExt;

  const mime = mimeType.toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/csv" || mime === "application/csv") return "csv";
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  return null;
}

function friendlyParseErrorMessage(message: string): string {
  if (
    message.includes("pdf.worker") ||
    message.includes("fake worker") ||
    message.includes("pdfjs-dist")
  ) {
    return "Could not read this PDF. Please try again or use a DOCX/CSV file.";
  }
  return message;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  ensurePdfWorkerConfigured();
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

function extractCsvText(buffer: Buffer): string {
  return buffer.toString("utf-8");
}

/**
 * Parse an uploaded knowledge-base source file into plain text.
 */
export async function parseKnowledgeFile(params: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<ParsedKnowledgeFile> {
  const { buffer, fileName, mimeType } = params;

  if (buffer.length > KB_FILE_MAX_BYTES) {
    throw new KnowledgeFileParseError(
      "FILE_TOO_LARGE",
      `File must be ${KB_FILE_MAX_BYTES / (1024 * 1024)} MB or smaller`,
    );
  }

  if (buffer.length === 0) {
    throw new KnowledgeFileParseError("EMPTY_FILE", "File is empty");
  }

  const kind = detectKind(fileName, mimeType);
  if (!kind) {
    throw new KnowledgeFileParseError(
      "UNSUPPORTED_FORMAT",
      "Only PDF, CSV, and DOCX files are supported",
    );
  }

  let text: string;
  try {
    if (kind === "pdf") {
      text = await extractPdfText(buffer);
    } else if (kind === "docx") {
      text = await extractDocxText(buffer);
    } else {
      text = extractCsvText(buffer);
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Could not read file";
    throw new KnowledgeFileParseError(
      "PARSE_FAILED",
      friendlyParseErrorMessage(raw),
    );
  }

  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) {
    throw new KnowledgeFileParseError(
      "EMPTY_FILE",
      "Could not read text from this file. Scanned or image-only PDFs are not supported.",
    );
  }

  return { text: trimmed, fileName, mimeType };
}
