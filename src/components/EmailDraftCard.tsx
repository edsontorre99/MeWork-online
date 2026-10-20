"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, MessageSquarePlus, Send, Trash2, UserRound } from "lucide-react";
import { Modal } from "./Modal";
import { discardDraft, sendApprovedMail, type MailAccountView } from "@/app/mail-actions";
import type { EmailDraft } from "@/lib/email-draft";

/** Borrador de correo de Valeria: editable y solo se envía con "Aprobar y enviar" + confirmación. */
export function EmailDraftCard({
  draft,
  messageId,
  accounts,
  onRequestChanges,
}: {
  draft: EmailDraft;
  messageId: string | null; // null si el mensaje aún no está guardado
  accounts: MailAccountView[] | null;
  onRequestChanges: () => void;
}) {
  const preferred = accounts?.find((a) => a.id === draft.accountId) ?? accounts?.find((a) => a.isDefault) ?? accounts?.[0];
  const [accountId, setAccountId] = useState<string>("");
  const [to, setTo] = useState(draft.toEmail);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [status, setStatus] = useState(draft.status);
  const [sentInfo, setSentInfo] = useState({ from: draft.sentFrom ?? "", to: draft.sentTo ?? draft.toEmail });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const fromId = accountId || preferred?.id || "";
  const from = accounts?.find((a) => a.id === fromId);

  if (status === "enviado") {
    return (
      <div className="max-w-[92%] rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="h-4 w-4" /> Correo enviado</p>
        <p className="mt-1 text-xs">“{subject}” · de {sentInfo.from || "tu cuenta"} a {sentInfo.to}</p>
      </div>
    );
  }
  if (status === "descartado") {
    return <p className="w-fit rounded-2xl bg-white px-4 py-2.5 text-sm text-stone-400 shadow-sm">Borrador descartado: “{subject}”</p>;
  }

  const approve = () => {
    setError("");
    if (!from) return setError("Primero conecta una cuenta de Gmail en Ajustes.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) return setError("Escribe o elige el correo del destinatario en “Para”.");
    if (!subject.trim()) return setError("Escribe el asunto.");
    setConfirming(true);
  };

  const send = () =>
    start(async () => {
      if (!from) return;
      const r = await sendApprovedMail({ accountId: from.id, to, subject, body, chatMessageId: messageId, inReplyTo: draft.inReplyTo });
      setConfirming(false);
      if (!r.ok) return setError(r.error);
      setSentInfo({ from: `${from.label} (${from.email})`, to: to.trim() });
      setStatus("enviado");
    });

  const discard = () =>
    start(async () => {
      if (messageId) await discardDraft(messageId);
      setStatus("descartado");
    });

  return (
    <div className="max-w-[96%] space-y-2">
      <p className="text-sm text-stone-600">{draft.intro}</p>
      {draft.missingInfo && (
        <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs whitespace-pre-wrap text-amber-900">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {draft.missingInfo}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="space-y-2 border-b border-stone-100 px-4 py-3 text-xs">
          <Row label="Enviar desde">
            {accounts === null ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" />
            ) : accounts.length ? (
              <select value={fromId} onChange={(e) => setAccountId(e.target.value)} className="w-full bg-transparent py-0.5 outline-none">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.label} · {a.email}</option>
                ))}
              </select>
            ) : (
              <Link href="/ajustes" className="text-brand-600 underline">Conecta una cuenta de Gmail en Ajustes</Link>
            )}
          </Row>
          <Row label="Para">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={draft.toName ? `Correo de ${draft.toName}` : "correo@ejemplo.com"} className="w-full bg-transparent py-0.5 outline-none" />
          </Row>
          {draft.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-[86px]">
              {draft.options.map((o) => (
                <button
                  key={o.email}
                  type="button"
                  onClick={() => setTo(o.email)}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${to === o.email ? "border-[#1d1d1f] bg-[#1d1d1f] text-white" : "border-stone-300 hover:bg-stone-50"}`}
                >
                  <UserRound className="h-3 w-3" /> {o.name ? `${o.name} · ` : ""}{o.email}
                </button>
              ))}
            </div>
          )}
          <Row label="Asunto">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full bg-transparent py-0.5 font-medium outline-none" />
          </Row>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(14, Math.max(5, body.split("\n").length + 1))}
          className="block w-full resize-y px-4 py-3 text-sm outline-none"
        />
        <div className="flex flex-wrap gap-2 border-t border-stone-100 bg-sand-50 px-4 py-2.5">
          <button type="button" onClick={approve} disabled={pending || !accounts?.length} className="btn-primary px-3 py-1.5 text-xs">
            <Send className="h-3.5 w-3.5" /> Aprobar y enviar
          </button>
          <button type="button" onClick={onRequestChanges} disabled={pending} className="btn-outline px-3 py-1.5 text-xs">
            <MessageSquarePlus className="h-3.5 w-3.5" /> Pedir cambios
          </button>
          <button type="button" onClick={discard} disabled={pending} className="btn-ghost ml-auto px-3 py-1.5 text-xs">
            <Trash2 className="h-3.5 w-3.5" /> Descartar
          </button>
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <Modal open={confirming} onClose={() => !pending && setConfirming(false)} title="¿Enviar este correo?" size="sm">
        <p className="text-sm text-stone-700">
          Se enviará desde <strong>{from?.label} ({from?.email})</strong> a <strong>{to.trim()}</strong>. ¿Confirmas?
        </p>
        <p className="mt-2 truncate text-xs text-stone-500">Asunto: {subject}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="btn-ghost">Cancelar</button>
          <button type="button" onClick={send} disabled={pending} className="btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {pending ? "Enviando…" : "Sí, enviar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[78px] shrink-0 font-semibold text-stone-500">{label}:</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
