"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Loader2, Mail, Pencil, Plus, RefreshCw, ShieldCheck,
  Star, Trash2, Zap,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { ALERTS_EVENT } from "@/components/MailAlerts";
import { Section } from "./SettingsForm";
import {
  checkMailNow, connectMailAccount, removeMailAccount, renameMailAccount, saveMailMonitor, setDefaultMailAccount,
  testMailAccount, type MailAccountView,
} from "@/app/mail-actions";

export function timeAgo(iso: string | null) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function MailAccounts({
  accounts,
  autoCheck,
  hours,
  lastRunAt,
}: {
  accounts: MailAccountView[];
  autoCheck: boolean;
  hours: number;
  lastRunAt: string | null;
}) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, startCheck] = useTransition();
  const [, startSave] = useTransition();
  const [auto, setAuto] = useState(autoCheck);
  const [freq, setFreq] = useState(hours);

  const saveMonitor = (a: boolean, h: number) => {
    setAuto(a);
    setFreq(h);
    startSave(async () => {
      const r = await saveMailMonitor(a, h);
      setMsg(r.ok ? { ok: true, text: a ? `Revisaré tus correos cada ${h} ${h === 1 ? "hora" : "horas"}.` : "Revisión automática apagada." } : { ok: false, text: r.error });
    });
  };

  const checkNow = () =>
    startCheck(async () => {
      setMsg(null);
      const r = await checkMailNow();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      const base = r.newAlerts ? `Listo: ${r.newAlerts} ${r.newAlerts === 1 ? "aviso nuevo" : "avisos nuevos"}. Ábrelos en la campanita.` : "Listo: no hay nada nuevo importante.";
      setMsg({ ok: !r.errors.length, text: r.errors.length ? `${base} Problemas: ${r.errors.join(" · ")}` : base });
      window.dispatchEvent(new Event(ALERTS_EVENT));
      router.refresh();
    });

  return (
    <div className="mt-6">
      <Section icon={Mail} title="Cuentas de correo" desc="Conecta tus cuentas de Gmail para que Valeria envíe correos (solo con tu aprobación) y te avise de lo importante.">
        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center">
            <p className="text-sm text-stone-600">Aún no tienes cuentas conectadas.</p>
            <p className="mt-1 text-xs text-stone-500">Te guiamos paso a paso; toma unos 3 minutos.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} onMessage={setMsg} />
            ))}
          </div>
        )}

        <button type="button" onClick={() => setWizardOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Conectar cuenta de Gmail
        </button>

        <div className="space-y-3 border-t border-stone-100 pt-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">Revisar mis correos automáticamente</span>
              <span className="block text-xs text-stone-500">
                Te aviso de respuestas y correos importantes. Última revisión: {timeAgo(lastRunAt)}.
              </span>
            </span>
            <Switch checked={auto} onChange={(v) => saveMonitor(v, freq)} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-stone-600">Revisar cada</span>
            <select
              value={freq}
              onChange={(e) => saveMonitor(auto, Number(e.target.value))}
              disabled={!auto}
              className="input w-auto py-1.5"
            >
              <option value={1}>1 hora</option>
              <option value={2}>2 horas</option>
              <option value={4}>4 horas</option>
            </select>
            <button type="button" onClick={checkNow} disabled={checking || !accounts.length} className="btn-outline ml-auto">
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {checking ? "Revisando…" : "Revisar ahora"}
            </button>
          </div>
          <p className="text-xs text-stone-400">La revisión automática funciona mientras MeWork esté encendido.</p>
        </div>

        {msg && (
          <p className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            {msg.text}
          </p>
        )}
      </Section>

      <ConnectWizard
        open={wizardOpen}
        existing={accounts.map((a) => a.label)}
        onClose={() => setWizardOpen(false)}
        onDone={(label) => {
          setWizardOpen(false);
          setMsg({ ok: true, text: `¡Listo! La cuenta ${label} quedó conectada.` });
          router.refresh();
        }}
      />
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-emerald-500" : "bg-stone-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

function AccountCard({ account: a, onMessage }: { account: MailAccountView; onMessage: (m: { ok: boolean; text: string }) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(a.label);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      onMessage(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Algo salió mal." });
      router.refresh();
    });

  return (
    <div className="rounded-2xl border border-stone-200 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setEditing(false);
                run(() => renameMailAccount(a.id, label), "Nombre actualizado.");
              }}
            >
              <input value={label} onChange={(e) => setLabel(e.target.value)} className="input py-1" autoFocus maxLength={40} />
              <button className="btn-primary px-3 py-1 text-xs">Guardar</button>
            </form>
          ) : (
            <p className="flex items-center gap-2 font-semibold">
              {a.label}
              <button type="button" onClick={() => setEditing(true)} className="rounded p-0.5 text-stone-400 hover:text-stone-700" aria-label="Cambiar nombre">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </p>
          )}
          <p className="truncate text-sm text-stone-500">{a.email}</p>
        </div>
        {a.lastError ? (
          <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Con error
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Conectada
          </span>
        )}
      </div>

      {a.lastError && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{a.lastError}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={a.isDefault || pending}
          onClick={() => run(() => setDefaultMailAccount(a.id), `${a.label} es ahora tu cuenta predeterminada para enviar.`)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${a.isDefault ? "bg-amber-50 text-amber-800" : "text-stone-500 hover:bg-stone-100"}`}
          title="Cuenta que se usa para enviar si no eliges otra"
        >
          <Star className={`h-3.5 w-3.5 ${a.isDefault ? "fill-amber-400 text-amber-500" : ""}`} />
          {a.isDefault ? "Predeterminada para enviar" : "Usar como predeterminada"}
        </button>
        <span className="text-xs text-stone-400">Última revisión: {timeAgo(a.lastCheckedAt)}</span>
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={pending} onClick={() => run(() => testMailAccount(a.id), `${a.label} funciona correctamente.`)} className="btn-outline px-3 py-1.5 text-xs">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Probar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(`¿Desconectar ${a.label} (${a.email})? MeWork olvidará su contraseña de aplicación.`)) {
                run(() => removeMailAccount(a.id), `${a.label} se desconectó.`);
              }
            }}
            className="btn-ghost px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Desconectar
          </button>
        </div>
      </div>
    </div>
  );
}

const SUGGESTED = ["Toram", "Personal", "Negocio"];
const STEPS = ["Tu cuenta", "Verificación en 2 pasos", "Contraseña de aplicación", "Conectar"];

function ConnectWizard({
  open,
  existing,
  onClose,
  onDone,
}: {
  open: boolean;
  existing: string[];
  onClose: () => void;
  onDone: (label: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const close = () => {
    setStep(0);
    setLabel("");
    setEmail("");
    setPassword("");
    setError("");
    onClose();
  };

  const next = () => {
    setError("");
    if (step === 0) {
      if (!label.trim()) return setError("Escribe un nombre para la cuenta, por ejemplo Toram.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Escribe tu correo completo, por ejemplo nombre@gmail.com");
    }
    setStep((s) => s + 1);
  };

  const connect = () =>
    start(async () => {
      setError("");
      const r = await connectMailAccount(label, email, password);
      if (!r.ok) return setError(r.error);
      const l = label.trim();
      close();
      onDone(l);
    });

  const letters = password.replace(/[\s-]+/g, "").length;

  return (
    <Modal open={open} onClose={close} title="Conectar cuenta de Gmail" size="md">
      {/* Progreso */}
      <div className="mb-5">
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-[#1d1d1f]" : "bg-stone-200"}`} />
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">Paso {step + 1} de {STEPS.length} · {STEPS[step]}</p>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="mw-label">Nombre de la cuenta</label>
            <input id="mw-label" value={label} onChange={(e) => setLabel(e.target.value)} className="input" placeholder="Ej. Toram" maxLength={40} autoFocus />
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTED.filter((s) => !existing.includes(s)).map((s) => (
                <button key={s} type="button" onClick={() => setLabel(s)} className={`rounded-full border px-3 py-1 text-xs ${label === s ? "border-[#1d1d1f] bg-[#1d1d1f] text-white" : "border-stone-300 hover:bg-stone-50"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="mw-email">Correo de Gmail</label>
            <input id="mw-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="nombre@gmail.com" autoComplete="off" />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-2xl bg-stone-50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-stone-600" />
            <p className="text-sm text-stone-700">
              Google solo permite conectar apps como MeWork si tu cuenta tiene la <strong>verificación en 2 pasos</strong> activa.
              Ábrela, inicia sesión con <strong>{email || "tu correo"}</strong> y sigue las instrucciones. Si ya está activa, solo continúa.
            </p>
          </div>
          <a href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noreferrer" className="btn-outline w-full">
            <ExternalLink className="h-4 w-4" /> Abrir verificación en 2 pasos
          </a>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="btn-outline w-full">
            <ExternalLink className="h-4 w-4" /> Abrir contraseñas de aplicación
          </a>
          <ol className="list-decimal space-y-2 rounded-2xl bg-stone-50 py-4 pr-4 pl-9 text-sm text-stone-700">
            <li>Revisa que arriba a la derecha aparezca <strong>{email || "tu correo"}</strong>.</li>
            <li>En “Nombre de la app” escribe <strong>MeWork</strong> y da clic en <strong>Crear</strong>.</li>
            <li>Google te mostrará <strong>16 letras</strong> en un recuadro amarillo. Cópialas.</li>
            <li>Regresa aquí y continúa.</li>
          </ol>
          <p className="text-xs text-stone-500">Esa contraseña solo sirve para MeWork. Si algún día quieres quitar el acceso, bórrala en esa misma página.</p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="mw-pass">Contraseña de aplicación (16 letras)</label>
            <input
              id="mw-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input font-mono tracking-widest"
              placeholder="abcd efgh ijkl mnop"
              autoComplete="off"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-stone-500">
              Puedes pegarla con o sin espacios. Llevas {letters} de 16 letras. Se guarda cifrada y nunca se vuelve a mostrar.
            </p>
          </div>
          <p className="text-xs text-stone-500">Al conectar probaremos que MeWork pueda leer y enviar correos de <strong>{email}</strong>.</p>
        </div>
      )}

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        {step > 0 ? (
          <button type="button" onClick={() => { setError(""); setStep((s) => s - 1); }} className="btn-ghost" disabled={pending}>
            <ArrowLeft className="h-4 w-4" /> Atrás
          </button>
        ) : (
          <button type="button" onClick={close} className="btn-ghost">Cancelar</button>
        )}
        {step < 3 ? (
          <button type="button" onClick={next} className="btn-primary">
            {step === 1 ? "Ya está activa" : step === 2 ? "Ya copié las 16 letras" : "Continuar"} <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={connect} disabled={pending || letters === 0} className="btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {pending ? "Probando…" : "Probar y conectar"}
          </button>
        )}
      </div>
    </Modal>
  );
}
