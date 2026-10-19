import mammoth from "mammoth";

export const UNPARSEABLE_RESUME = "Resume provided but could not be parsed. Proceed with general interview questions.";

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Use lib/pdf-parse.js directly to skip the buggy index.js
    // (index.js has a debug mode that reads a test file on require())
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const data = await pdfParse(buffer);
    const text = data.text?.trim() || "";
    console.log(`PDF parsed: ${text.length} chars`);
    return text || UNPARSEABLE_RESUME;
  } catch (err) {
    console.error("PDF parse failed:", err);
    return UNPARSEABLE_RESUME;
  }
}

/** Plain text of a PDF, DOCX or TXT resume, chosen by file extension. */
export async function extractResumeText(buffer: Buffer, fileName: string): Promise<string> {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) {
    return extractTextFromPDF(buffer);
  }
  if (name.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString("utf-8");
}
