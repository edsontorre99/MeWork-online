// Formato del borrador de correo que Valeria guarda en el chat (lo leen el servidor y el navegador).

export const DRAFT_PREFIX = "[[MEWORK_CORREO]]";

export type DraftStatus = "borrador" | "enviado" | "descartado";

export type EmailDraft = {
  intro: string; // texto que Valeria dice arriba de la tarjeta
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  missingInfo: string;
  options: { name: string; email: string }[]; // posibles destinatarios encontrados
  accountId?: string | null; // cuenta sugerida para enviar
  inReplyTo?: string | null; // Message-ID al que responde
  status: DraftStatus;
  sentFrom?: string;
  sentTo?: string;
};

export const encodeDraft = (d: EmailDraft) => DRAFT_PREFIX + JSON.stringify(d);

export function decodeDraft(content: string): EmailDraft | null {
  if (!content.startsWith(DRAFT_PREFIX)) return null;
  try {
    return JSON.parse(content.slice(DRAFT_PREFIX.length)) as EmailDraft;
  } catch {
    return null;
  }
}

/** Versión legible del borrador para el historial que ve Gemini. */
export function draftAsText(d: EmailDraft) {
  const state = d.status === "enviado" ? " (ya enviado)" : d.status === "descartado" ? " (descartado)" : "";
  return `Borrador de correo${state}\nPara: ${d.toName} <${d.toEmail}>\nAsunto: ${d.subject}\n\n${d.body}`;
}

/** Borradores antiguos con formato "Para: / Asunto:". */
export function parseLegacyDraft(text: string): EmailDraft | null {
  const to = text.match(/^\s*\**Para:?\**:?\s*(.+)$/im)?.[1]?.trim();
  const subject = text.match(/^\s*\**Asunto:?\**:?\s*(.+)$/im)?.[1]?.trim();
  if (!to || !subject) return null;
  const after = text.split(/^\s*\**Asunto.*$/im)[1] ?? "";
  const email = to.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? "";
  return {
    intro: "Listo, revisa el correo:",
    toName: to.replace(email, "").replace(/[<>()]/g, "").trim(),
    toEmail: email,
    subject: subject.replace(/\*\*/g, ""),
    body: after.replace(/\*\*/g, "").trim(),
    missingInfo: "",
    options: [],
    status: "borrador",
  };
}

/** Palabras que indican que se pide redactar o cambiar un correo. */
export const EMAIL_INTENT = /\b(correo|e-?mail|mail|escr[ií]b(e|ele|eles|irle|irles)|redact[a-z]*|resp[oó]nde(le|les)?|contesta(le|les)?)\b/i;
