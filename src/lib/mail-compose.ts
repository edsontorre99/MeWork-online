import "server-only";
import { Type } from "@google/genai";
import { prisma } from "./prisma";
import { generateJSON } from "./gemini";
import { getSettings } from "./settings";
import { searchContacts } from "./mail";
import type { EmailDraft } from "./email-draft";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valeria convierte una instrucción informal en un borrador estructurado (nunca lo envía). */
export async function composeEmailDraft(opts: {
  instruction: string;
  conversation: string;
  current: EmailDraft | null;
  reply?: { accountId: string; messageId: string } | null;
}): Promise<EmailDraft> {
  const { profileName, profileRole } = await getSettings(["profileName", "profileRole"]);
  const { instruction, conversation, current } = opts;

  const res = await generateJSON<{ toName: string; toEmail: string; subject: string; body: string; missingInfo: string }>(
    `Eres Valeria Ochoa, asistente personal de ${profileName} (${profileRole}). Redactas correos en español de México, profesionales, claros y cordiales, en nombre de ${profileName}.
Reglas:
- toName: nombre de la persona destinataria (sin empresa). toEmail: SOLO si la dirección aparece escrita en la instrucción, la conversación o el borrador actual; nunca la inventes, si no la sabes déjala vacía.
- body: saludo con el nombre, mensaje y una despedida corta (por ejemplo "Saludos cordiales,"). NO escribas nombre ni firma al final: se agregan solos.
- Si te piden cambiar el borrador actual, conserva todo lo que no se pidió cambiar.
- missingInfo: si falta un dato indispensable (fecha, monto, documento, etc.) escribe una pregunta corta para ${profileName}; si no falta nada, déjalo vacío. No preguntes por la dirección de correo.`,
    `${conversation ? `Conversación reciente:\n${conversation}\n\n` : ""}${current ? `Borrador actual:\nPara: ${current.toName} <${current.toEmail}>\nAsunto: ${current.subject}\n${current.body}\n\n` : ""}Instrucción de ${profileName}: ${instruction}`,
    {
      type: Type.OBJECT,
      properties: {
        toName: { type: Type.STRING },
        toEmail: { type: Type.STRING },
        subject: { type: Type.STRING },
        body: { type: Type.STRING },
        missingInfo: { type: Type.STRING },
      },
      required: ["toName", "toEmail", "subject", "body", "missingInfo"],
    },
  );

  const toName = (res.toName ?? "").trim();
  let toEmail = (res.toEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(toEmail)) toEmail = "";
  if (!toEmail && current?.toEmail && current.toName === toName) toEmail = current.toEmail;

  // Firma con el perfil de Ajustes (si Gemini no la puso ya)
  let body = (res.body ?? "").trim();
  if (!body.includes(profileName)) body += `\n${profileName}\n${profileRole}`;

  let options: EmailDraft["options"] = [];
  const missing: string[] = [];
  if (!toEmail && toName) {
    options = await searchContacts(toName, instruction);
    if (options.length === 1) {
      toEmail = options[0].email;
      options = [];
    } else if (options.length === 0) {
      const connected = await prisma.mailAccount.count({ where: { enabled: true } });
      missing.push(
        connected
          ? `No encontré el correo de ${toName} en tus cuentas. ¿Me lo pasas? Puedes escribirlo en el campo "Para".`
          : `No sé el correo de ${toName}. Escríbelo en el campo "Para" (si conectas tus cuentas de Gmail en Ajustes, yo lo busco).`,
      );
    }
  } else if (!toEmail) {
    missing.push("¿A quién se lo envío? Escribe el correo en el campo \"Para\".");
  }
  if (res.missingInfo?.trim()) missing.push(res.missingInfo.trim());

  const intro = options.length
    ? `Encontré varias personas llamadas ${toName}. Elige a quién va dirigido y revisa el correo:`
    : current && current.toName === toName
      ? "Listo, ya hice los cambios. Revísalo:"
      : "Listo, revisa el correo. Nada se envía hasta que tú lo apruebes:";

  return {
    intro,
    toName,
    toEmail,
    subject: (res.subject ?? "").trim(),
    body,
    missingInfo: missing.join("\n"),
    options,
    accountId: opts.reply?.accountId ?? current?.accountId ?? null,
    inReplyTo: opts.reply?.messageId ?? current?.inReplyTo ?? null,
    status: "borrador",
  };
}
