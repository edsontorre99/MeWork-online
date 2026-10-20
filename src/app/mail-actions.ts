"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getSettings, setSetting } from "@/lib/settings";
import { encryptSecret } from "@/lib/mail-crypto";
import {
  checkAllMailboxes, checkEmailAddress, cleanAppPassword, friendlyMailError, sendFromAccount, testAccount, testCredentials,
  MAX_SENDS_PER_HOUR,
} from "@/lib/mail";
import { decodeDraft, encodeDraft } from "@/lib/email-draft";
import type { Result } from "./actions";

// Errores de red/Gmail se traducen; los demás (sesión, validación) ya vienen en español
const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error && !("code" in e) && !("authenticationFailed" in e) ? e.message : friendlyMailError(e),
});

const refresh = () => {
  revalidatePath("/ajustes");
  revalidatePath("/dashboard");
};

// ───────────── Cuentas ─────────────

/** Lo que ve el navegador de cada cuenta: nunca incluye la contraseña. */
export type MailAccountView = {
  id: string;
  label: string;
  email: string;
  isDefault: boolean;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
};

export async function listMailAccounts(): Promise<MailAccountView[]> {
  await requireAuth();
  const rows = await prisma.mailAccount.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((a) => ({
    id: a.id, label: a.label, email: a.email, isDefault: a.isDefault, enabled: a.enabled,
    lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null, lastError: a.lastError,
  }));
}

export async function connectMailAccount(label: string, email: string, password: string): Promise<Result<{ id: string }>> {
  try {
    await requireAuth();
    label = label.trim();
    email = email.trim().toLowerCase();
    if (!label) return { ok: false, error: "Escribe un nombre para la cuenta, por ejemplo Toram." };
    const bad = checkEmailAddress(email);
    if (bad) return { ok: false, error: bad };
    const pw = cleanAppPassword(password);
    if (!pw.ok) return pw;

    await testCredentials(email, pw.value);

    const passwordEnc = encryptSecret(pw.value);
    const first = (await prisma.mailAccount.count()) === 0;
    // Si el correo ya estaba conectado, se actualiza (sirve para reconectar)
    const acc = await prisma.mailAccount.upsert({
      where: { email },
      create: { label, email, passwordEnc, isDefault: first },
      update: { label, passwordEnc, enabled: true, lastError: null },
    });
    refresh();
    return { ok: true, id: acc.id };
  } catch (e) {
    return fail(e);
  }
}

export async function testMailAccount(id: string): Promise<Result> {
  try {
    await requireAuth();
    const acc = await prisma.mailAccount.findUniqueOrThrow({ where: { id } });
    try {
      await testAccount(acc);
    } catch (e) {
      const error = friendlyMailError(e, acc.email);
      await prisma.mailAccount.update({ where: { id }, data: { lastError: error } });
      refresh();
      return { ok: false, error };
    }
    await prisma.mailAccount.update({ where: { id }, data: { lastError: null } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function renameMailAccount(id: string, label: string): Promise<Result> {
  try {
    await requireAuth();
    if (!label.trim()) return { ok: false, error: "El nombre no puede estar vacío." };
    await prisma.mailAccount.update({ where: { id }, data: { label: label.trim().slice(0, 40) } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMailAccount(id: string): Promise<Result> {
  try {
    await requireAuth();
    const acc = await prisma.mailAccount.delete({ where: { id } });
    // Si era la predeterminada, pasa a la siguiente
    if (acc.isDefault) {
      const next = await prisma.mailAccount.findFirst({ orderBy: { createdAt: "asc" } });
      if (next) await prisma.mailAccount.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setDefaultMailAccount(id: string): Promise<Result> {
  try {
    await requireAuth();
    await prisma.$transaction([
      prisma.mailAccount.updateMany({ data: { isDefault: false } }),
      prisma.mailAccount.update({ where: { id }, data: { isDefault: true } }),
    ]);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Revisión automática ─────────────

export async function saveMailMonitor(auto: boolean, hours: number): Promise<Result> {
  try {
    await requireAuth();
    if (![1, 2, 4].includes(hours)) return { ok: false, error: "Elige cada 1, 2 o 4 horas." };
    await setSetting("mailAutoCheck", auto ? "true" : "false");
    await setSetting("mailCheckHours", String(hours));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function checkMailNow(): Promise<Result<{ newAlerts: number; errors: string[] }>> {
  try {
    await requireAuth();
    if (!(await prisma.mailAccount.count({ where: { enabled: true } }))) {
      return { ok: false, error: "Primero conecta una cuenta de Gmail." };
    }
    const s = await checkAllMailboxes();
    refresh();
    return { ok: true, newAlerts: s.newAlerts, errors: s.errors.map((e) => `${e.label}: ${e.error}`) };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Envío con aprobación ─────────────

export async function sendApprovedMail(input: {
  accountId: string;
  to: string;
  subject: string;
  body: string;
  chatMessageId?: string | null;
  inReplyTo?: string | null;
}): Promise<Result<{ from: string }>> {
  try {
    await requireAuth();
    const to = input.to.trim();
    const subject = input.subject.trim();
    const body = input.body.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: "Escribe un correo de destino válido en \"Para\"." };
    if (!subject) return { ok: false, error: "Escribe el asunto." };
    if (!body) return { ok: false, error: "El correo está vacío." };

    const recent = await prisma.sentMail.count({ where: { sentAt: { gte: new Date(Date.now() - 3_600_000) } } });
    if (recent >= MAX_SENDS_PER_HOUR) {
      return { ok: false, error: `Por seguridad, MeWork envía máximo ${MAX_SENDS_PER_HOUR} correos por hora. Intenta más tarde.` };
    }

    const acc = await prisma.mailAccount.findUnique({ where: { id: input.accountId } });
    if (!acc) return { ok: false, error: "Esa cuenta ya no está conectada. Elige otra en \"Enviar desde\"." };

    const { profileName } = await getSettings(["profileName"]);
    const messageId = await sendFromAccount(acc, { to, subject, text: body, inReplyTo: input.inReplyTo, fromName: profileName });
    await prisma.sentMail.create({ data: { accountId: acc.id, to, subject, body, messageId } });

    // Marca el borrador del chat como enviado para que no se pueda reenviar por error
    if (input.chatMessageId) {
      const msg = await prisma.message.findUnique({ where: { id: input.chatMessageId } });
      const draft = msg ? decodeDraft(msg.content) : null;
      if (msg && draft) {
        await prisma.message.update({
          where: { id: msg.id },
          data: { content: encodeDraft({ ...draft, toEmail: to, subject, body, status: "enviado", sentFrom: `${acc.label} (${acc.email})`, sentTo: to }) },
        });
      }
    }
    return { ok: true, from: acc.email };
  } catch (e) {
    return fail(e);
  }
}

export async function discardDraft(chatMessageId: string): Promise<Result> {
  try {
    await requireAuth();
    const msg = await prisma.message.findUnique({ where: { id: chatMessageId } });
    const draft = msg ? decodeDraft(msg.content) : null;
    if (msg && draft) await prisma.message.update({ where: { id: msg.id }, data: { content: encodeDraft({ ...draft, status: "descartado" }) } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Avisos ─────────────

export type MailAlertView = {
  id: string;
  kind: string;
  accountLabel: string;
  accountEmail: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  summary: string;
  messageId: string;
  receivedAt: string;
  read: boolean;
};

export async function getMailAlerts(): Promise<{ unread: number; alerts: MailAlertView[] }> {
  await requireAuth();
  const [unread, rows] = await Promise.all([
    prisma.mailAlert.count({ where: { read: false } }),
    prisma.mailAlert.findMany({ orderBy: [{ read: "asc" }, { receivedAt: "desc" }], take: 40, include: { account: true } }),
  ]);
  return {
    unread,
    alerts: rows.map((a) => ({
      id: a.id, kind: a.kind, accountLabel: a.account.label, accountEmail: a.account.email, fromName: a.fromName,
      fromEmail: a.fromEmail, subject: a.subject, summary: a.summary, messageId: a.messageId,
      receivedAt: a.receivedAt.toISOString(), read: a.read,
    })),
  };
}

export async function markAlertRead(id: string): Promise<Result> {
  try {
    await requireAuth();
    await prisma.mailAlert.update({ where: { id }, data: { read: true } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markAllAlertsRead(): Promise<Result> {
  try {
    await requireAuth();
    await prisma.mailAlert.updateMany({ where: { read: false }, data: { read: true } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Datos para abrir el chat de la asistente con el contexto del aviso. */
export async function getAlertReplyContext(alertId: string): Promise<Result<{ agentId: string; prompt: string }>> {
  try {
    await requireAuth();
    const alert = await prisma.mailAlert.findUnique({ where: { id: alertId }, include: { account: true } });
    if (!alert) return { ok: false, error: "Ese aviso ya no existe." };
    const agent =
      (await prisma.agent.findFirst({ where: { firstName: "Valeria" } })) ??
      (await prisma.agent.findFirst({ where: { role: { contains: "Asistente" } } }));
    if (!agent) return { ok: false, error: "No encontré a tu asistente personal en el equipo." };
    await prisma.mailAlert.update({ where: { id: alertId }, data: { read: true } });
    const prompt = `Ayúdame a responder este correo que llegó a mi cuenta ${alert.account.label}.\nDe: ${alert.fromName} <${alert.fromEmail}>\nAsunto: ${alert.subject}\nResumen: ${alert.summary}\nEscribe una respuesta cordial para ${alert.fromEmail} con el asunto "${/^re:/i.test(alert.subject) ? alert.subject : `Re: ${alert.subject}`}".`;
    return { ok: true, agentId: agent.id, prompt };
  } catch (e) {
    return fail(e);
  }
}
