import "server-only";
import { GoogleGenAI, type Content, type Part, type Schema } from "@google/genai";
import { getSetting } from "./settings";

export class GeminiConfigError extends Error {}

export const FALLBACK_MODEL = "gemini-2.5-flash";

/**
 * Convierte lo que escriba el usuario al formato que pide la API:
 * "Gemini 2.5 Flash-Lite" → "gemini-2.5-flash-lite", "models/gemini-2.5-pro" → "gemini-2.5-pro".
 */
export function normalizeModel(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^models\//i, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

async function client() {
  const apiKey = (await getSetting("geminiApiKey")).trim();
  if (!apiKey) {
    throw new GeminiConfigError("Falta la API Key de Gemini. Agrégala en Ajustes.");
  }
  return { ai: new GoogleGenAI({ apiKey }), model: await defaultModel() };
}

/** Modelo global configurado en Ajustes. */
export async function defaultModel() {
  return normalizeModel(await getSetting("geminiModel")) || FALLBACK_MODEL;
}

/** Conversación con historial (memoria aislada por agente). `modelOverride` permite usar el modelo del agente. */
export async function chat(systemInstruction: string, history: Content[], modelOverride?: string | null): Promise<string> {
  const { ai, model } = await client();
  const res = await ai.models.generateContent({
    model: normalizeModel(modelOverride) || model,
    contents: history,
    config: { systemInstruction },
  });
  return res.text?.trim() || "(Sin respuesta)";
}

export type GeminiModelInfo = { id: string; name: string };

/** Modelos de texto disponibles para la API Key guardada (se consulta a Google en vivo). */
export async function listTextModels(): Promise<GeminiModelInfo[]> {
  const { ai } = await client();
  const out: GeminiModelInfo[] = [];
  const pager = await ai.models.list({ config: { pageSize: 100 } });
  for await (const m of pager) {
    const id = (m.name ?? "").replace(/^models\//, "");
    const actions = m.supportedActions ?? [];
    if (!id || (actions.length && !actions.includes("generateContent"))) continue;
    // Se omiten modelos que no son de chat de texto
    if (/embedding|aqa|imagen|veo|tts|image-generation|native-audio|live/i.test(id)) continue;
    out.push({ id, name: m.displayName || id });
  }
  return out.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

/** Respuesta estructurada en JSON según un schema. `prompt` puede incluir imágenes como partes. */
export async function generateJSON<T>(
  systemInstruction: string,
  prompt: string | Part[],
  responseSchema: Schema,
): Promise<T> {
  const { ai, model } = await client();
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { systemInstruction, responseMimeType: "application/json", responseSchema },
  });
  return JSON.parse(res.text ?? "{}") as T;
}

export function friendlyAIError(e: unknown): string {
  if (e instanceof GeminiConfigError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (/API key not valid|API_KEY_INVALID|permission/i.test(msg)) {
    return "La API Key de Gemini no es válida. Revísala en Ajustes.";
  }
  if (/quota|429/i.test(msg)) return "Gemini alcanzó el límite de uso. Intenta en un momento.";
  if (/model name format|is not found|not supported for generateContent|NOT_FOUND/i.test(msg)) {
    return "Ese nombre de modelo no existe en tu cuenta de Gemini. En Ajustes elige uno de la lista (por ejemplo gemini-2.5-flash) o deja el campo vacío.";
  }
  return `Error de Gemini: ${msg.slice(0, 200)}`;
}
