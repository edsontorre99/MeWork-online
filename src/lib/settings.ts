import "server-only";
import { prisma } from "./prisma";

export type SettingKey =
  | "geminiApiKey"
  | "geminiModel"
  | "profileName"
  | "profileRole"
  | "openpayMerchantId"
  | "openpayPrivateKey"
  | "openpaySandbox"
  | "ticketEventName"
  | "ticketPrice"
  | "mailAutoCheck"
  | "mailCheckHours"
  | "mailLastRunAt";

const DEFAULTS: Partial<Record<SettingKey, string>> = {
  geminiModel: "gemini-2.5-flash",
  profileName: "Edson",
  profileRole: "Gerente de Marketing",
  openpaySandbox: "true",
  ticketEventName: "Preventa Parque Temático",
  ticketPrice: "350",
  mailAutoCheck: "true",
  mailCheckHours: "2",
};

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row?.value) return row.value;
  if (key === "geminiApiKey") return process.env.GEMINI_API_KEY ?? "";
  return DEFAULTS[key] ?? "";
}

export async function getSettings<K extends SettingKey>(keys: K[]): Promise<Record<K, string>> {
  const entries = await Promise.all(keys.map(async (k) => [k, await getSetting(k)] as const));
  return Object.fromEntries(entries) as Record<K, string>;
}

export async function setSetting(key: SettingKey, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Muestra solo los últimos 4 caracteres de una llave. */
export function maskSecret(v: string) {
  if (!v) return "";
  return `${"•".repeat(Math.max(0, Math.min(v.length - 4, 24)))}${v.slice(-4)}`;
}
