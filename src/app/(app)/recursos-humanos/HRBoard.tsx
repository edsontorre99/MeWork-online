"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertTriangle, BrainCircuit, Briefcase, Cake, Cpu, Loader2, MessageSquare, Pencil, Trash2, Upload, UserPlus, Users, Wand2,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { AgentChat } from "@/components/AgentChat";
import { ModelPicker } from "@/components/ModelPicker";
import { createAgent, deleteAgent, suggestHires, updateAgent, type AgentInput, type HireSuggestion } from "@/app/actions";

type Agent = AgentInput & { id: string; color: string; status: string; messages: number };

export function HRBoard({ agents }: { agents: Agent[] }) {
  const [form, setForm] = useState<{ mode: "create" | "edit"; initial: Partial<Agent> } | null>(null);
  const [chat, setChat] = useState<Agent | null>(null);
  const [, start] = useTransition();

  const remove = (a: Agent) => {
    if (!confirm(`¿Dar de baja a ${a.firstName} ${a.lastName}? Se borrará también su memoria.`)) return;
    start(async () => void (await deleteAgent(a.id)));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700"><Users className="h-4 w-4" /> Recursos Humanos</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Tu equipo remoto</h1>
          <p className="mt-1 text-stone-500">{agents.length} agentes de IA trabajando para ti, cada uno con su propia memoria.</p>
        </div>
        <button onClick={() => setForm({ mode: "create", initial: {} })} className="btn-primary">
          <UserPlus className="h-4 w-4" /> Contratar
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => (
          <article key={a.id} className="card flex flex-col p-5">
            <div className="flex items-start gap-4">
              <Avatar name={`${a.firstName} ${a.lastName}`} src={a.avatar} color={a.color} size={64} online />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-lg font-bold">{a.firstName} {a.lastName}</h2>
                <p className="flex items-center gap-1.5 text-sm text-stone-600"><Briefcase className="h-3.5 w-3.5" /> {a.role}</p>
                <p className="flex items-center gap-1.5 text-sm text-stone-500"><Cake className="h-3.5 w-3.5" /> {a.age} años</p>
              </div>
            </div>
            <p className="mt-4 line-clamp-3 flex-1 text-sm text-stone-600">{a.systemPrompt}</p>
            <div className="mt-3 space-y-1 rounded-xl bg-sand-100 px-3 py-2 text-[11px]">
              <p className="flex items-center gap-1.5 text-stone-500"><Cpu className="h-3 w-3" /> Consulta: <span className="truncate font-mono text-stone-700">{a.consultModel || "global"}</span></p>
              <p className="flex items-center gap-1.5 text-stone-500"><Cpu className="h-3 w-3" /> Tareas: <span className="truncate font-mono text-stone-700">{a.taskModel || a.consultModel || "global"}</span></p>
            </div>
            <p className="mt-2 text-xs text-stone-400">{a.messages} mensajes en memoria</p>
            <div className="mt-4 flex gap-2 border-t border-stone-100 pt-4">
              <button onClick={() => setChat(a)} className="btn-outline flex-1 px-3 py-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" /> Chatear
              </button>
              <button onClick={() => setForm({ mode: "edit", initial: a })} className="btn-ghost px-3 py-1.5 text-xs">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
              <button onClick={() => remove(a)} className="btn-ghost px-2 py-1.5 text-xs text-red-600 hover:bg-red-50" title="Dar de baja">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>

      <Recruiter onCustomize={(s) => setForm({ mode: "create", initial: s })} />

      <AgentFormModal state={form} onClose={() => setForm(null)} />
      <AgentChat
        agent={
          chat
            ? {
                id: chat.id, name: `${chat.firstName} ${chat.lastName}`, role: chat.role, avatar: chat.avatar, color: chat.color,
                consultModel: chat.consultModel ?? null, taskModel: chat.taskModel ?? null,
              }
            : null
        }
        onClose={() => setChat(null)}
      />
    </div>
  );
}

function Recruiter({ onCustomize }: { onCustomize: (a: Partial<Agent>) => void }) {
  const [data, setData] = useState<{ summary: string; suggestions: HireSuggestion[] } | null>(null);
  const [error, setError] = useState("");
  const [hired, setHired] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [hiring, startHire] = useTransition();

  const analyze = () =>
    start(async () => {
      setError("");
      setHired([]);
      const r = await suggestHires();
      if (r.ok) setData({ summary: r.summary, suggestions: r.suggestions });
      else setError(r.error);
    });

  const toInput = (s: HireSuggestion): AgentInput => ({
    firstName: s.firstName, lastName: s.lastName, age: s.age, role: s.role, avatar: s.avatar, systemPrompt: s.systemPrompt,
  });

  const hire = (s: HireSuggestion) =>
    startHire(async () => {
      const r = await createAgent(toInput(s));
      if (r.ok) setHired((h) => [...h, s.firstName + s.lastName]);
      else setError(r.error);
    });

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#1d1d1f] p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2"><BrainCircuit className="h-6 w-6 text-brand-200" /></div>
          <div>
            <h2 className="font-display text-xl font-bold">Reclutador de Talento Inteligente</h2>
            <p className="text-sm text-brand-100">Gemini analiza tus tareas y proyectos, detecta cuellos de botella y te sugiere a quién contratar.</p>
          </div>
        </div>
        <button onClick={analyze} disabled={pending} className="btn bg-white text-brand-900 hover:bg-brand-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {pending ? "Analizando carga de trabajo…" : data ? "Volver a analizar" : "Analizar mi carga de trabajo"}
        </button>
      </div>

      <div className="p-6">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!data && !pending && !error && (
          <p className="text-sm text-stone-500">Aún no hay análisis. Presiona el botón para que el reclutador revise tu semana.</p>
        )}
        {data && (
          <>
            <p className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {data.summary}
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              {data.suggestions.map((s) => {
                const done = hired.includes(s.firstName + s.lastName);
                return (
                  <article key={s.firstName + s.lastName} className="flex flex-col rounded-2xl border border-stone-200 p-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${s.firstName} ${s.lastName}`} src={s.avatar} size={56} />
                      <div className="min-w-0">
                        <p className="font-display font-bold">{s.firstName} {s.lastName}</p>
                        <p className="text-sm text-stone-600">{s.role} · {s.age} años</p>
                      </div>
                    </div>
                    <p className="mt-3 w-fit rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">Cuello de botella: {s.bottleneck}</p>
                    <p className="mt-3 text-sm text-stone-700">{s.reason}</p>
                    <p className="mt-2 flex-1 text-sm text-stone-500"><b className="text-stone-700">Funciones:</b> {s.functions}</p>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => hire(s)} disabled={done || hiring} className="btn-primary flex-1 text-xs">
                        <UserPlus className="h-3.5 w-3.5" /> {done ? "¡Contratado!" : "Contratar en un clic"}
                      </button>
                      {!done && (
                        <button onClick={() => onCustomize(toInput(s))} className="btn-outline text-xs" title="Editar antes de contratar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Reduce la foto a 256px para guardarla ligera en la base de datos. */
async function resizeImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function AgentFormModal({ state, onClose }: { state: { mode: "create" | "edit"; initial: Partial<Agent> } | null; onClose: () => void }) {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState("");

  // Reinicia el formulario cada vez que se abre con otros datos
  const formKey = state ? `${state.mode}-${state.initial.id ?? state.initial.firstName ?? "new"}` : "";
  if (formKey !== key) {
    setKey(formKey);
    setAvatar(state?.initial.avatar ?? null);
    setError("");
  }

  if (!state) return null;
  const { mode, initial } = state;

  const submit = (fd: FormData) =>
    start(async () => {
      const firstName = String(fd.get("firstName") ?? "").trim();
      const lastName = String(fd.get("lastName") ?? "").trim();
      const role = String(fd.get("role") ?? "").trim();
      let systemPrompt = String(fd.get("systemPrompt") ?? "").trim();
      if (mode === "create" && !/^eres\b/i.test(systemPrompt)) {
        systemPrompt = `Eres ${firstName} ${lastName}, ${role}. Tus funciones: ${systemPrompt} Respondes en español de México, de forma clara, práctica y con pasos concretos.`;
      }
      const consultModel = String(fd.get("consultModel") ?? "").trim() || null;
      const taskModel = String(fd.get("taskModel") ?? "").trim() || null;
      const data: AgentInput = { firstName, lastName, role, systemPrompt, age: Number(fd.get("age")), avatar, consultModel, taskModel };
      const r = mode === "create" ? await createAgent(data) : await updateAgent(initial.id!, data);
      if (r.ok) onClose();
      else setError(r.error);
    });

  return (
    <Modal open onClose={onClose} title={mode === "create" ? "Contratar nuevo agente" : "Editar perfil"} size="lg">
      <form key={key} action={submit} className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={`${initial.firstName ?? "N"} ${initial.lastName ?? "A"}`} src={avatar} color={initial.color} size={72} />
          <div className="flex-1 space-y-2">
            <span className="label">Foto / Avatar</span>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setAvatar(await resizeImage(f));
                }}
              />
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-outline px-3 py-1.5 text-xs">
                <Upload className="h-3.5 w-3.5" /> Subir foto
              </button>
              {avatar && (
                <button type="button" onClick={() => setAvatar(null)} className="btn-ghost px-3 py-1.5 text-xs">Quitar</button>
              )}
            </div>
            <input
              className="input py-1.5 text-xs"
              placeholder="…o pega la URL de una imagen"
              defaultValue={avatar && !avatar.startsWith("data:") ? avatar : ""}
              onBlur={(e) => e.target.value.trim() && setAvatar(e.target.value.trim())}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombres" name="firstName" defaultValue={initial.firstName} />
          <Field label="Apellidos" name="lastName" defaultValue={initial.lastName} />
          <Field label="Puesto / Cargo" name="role" defaultValue={initial.role} />
          <Field label="Edad" name="age" type="number" defaultValue={initial.age?.toString()} min={18} max={99} />
        </div>
        <div>
          <label className="label" htmlFor="systemPrompt">{mode === "create" ? "Descripción de funciones" : "System Prompt"}</label>
          <textarea
            id="systemPrompt"
            name="systemPrompt"
            defaultValue={initial.systemPrompt}
            rows={mode === "create" ? 4 : 7}
            required
            className="input"
            placeholder="Ej. Se encarga de revisar el código del sistema de boletos, detectar vulnerabilidades y proponer mejoras de seguridad."
          />
          <p className="mt-1 text-xs text-stone-500">
            {mode === "create"
              ? "Con esto se crean sus instrucciones para Gemini. Podrás afinarlas después en “Editar”."
              : "Instrucciones que definen la personalidad y el conocimiento del agente en Gemini."}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold"><Cpu className="h-4 w-4 text-brand-700" /> Modelos de Gemini</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ModelPicker name="consultModel" label="Consulta (ligero)" hint="Preguntas rápidas." defaultValue={initial.consultModel} />
            <ModelPicker name="taskModel" label="Tareas (fuerte)" hint="Trabajo preciso y profundo." defaultValue={initial.taskModel} />
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button disabled={pending} className="btn-primary">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? "Contratar y desplegar" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} required className="input" {...props} />
    </div>
  );
}
