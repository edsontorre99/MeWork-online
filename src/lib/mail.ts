import "server-only";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser, type AddressObject } from "mailparser";
import { Type } from "@google/genai";
import type { MailAccount } from "@prisma/client";
import { prisma } from "./prisma";
import { decryptSecret } from "./mail-crypto";
import { generateJSON, friendlyAIError } from "./gemini";
import { getSetting, getSettings, setSetting } from "./settings";

const IMAP_HOST = "imap.gmail.com";
const SMTP_HOST = "smtp.gmail.com";
const MAX_PER_CHECK = 25;
export const MAX_SENDS_PER_HOUR = 30;

export class MailError extends Error {}

/** "<abc@x>" → "abc@x" (así se guardan y comparan los Message-ID). */
export const normalizeMessageId = (id: string) => id.trim().replace(/^<+|>+$/g, "");

const NOT_GOOGLE = /@(hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|zoho|gmx)\.[a-z.]+$/i;

/** Valida el correo antes de intentar conectarse. */
export function checkEmailAddress(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Ese correo no está bien escrito. Ejemplo: nombre@gmail.com";
  if (NOT_GOOGLE.test(email)) {
    return "Ese correo no es de Gmail. MeWork solo puede conectar cuentas de Gmail (o de empresa con Google Workspace).";
  }
  return null;
}

/** Quita espacios y valida que sean 16 letras. */
export function cleanAppPassword(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.replace(/[\s-]+/g, "");
  if (!/^[a-zA-Z]{16}$/.test(value)) {
    return { ok: false, error: `La contraseña de aplicación tiene 16 letras y tú pegaste ${value.length} caracteres. Revisa que copiaste las 16 letras completas.` };
  }
  return { ok: true, value: value.toLowerCase() };
}

/** Traduce errores de Gmail/red a un mensaje en español con la solución. */
export function friendlyMailError(e: unknown, email = ""): string {
  if (e instanceof MailError) return e.message;
  const err = e as { code?: string; message?: string; response?: string; responseText?: string; authenticationFailed?: boolean };
  const text = `${err?.code ?? ""} ${err?.message ?? ""} ${err?.response ?? ""} ${err?.responseText ?? ""}`;

  if (/MAIL_ENCRYPTION_KEY|contraseña guardada/.test(text)) return err.message!;
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENETUNREACH|EHOSTUNREACH|timed? ?out|socket hang up/i.test(text)) {
    return "No hay conexión con Gmail. Revisa que tengas internet y vuelve a intentar.";
  }
  if (/Application-specific password required|5\.7\.9/i.test(text)) {
    return "Esa es tu contraseña normal de Google. Necesitas la contraseña de aplicación de 16 letras (paso 3).";
  }
  if (/WEBALERT|web ?login required|5\.7\.14|Please log in via your web browser/i.test(text)) {
    return "Google pidió confirmar el acceso. Entra a Gmail en tu navegador, revisa que tengas activa la verificación en 2 pasos (paso 2) y vuelve a intentar.";
  }
  if (/IMAP access is disabled|IMAP.*disabled/i.test(text)) {
    return "IMAP está apagado en esa cuenta. En Gmail ve a Configuración → Ver toda la configuración → Reenvío y POP/IMAP → Habilitar IMAP, y guarda.";
  }
  if (err?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|535|534|Username and Password not accepted|EAUTH/i.test(text)) {
    if (email && !/@(gmail|googlemail)\.com$/i.test(email)) {
      return "Google rechazó el acceso. Si este correo no es de Gmail ni de Google Workspace, no se puede conectar. Si sí lo es, revisa que copiaste las 16 letras de la contraseña de aplicación.";
    }
    return "Google rechazó la contraseña. Revisa que copiaste las 16 letras de la contraseña de aplicación (paso 3). Si todavía no activas la verificación en 2 pasos, primero activa el paso 2.";
  }
  if (/Too many simultaneous|\brate limit|try again later|\b421\b|\b454\b/i.test(text)) {
    return "Gmail está recibiendo demasiadas solicitudes. Espera unos minutos y vuelve a intentar.";
  }
  return `No se pudo conectar con Gmail: ${(err?.message ?? String(e)).slice(0, 160)}`;
}

// ───────────── Conexiones ─────────────

function imapClient(email: string, pass: string) {
  return new ImapFlow({
    host: IMAP_HOST,
    port: 993,
    secure: true,
    auth: { user: email, pass },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

function smtpTransport(email: string, pass: string) {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: 465,
    secure: true,
    auth: { user: email, pass },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
  });
}

async function withImap<T>(email: string, pass: string, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = imapClient(email, pass);
  // Evita que un error de socket tumbe el proceso
  client.on("error", () => {});
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

const passwordOf = (a: MailAccount) => decryptSecret(a.passwordEnc);

/** Prueba IMAP y SMTP. Lanza un error amigable si algo falla. */
export async function testCredentials(email: string, pass: string): Promise<void> {
  try {
    await withImap(email, pass, async () => {});
  } catch (e) {
    throw new MailError(friendlyMailError(e, email));
  }
  const smtp = smtpTransport(email, pass);
  try {
    await smtp.verify();
  } catch (e) {
    throw new MailError(friendlyMailError(e, email));
  } finally {
    smtp.close();
  }
}

export async function testAccount(a: MailAccount) {
  await testCredentials(a.email, passwordOf(a));
}

// ───────────── Envío ─────────────

export async function sendFromAccount(
  a: MailAccount,
  mail: { to: string; subject: string; text: string; inReplyTo?: string | null; fromName?: string },
): Promise<string> {
  const smtp = smtpTransport(a.email, passwordOf(a));
  try {
    const ref = mail.inReplyTo ? `<${normalizeMessageId(mail.inReplyTo)}>` : undefined;
    const info = await smtp.sendMail({
      from: mail.fromName ? { name: mail.fromName, address: a.email } : a.email,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(ref ? { inReplyTo: ref, references: [ref] } : {}),
    });
    return normalizeMessageId(info.messageId);
  } catch (e) {
    throw new MailError(friendlyMailError(e, a.email));
  } finally {
    smtp.close();
  }
}

// ───────────── Búsqueda de contactos ─────────────

export type ContactOption = { name: string; email: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "para", "sr", "sra", "lic", "ing"]);

/**
 * Busca por nombre en Recibidos y Enviados de todas las cuentas activas.
 * `hint` (la instrucción original) ayuda a ordenar: "Juan de OpenPay" favorece @openpay.
 */
export async function searchContacts(name: string, hint = ""): Promise<ContactOption[]> {
  const words = fold(name).split(/[^a-z0-9ñ@._-]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  if (!words.length) return [];
  const hintWords = fold(hint).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !STOP.has(w));
  const accounts = await prisma.mailAccount.findMany({ where: { enabled: true } });
  const own = new Set(accounts.map((a) => a.email.toLowerCase()));
  const found = new Map<string, { name: string; score: number; hits: number }>();

  const consider = (addr?: { name?: string; address?: string }) => {
    const email = addr?.address?.toLowerCase();
    if (!email || own.has(email) || /no-?reply|notifica|mailer-daemon/i.test(email)) return;
    const hay = fold(`${addr?.name ?? ""} ${email}`);
    const matched = words.filter((w) => hay.includes(w)).length;
    if (!matched) return;
    const domain = email.split("@")[1] ?? "";
    const bonus = hintWords.some((w) => domain.includes(w) && !words.includes(w)) ? 2 : 0;
    const prev = found.get(email);
    found.set(email, {
      name: prev?.name || addr?.name || "",
      score: Math.max(prev?.score ?? 0, matched + bonus),
      hits: (prev?.hits ?? 0) + 1,
    });
  };

  await Promise.all(
    accounts.map(async (a) => {
      try {
        await withImap(a.email, passwordOf(a), async (c) => {
          const boxes = await c.list();
          const sent = boxes.find((b) => b.specialUse === "\\Sent")?.path;
          for (const path of ["INBOX", ...(sent ? [sent] : [])]) {
            const lock = await c.getMailboxLock(path, { readOnly: true });
            try {
              const uids = (await c.search({ or: [{ from: words[0] }, { to: words[0] }] }, { uid: true })) || [];
              const recent = uids.sort((x, y) => x - y).slice(-40);
              if (!recent.length) continue;
              for (const m of await c.fetchAll(recent, { envelope: true }, { uid: true })) {
                for (const addr of [...(m.envelope?.from ?? []), ...(m.envelope?.to ?? []), ...(m.envelope?.cc ?? [])]) consider(addr);
              }
            } finally {
              lock.release();
            }
          }
        });
      } catch {
        // Una cuenta con error no debe impedir buscar en las demás
      }
    }),
  );

  return [...found.entries()]
    .sort((a, b) => b[1].score - a[1].score || b[1].hits - a[1].hits)
    .slice(0, 5)
    .map(([email, v]) => ({ email, name: v.name }));
}

// ───────────── Monitoreo ─────────────

type Candidate = {
  account: MailAccount;
  messageId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  text: string;
  receivedAt: Date;
  replyTo: string | null; // messageId de SentMail si es respuesta
};

type AccountProgress = { account: MailAccount; lastUid: number; uidValidity: string; candidates: Candidate[] };

export type CheckSummary = { accounts: number; newAlerts: number; errors: { label: string; error: string }[] };

const firstAddress = (a?: AddressObject | AddressObject[]) => (Array.isArray(a) ? a[0] : a)?.value?.[0];

async function readAccount(account: MailAccount): Promise<AccountProgress> {
  return withImap(account.email, passwordOf(account), async (c) => {
    const lock = await c.getMailboxLock("INBOX", { readOnly: true });
    try {
      const box = c.mailbox;
      if (!box) throw new Error("No se pudo abrir la bandeja de entrada.");
      const uidValidity = String(box.uidValidity);
      // Primera revisión o la bandeja cambió (UIDVALIDITY distinto): solo las últimas 24 h
      const fresh = account.lastUid == null || account.uidValidity !== uidValidity;
      const query = fresh
        ? { gmraw: "category:primary newer_than:1d" }
        : { uid: `${account.lastUid! + 1}:*`, gmraw: "category:primary" };
      const since = fresh ? 0 : account.lastUid!;
      const uids = ((await c.search(query, { uid: true })) || []).filter((u) => u > since).sort((a, b) => a - b);
      const pick = uids.slice(-MAX_PER_CHECK);
      const lastUid = Math.max(since, box.uidNext - 1, ...uids);

      const messages: FetchMessageObject[] = pick.length
        ? await c.fetchAll(pick, { uid: true, internalDate: true, source: { maxLength: 200_000 } }, { uid: true })
        : [];

      const candidates: Candidate[] = [];
      for (const m of messages) {
        if (!m.source) continue;
        const p = await simpleParser(m.source).catch(() => null);
        if (!p) continue;
        const from = firstAddress(p.from);
        if (!from?.address || from.address.toLowerCase() === account.email.toLowerCase()) continue;
        const refs = [
          ...(p.inReplyTo ? [p.inReplyTo] : []),
          ...(Array.isArray(p.references) ? p.references : p.references ? p.references.split(/\s+/) : []),
        ].map(normalizeMessageId).filter(Boolean);
        const sent = refs.length
          ? await prisma.sentMail.findFirst({ where: { messageId: { in: refs } }, select: { messageId: true } })
          : null;
        const text = (p.text || (p.html || "").replace(/<style[\s\S]*?<\/style>|<[^>]+>/g, " ") || "").replace(/\s+/g, " ").trim();
        candidates.push({
          account,
          messageId: p.messageId ? normalizeMessageId(p.messageId) : `uid-${uidValidity}-${m.uid}`,
          fromName: from.name || from.address,
          fromEmail: from.address,
          subject: p.subject || "(sin asunto)",
          text: text.slice(0, 1500),
          receivedAt: p.date ?? (m.internalDate ? new Date(m.internalDate) : new Date()),
          replyTo: sent?.messageId ?? null,
        });
      }
      return { account, lastUid, uidValidity, candidates };
    } finally {
      lock.release();
    }
  });
}

/** Gemini decide en un solo lote qué correos son importantes y los resume en 1 línea. */
async function classify(items: Candidate[]): Promise<Map<number, { important: boolean; summary: string }>> {
  const out = new Map<number, { important: boolean; summary: string }>();
  if (!items.length) return out;
  const { profileName, profileRole } = await getSettings(["profileName", "profileRole"]);
  const res = await generateJSON<{ results: { index: number; important: boolean; summary: string }[] }>(
    `Eres Valeria Ochoa, asistente personal de ${profileName} (${profileRole}). Revisas correos nuevos y decides cuáles son IMPORTANTES. Importante = clientes, pagos, bancos, OpenPay, Hostinger, proveedores, citas, fechas límite y temas legales. NO son importantes: boletines, promociones, notificaciones automáticas sin acción, redes sociales. Para cada correo da un resumen de 1 línea (máx. 20 palabras) en español de México que diga qué pasa y qué hay que hacer.`,
    items.map((c, i) => `#${i}\nDe: ${c.fromName} <${c.fromEmail}>\nAsunto: ${c.subject}\nTexto: ${c.text}`).join("\n\n---\n\n"),
    {
      type: Type.OBJECT,
      properties: {
        results: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { index: { type: Type.INTEGER }, important: { type: Type.BOOLEAN }, summary: { type: Type.STRING } },
            required: ["index", "important", "summary"],
          },
        },
      },
      required: ["results"],
    },
  );
  for (const r of res.results ?? []) out.set(r.index, { important: !!r.important, summary: (r.summary ?? "").slice(0, 300) });
  return out;
}

async function saveAlert(c: Candidate, kind: "respuesta" | "importante", summary: string): Promise<boolean> {
  const exists = await prisma.mailAlert.findUnique({ where: { accountId_messageId: { accountId: c.account.id, messageId: c.messageId } } });
  if (exists) return false;
  await prisma.mailAlert.create({
    data: {
      accountId: c.account.id, kind, fromName: c.fromName, fromEmail: c.fromEmail, subject: c.subject.slice(0, 300),
      summary, messageId: c.messageId, receivedAt: c.receivedAt,
    },
  });
  return true;
}

async function runCheck(): Promise<CheckSummary> {
  const accounts = await prisma.mailAccount.findMany({ where: { enabled: true } });
  const summary: CheckSummary = { accounts: accounts.length, newAlerts: 0, errors: [] };
  const progress: AccountProgress[] = [];

  await Promise.all(
    accounts.map(async (a) => {
      try {
        progress.push(await readAccount(a));
      } catch (e) {
        const error = friendlyMailError(e, a.email);
        summary.errors.push({ label: a.label, error });
        await prisma.mailAccount.update({ where: { id: a.id }, data: { lastError: error, lastCheckedAt: new Date() } });
      }
    }),
  );

  // Respuestas a correos enviados desde MeWork: no necesitan a Gemini
  const all = progress.flatMap((p) => p.candidates);
  for (const c of all.filter((c) => c.replyTo)) {
    const snippet = c.text.slice(0, 160) || "Abre el correo para verlo.";
    if (await saveAlert(c, "respuesta", `Te respondió: ${snippet}`)) summary.newAlerts++;
  }

  // El resto va a Gemini en un solo lote
  const rest = all.filter((c) => !c.replyTo);
  let geminiError: string | null = null;
  try {
    const verdicts = await classify(rest);
    for (const [i, c] of rest.entries()) {
      const v = verdicts.get(i);
      if (v?.important && (await saveAlert(c, "importante", v.summary || c.subject))) summary.newAlerts++;
    }
  } catch (e) {
    geminiError = `No se pudo revisar con Gemini: ${friendlyAIError(e)}`;
    summary.errors.push({ label: "Gemini", error: geminiError });
  }

  for (const p of progress) {
    // Si Gemini falló y había correos por clasificar, no avanzamos: se reintenta en la próxima revisión
    const retry = geminiError && p.candidates.some((c) => !c.replyTo);
    await prisma.mailAccount.update({
      where: { id: p.account.id },
      data: {
        lastCheckedAt: new Date(),
        lastError: retry ? geminiError : null,
        ...(retry ? {} : { lastUid: p.lastUid, uidValidity: p.uidValidity }),
      },
    });
  }

  await setSetting("mailLastRunAt", new Date().toISOString());
  return summary;
}

const g = globalThis as typeof globalThis & { __meworkMailCheck?: Promise<CheckSummary> | null };

/** Revisa todas las cuentas activas. Si ya hay una revisión en curso, espera esa misma. */
export function checkAllMailboxes(): Promise<CheckSummary> {
  if (!g.__meworkMailCheck) {
    g.__meworkMailCheck = runCheck().finally(() => {
      g.__meworkMailCheck = null;
    });
  }
  return g.__meworkMailCheck;
}

/** Lo llama el temporizador: solo revisa si está activado y ya pasó la frecuencia elegida. */
export async function runScheduledCheck(): Promise<CheckSummary | null> {
  if ((await getSetting("mailAutoCheck")) !== "true") return null;
  const hours = [1, 2, 4].includes(Number(await getSetting("mailCheckHours"))) ? Number(await getSetting("mailCheckHours")) : 2;
  const last = Date.parse(await getSetting("mailLastRunAt"));
  if (Number.isFinite(last) && Date.now() - last < hours * 3_600_000 - 60_000) return null;
  if (!(await prisma.mailAccount.count({ where: { enabled: true } }))) return null;
  return checkAllMailboxes();
}
