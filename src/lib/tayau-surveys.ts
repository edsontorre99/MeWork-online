/** Lectura de encuestas en papel (fotos) y su resumen semanal. Se usa en cliente y servidor. */

export const MAX_SURVEY_PHOTOS = 100;
/** Fotos que se mandan a Gemini en cada petición. */
export const SURVEY_BATCH = 10;

export const SURVEY_CHANNELS = ["facebook", "instagram", "tiktok", "google_maps", "recomendacion", "otro"] as const;
export type SurveyChannel = (typeof SURVEY_CHANNELS)[number];

export type SurveyReading = {
  foto: number; // número de foto (1..N) dentro de la carga
  legible: boolean;
  comida: number | null;
  ambiente: number | null;
  servicio: number | null;
  canales: SurveyChannel[];
  otroCanal: string | null;
};

export type TayauMetrics = {
  sabor: number;
  ambiente: number;
  servicio: number;
  facebook: number;
  instagram: number;
  recomendacion: number;
  tiktokMaps: number;
  otros: number;
  responses: number;
};

const rating = (v: unknown) => {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
};

/** Limpia lo que devuelve la IA y marca como ilegibles las fotos que no aparecen en la respuesta. */
export function normalizeReadings(raw: unknown[], firstFoto: number, lastFoto: number): SurveyReading[] {
  const out: SurveyReading[] = [];
  for (const r of raw as Partial<SurveyReading>[]) {
    const foto = Number(r?.foto);
    if (!Number.isInteger(foto) || foto < firstFoto || foto > lastFoto) continue;
    const reading: SurveyReading = {
      foto,
      legible: !!r.legible,
      comida: rating(r.comida),
      ambiente: rating(r.ambiente),
      servicio: rating(r.servicio),
      canales: [...new Set((r.canales ?? []).filter((c): c is SurveyChannel => SURVEY_CHANNELS.includes(c as SurveyChannel)))],
      otroCanal: typeof r.otroCanal === "string" && r.otroCanal.trim() ? r.otroCanal.trim().slice(0, 60) : null,
    };
    if (reading.comida === null && reading.ambiente === null && reading.servicio === null && !reading.canales.length) {
      reading.legible = false;
    }
    out.push(reading);
  }
  for (let foto = firstFoto; foto <= lastFoto; foto++) {
    if (!out.some((r) => r.foto === foto)) {
      out.push({ foto, legible: false, comida: null, ambiente: null, servicio: null, canales: [], otroCanal: null });
    }
  }
  return out.sort((a, b) => a.foto - b.foto);
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0);

/** Promedios de calificación y conteo por canal de todas las encuestas legibles. */
export function summarizeSurveys(readings: SurveyReading[]) {
  const ok = readings.filter((r) => r.legible);
  const vals = (k: "comida" | "ambiente" | "servicio") => ok.map((r) => r[k]).filter((n): n is number => n !== null);
  const count = (...chs: SurveyChannel[]) => ok.filter((r) => r.canales.some((c) => chs.includes(c))).length;

  const metrics: TayauMetrics = {
    sabor: avg(vals("comida")),
    ambiente: avg(vals("ambiente")),
    servicio: avg(vals("servicio")),
    facebook: count("facebook"),
    instagram: count("instagram"),
    recomendacion: count("recomendacion"),
    tiktokMaps: count("tiktok", "google_maps"),
    otros: count("otro"),
    responses: ok.length,
  };
  const otherLabels = [...new Set(ok.map((r) => r.otroCanal).filter((s): s is string => !!s))];
  const unreadable = [...new Set(readings.map((r) => r.foto))].filter((f) => !readings.some((r) => r.foto === f && r.legible));
  return { metrics, otherLabels, unreadable };
}
