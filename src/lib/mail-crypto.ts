import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Llave de 32 bytes desde MAIL_ENCRYPTION_KEY (base64; si no lo es, se deriva con SHA-256). */
function key(): Buffer {
  const raw = (process.env.MAIL_ENCRYPTION_KEY ?? "").trim();
  if (!raw) throw new Error("Falta MAIL_ENCRYPTION_KEY en el archivo .env. Agrégala y reinicia MeWork.");
  const b = Buffer.from(raw, "base64");
  return b.length === 32 ? b : createHash("sha256").update(raw).digest();
}

/** AES-256-GCM → "iv.tag.datos" en base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(enc: string): string {
  const [iv, tag, data] = enc.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !data) throw new Error("La contraseña guardada está dañada. Vuelve a conectar la cuenta.");
  try {
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    throw new Error("No se pudo leer la contraseña guardada (¿cambió MAIL_ENCRYPTION_KEY?). Vuelve a conectar la cuenta.");
  }
}
