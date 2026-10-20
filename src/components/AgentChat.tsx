"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Cpu, Eraser, FileText, Loader2, MessageCircleQuestion, Paperclip, Rocket, SendHorizontal, Settings2, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { ModelPicker, useGeminiModels } from "./ModelPicker";
import { EmailDraftCard } from "./EmailDraftCard";
import { clearAgentMemory, getAgentMessages, sendAgentMessage, setAgentModels, type ChatMode } from "@/app/actions";
import { listMailAccounts, type MailAccountView } from "@/app/mail-actions";
import { decodeDraft, parseLegacyDraft } from "@/lib/email-draft";
import { splitAttachmentNames, withAttachmentNames } from "@/lib/attachment-names";

// Lo que Gemini puede leer (Word y Excel se convierten a texto en el servidor)
const ACCEPT = "image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf,audio/*,video/*,.docx,.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt,.md,.json,.xml,.html,.htm,.rtf";
const MAX_BYTES = 18 * 1024 * 1024;

export type ChatAgent = {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
  color: string;
  consultModel: string | null;
  taskModel: string | null;
};
type Msg = { id: string; role: string; content: string; mode?: string | null; model?: string | null };

const MODES: { id: ChatMode; label: string; desc: string; icon: typeof Rocket }[] = [
  { id: "consulta", label: "Consulta", desc: "Preguntas rápidas · modelo ligero", icon: MessageCircleQuestion },
  { id: "tareas", label: "Tareas", desc: "Trabajo preciso · modelo fuerte", icon: Rocket },
];

const SUGGESTIONS: Record<string, string[]> = {
  marketing: ["Dame 3 ideas de TikTok para esta semana", "Escribe un guion de 30 segundos para Torre B"],
  restaurante: ["¿Qué promoción hacemos este fin de semana?", "Analiza cómo mejorar la calificación de servicio"],
  software: ["¿Qué falta para activar los pagos con OpenPay?", "¿Cómo evitamos boletos falsificados?"],
  asistente: ["Escríbele un correo a OpenPay para activar los cobros de los boletos.", "Organiza mis pendientes de mañana"],
};

function suggestionsFor(role: string) {
  const r = role.toLowerCase();
  if (/restaur/.test(r)) return SUGGESTIONS.restaurante;
  if (/software|ciber|program|desarroll/.test(r)) return SUGGESTIONS.software;
  if (/asistente|personal|agenda/.test(r)) return SUGGESTIONS.asistente;
  if (/marketing|tiktok|redes/.test(r)) return SUGGESTIONS.marketing;
  return ["¿En qué me puedes ayudar?", "Revisa mis prioridades de la semana"];
}

function renderText(text: string) {
  // Negritas **x** con saltos de línea preservados
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

export function AgentChat({
  agent,
  onClose,
  autoPrompt,
}: {
  agent: ChatAgent | null;
  onClose: () => void;
  /** Mensaje que se envía solo al abrir (p. ej. "responde este correo" desde los avisos). */
  autoPrompt?: { text: string; replyToAlertId?: string } | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [accounts, setAccounts] = useState<MailAccountView[] | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoSent = useRef<typeof autoPrompt>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ChatMode>("consulta");
  const [menuOpen, setMenuOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [models, setModels] = useState({ consult: "", task: "" });
  const [savingModels, startSave] = useTransition();
  const modelData = useGeminiModels();

  useEffect(() => {
    if (!agent) return;
    setModels({ consult: agent.consultModel ?? "", task: agent.taskModel ?? "" });
    setMode("consulta");
    setMenuOpen(false);
    setConfigOpen(false);
    setMessages([]);
    setFiles([]);
    setError("");
    setLoading(true);
    setLoadedFor(null);
    getAgentMessages(agent.id)
      .then(setMessages)
      .finally(() => {
        setLoading(false);
        setLoadedFor(agent.id);
      });
    setAccounts(null);
    listMailAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [agent]);

  useEffect(() => {
    // Espera a que cargue el historial de este agente para no perder el mensaje
    if (!agent || loadedFor !== agent.id || !autoPrompt || autoSent.current === autoPrompt) return;
    autoSent.current = autoPrompt;
    send(autoPrompt.text, autoPrompt.replyToAlertId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, loadedFor, autoPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!agent) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agent, onClose]);

  if (!agent) return null;

  // Mismo orden de respaldo que el servidor
  const globalModel = modelData?.defaultModel || "modelo global";
  const modelFor = (m: ChatMode) =>
    (m === "tareas" ? models.task || models.consult : models.consult || models.task) || globalModel;
  const current = MODES.find((m) => m.id === mode)!;

  const saveModels = () =>
    startSave(async () => {
      const r = await setAgentModels(agent.id, models.consult.trim() || null, models.task.trim() || null);
      if (r.ok) setConfigOpen(false);
      else setError(r.error);
    });

  const addFiles = (list: Iterable<File>) => {
    const next = [...files, ...list];
    if (next.reduce((s, f) => s + f.size, 0) > MAX_BYTES) {
      setError("Los archivos pesan demasiado (máximo 18 MB en total).");
      return;
    }
    setError("");
    setFiles(next);
  };

  const send = (text: string, replyToAlertId?: string) => {
    const attached = files;
    if ((!text.trim() && !attached.length) || sending) return;
    setError("");
    setInput("");
    setFiles([]);
    const temp: Msg = { id: `tmp-${Date.now()}`, role: "user", content: withAttachmentNames(text.trim(), attached.map((f) => f.name)), mode };
    setMessages((m) => [...m, temp]);
    start(async () => {
      const r = await sendAgentMessage(agent.id, text, mode, { replyToAlertId, files: attached });
      if (r.ok) setMessages((m) => [...m, { id: r.messageId, role: "model", content: r.reply, mode, model: r.model }]);
      else {
        setError(r.error);
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        setInput(text);
        setFiles(attached);
      }
    });
  };

  const clear = async () => {
    if (!confirm(`¿Borrar toda la memoria de ${agent.name}? Olvidará esta conversación.`)) return;
    await clearAgentMemory(agent.id);
    setMessages([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-stone-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-sand-50 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
          <Avatar name={agent.name} src={agent.avatar} color={agent.color} size={42} online />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{agent.name}</p>
            <p className="truncate text-xs text-stone-500">{agent.role} · {sending ? "Escribiendo…" : "Listo para ayudarte"}</p>
          </div>
          <button onClick={clear} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Borrar memoria">
            <Eraser className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
          {loading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-stone-400" />}
          {!loading && messages.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-sm text-stone-500">Pídele algo a {agent.name.split(" ")[0]}:</p>
              <div className="mt-3 flex flex-col gap-2">
                {suggestionsFor(agent.role).map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-500">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id}>
              <Bubble
                msg={m}
                accounts={accounts}
                onRequestChanges={() => {
                  setInput("Cambia el correo: ");
                  inputRef.current?.focus();
                }}
              />
              {m.role === "model" && m.model && (
                <p className="mt-1 ml-1 flex items-center gap-1 text-[10px] text-stone-400">
                  {m.mode === "tareas" ? <Rocket className="h-3 w-3" /> : <MessageCircleQuestion className="h-3 w-3" />}
                  {m.mode === "tareas" ? "Tareas" : "Consulta"} · <span className="font-mono">{m.model}</span>
                </p>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex w-fit gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {configOpen && (
          <div className="space-y-3 border-t border-stone-200 bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-bold"><Cpu className="h-4 w-4 text-brand-700" /> Modelos de {agent.name.split(" ")[0]}</p>
            <ModelPicker label="Consulta (modelo ligero)" value={models.consult} onChange={(v) => setModels((m) => ({ ...m, consult: v }))} />
            <ModelPicker label="Tareas (modelo fuerte)" value={models.task} onChange={(v) => setModels((m) => ({ ...m, task: v }))} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfigOpen(false)} className="btn-ghost px-3 py-1.5 text-xs">Cancelar</button>
              <button type="button" onClick={saveModels} disabled={savingModels} className="btn-primary px-3 py-1.5 text-xs">
                {savingModels && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar modelos
              </button>
            </div>
          </div>
        )}

        {/* Selector de tema de conversación */}
        <div className="relative flex items-center gap-2 border-t border-stone-200 bg-white px-3 pt-3">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`flex min-w-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
              mode === "tareas" ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-brand-200 bg-brand-50 text-brand-800"
            }`}
          >
            <current.icon className="h-3.5 w-3.5 shrink-0" />
            {current.label}
            <span className="truncate font-mono font-normal opacity-70">· {modelFor(mode)}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="absolute bottom-full left-3 z-20 mb-2 w-72 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold tracking-wide text-stone-400 uppercase">Tema de conversación</p>
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    role="menuitemradio"
                    aria-checked={mode === m.id}
                    onClick={() => {
                      setMode(m.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-sand-100"
                  >
                    <m.icon className={`mt-0.5 h-4 w-4 ${m.id === "tareas" ? "text-indigo-600" : "text-brand-700"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{m.label}</span>
                      <span className="block text-xs text-stone-500">{m.desc}</span>
                      <span className="block truncate font-mono text-[11px] text-stone-400">{modelFor(m.id)}</span>
                    </span>
                    {mode === m.id && <Check className="mt-0.5 h-4 w-4 text-brand-700" />}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setConfigOpen(true);
                  }}
                  className="flex w-full items-center gap-2 border-t border-stone-100 px-4 py-2.5 text-xs font-semibold text-stone-600 hover:bg-sand-100"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Configurar modelos…
                </button>
              </div>
            </>
          )}
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 bg-white px-3 pt-3">
            {files.map((f, i) => (
              <FileChip key={`${f.name}-${i}`} file={f} onRemove={() => setFiles((l) => l.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          className="flex items-end gap-2 bg-white p-3"
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            title="Adjuntar imágenes o archivos (PDF, Word, Excel…)"
            aria-label="Adjuntar archivos"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              // Pegar imágenes (o archivos copiados) directo en el chat, como en Gemini
              const pasted = [...e.clipboardData.items]
                .filter((it) => it.kind === "file")
                .map((it) => it.getAsFile())
                .filter((f): f is File => !!f)
                .map((f) => (f.name && f.name !== "image.png" ? f : new File([f], `imagen-${Date.now()}.${f.type.split("/")[1] || "png"}`, { type: f.type })));
              if (pasted.length) {
                e.preventDefault();
                addFiles(pasted);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            className="input max-h-32 resize-none"
            placeholder={`Escríbele a ${agent.name.split(" ")[0]}…`}
          />
          <button disabled={sending || (!input.trim() && !files.length)} className="btn-primary h-10 w-10 shrink-0 p-0" aria-label="Enviar">
            <SendHorizontal className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="relative flex max-w-[180px] items-center gap-2 rounded-xl border border-stone-200 bg-sand-50 p-1.5 pr-6 text-xs">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={file.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-stone-500">
          <FileText className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold">{file.name}</span>
        <span className="block text-stone-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
      </span>
      <button type="button" onClick={onRemove} className="absolute top-1 right-1 rounded-full p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700" aria-label={`Quitar ${file.name}`}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Bubble({
  msg,
  accounts,
  onRequestChanges,
}: {
  msg: Msg;
  accounts: MailAccountView[] | null;
  onRequestChanges: () => void;
}) {
  const mine = msg.role === "user";
  const draft = !mine ? (decodeDraft(msg.content) ?? parseLegacyDraft(msg.content)) : null;

  if (mine) {
    const { text, names } = splitAttachmentNames(msg.content);
    return (
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-700 px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
        {text}
        {names.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${text ? "mt-2" : ""}`}>
            {names.map((n, i) => (
              <span key={i} className="flex max-w-full items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs">
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{n}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (draft) {
    // Los borradores antiguos (texto "Para:/Asunto:") no se guardan como borrador estructurado
    const saved = !msg.id.startsWith("tmp-") && decodeDraft(msg.content) ? msg.id : null;
    return <EmailDraftCard draft={draft} messageId={saved} accounts={accounts} onRequestChanges={onRequestChanges} />;
  }

  return (
    <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm">
      {renderText(msg.content)}
    </div>
  );
}
