import "server-only";
import * as XLSX from "xlsx";

export type TayauMetrics = {
  sabor: number;
  ambiente: number;
  servicio: number;
  facebook: number;
  instagram: number;
  recomendacion: number;
  tiktokMaps: number;
  responses: number;
};

type Field = keyof Omit<TayauMetrics, "responses">;
const RATINGS: Field[] = ["sabor", "ambiente", "servicio"];
const CHANNELS: Field[] = ["facebook", "instagram", "recomendacion", "tiktokMaps"];

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Reconoce el nombre de una métrica en un encabezado o etiqueta. */
function matchField(label: unknown): Field | null {
  const s = norm(label);
  if (!s) return null;
  if (/sabor|comida|platillo/.test(s)) return "sabor";
  if (/ambiente/.test(s)) return "ambiente";
  if (/servicio|atencion/.test(s)) return "servicio";
  if (/facebook|^fb$/.test(s)) return "facebook";
  if (/instagram|^ig$/.test(s)) return "instagram";
  if (/recomend|amigo|familia|boca/.test(s)) return "recomendacion";
  if (/tiktok|maps|google/.test(s)) return "tiktokMaps";
  return null;
}

const isChannelColumn = (h: unknown) => /canal|origen|conociste|enteraste|medio|como nos/.test(norm(h));

const toNum = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0);

/**
 * Interpreta un Excel de encuestas. Soporta tres formatos:
 *  A) Dos columnas Métrica | Valor  (Sabor | 4.8, Facebook | 18 ...)
 *  B) Encabezados con una fila de totales (Sabor, Ambiente, ..., TikTok/Maps)
 *  C) Respuestas individuales: una fila por comensal con calificaciones
 *     y una columna de canal ("¿Cómo nos conociste?") -> se promedian y cuentan.
 */
export function parseTayauExcel(buffer: ArrayBuffer): TayauMetrics {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("El archivo no tiene hojas.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (!rows.length) throw new Error("La hoja está vacía.");

  // Formato A: etiquetas en la primera columna
  const kv: Partial<Record<Field, number>> = {};
  for (const r of rows) {
    const f = matchField(r[0]);
    const n = toNum(r[1]);
    if (f && !Number.isNaN(n)) kv[f] = n;
  }
  if (Object.keys(kv).length >= 4) return finalize(kv, 0);

  // Formatos B y C: buscar la fila de encabezados
  const headerIdx = rows.findIndex((r) => r.filter((c) => matchField(c) || isChannelColumn(c)).length >= 2);
  if (headerIdx === -1) {
    throw new Error("No reconocí las columnas. Usa: Sabor, Ambiente, Servicio, Facebook, Instagram, Recomendación, TikTok/Maps.");
  }
  const header = rows[headerIdx];
  const data = rows.slice(headerIdx + 1).filter((r) => r.some((c) => c !== null && c !== ""));
  const cols = header.map((h) => ({ field: matchField(h), channel: isChannelColumn(h) }));

  const ratingVals: Record<string, number[]> = { sabor: [], ambiente: [], servicio: [] };
  const channelCounts: Record<string, number> = { facebook: 0, instagram: 0, recomendacion: 0, tiktokMaps: 0 };
  const channelSums: Record<string, number> = { facebook: 0, instagram: 0, recomendacion: 0, tiktokMaps: 0 };
  let channelColumnUsed = false;

  for (const r of data) {
    cols.forEach((c, i) => {
      const v = r[i];
      if (c.channel) {
        const f = matchField(v);
        if (f && CHANNELS.includes(f)) {
          channelCounts[f]++;
          channelColumnUsed = true;
        }
      } else if (c.field && RATINGS.includes(c.field)) {
        const n = toNum(v);
        if (!Number.isNaN(n)) ratingVals[c.field].push(n);
      } else if (c.field && CHANNELS.includes(c.field)) {
        const n = toNum(v);
        if (!Number.isNaN(n)) channelSums[c.field] += n;
        else if (/^(si|sí|x|1|true)$/i.test(norm(v))) channelSums[c.field] += 1;
      }
    });
  }

  const out: Partial<Record<Field, number>> = {};
  for (const f of RATINGS) out[f] = avg(ratingVals[f]);
  for (const f of CHANNELS) out[f] = channelColumnUsed ? channelCounts[f] : channelSums[f];
  const responses = data.length > 1 ? data.length : 0;
  return finalize(out, responses);
}

function finalize(m: Partial<Record<Field, number>>, responses: number): TayauMetrics {
  const r = {
    sabor: m.sabor ?? 0,
    ambiente: m.ambiente ?? 0,
    servicio: m.servicio ?? 0,
    facebook: Math.round(m.facebook ?? 0),
    instagram: Math.round(m.instagram ?? 0),
    recomendacion: Math.round(m.recomendacion ?? 0),
    tiktokMaps: Math.round(m.tiktokMaps ?? 0),
    responses: 0,
  };
  for (const f of RATINGS) {
    if (r[f] < 0 || r[f] > 5) throw new Error(`La calificación de ${f} debe estar entre 0 y 5 (encontré ${r[f]}).`);
  }
  if (!r.sabor && !r.ambiente && !r.servicio) throw new Error("No encontré calificaciones de Sabor, Ambiente o Servicio.");
  r.responses = responses || r.facebook + r.instagram + r.recomendacion + r.tiktokMaps;
  return r;
}

/** Plantilla descargable con el formato A. */
export function buildTemplate(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Métrica", "Valor"],
    ["Sabor", 4.8],
    ["Ambiente", 4.9],
    ["Servicio", 4.5],
    ["Facebook", 18],
    ["Instagram", 10],
    ["Recomendación", 11],
    ["TikTok/Maps", 3],
  ]);
  ws["!cols"] = [{ wch: 18 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Encuesta");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
