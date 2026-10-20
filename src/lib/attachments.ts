import "server-only";
import type { Part } from "@google/genai";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

/** Gemini acepta ~20 MB por petición con datos en línea. */
export const MAX_ATTACHMENTS_BYTES = 18 * 1024 * 1024;

// Tipos que Gemini lee directamente
const NATIVE = /^(image\/(png|jpeg|webp|heic|heif)|application\/pdf|audio\/.+|video\/.+)$/i;
const TEXT_EXT = /\.(txt|md|csv|tsv|json|xml|html?|css|js|ts|tsx|jsx|py|sql|yaml|yml|log|rtf)$/i;

/** Convierte un archivo adjunto en partes que entiende Gemini (Word y Excel se pasan a texto). */
export async function fileToParts(file: File): Promise<Part[]> {
  const name = file.name || "archivo";
  const type = file.type || "";
  const buf = Buffer.from(await file.arrayBuffer());

  if (NATIVE.test(type)) {
    return [{ text: `Archivo adjunto: ${name}` }, { inlineData: { mimeType: type, data: buf.toString("base64") } }];
  }
  if (/\.docx$/i.test(name)) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return [{ text: `Contenido del documento Word "${name}":\n\n${value}` }];
  }
  if (/\.(xlsx|xlsm|xls|ods)$/i.test(name)) {
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheets = wb.SheetNames.map((s) => `### Hoja "${s}"\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`);
    return [{ text: `Contenido del Excel "${name}" (en CSV):\n\n${sheets.join("\n\n")}` }];
  }
  if (type.startsWith("text/") || type === "application/json" || TEXT_EXT.test(name)) {
    return [{ text: `Contenido del archivo "${name}":\n\n${buf.toString("utf8")}` }];
  }
  throw new Error(`No puedo leer "${name}". Usa imágenes, PDF, Word, Excel, texto, audio o video.`);
}
