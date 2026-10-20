"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, CreditCard, KeyRound, Loader2, Sparkles, Trash2, UserRound, Zap } from "lucide-react";
import { removeSecret, saveSettings, testGemini } from "@/app/actions";
import { ModelPicker } from "@/components/ModelPicker";

type Values = Record<
  | "geminiApiKey" | "geminiModel" | "profileName" | "profileRole"
  | "openpayMerchantId" | "openpayPrivateKey" | "openpaySandbox" | "ticketEventName" | "ticketPrice",
  string
>;

export function SettingsForm({ values, hasGemini, hasOpenpay }: { values: Values; hasGemini: boolean; hasOpenpay: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (fd: FormData) =>
    start(async () => {
      const r = await saveSettings(fd);
      setMsg(r.ok ? { ok: true, text: "Cambios guardados." } : { ok: false, text: r.error });
    });

  const test = () =>
    startTest(async () => {
      // Guarda primero lo escrito (llave y modelo) para probar exactamente eso
      if (formRef.current) {
        const saved = await saveSettings(new FormData(formRef.current));
        if (!saved.ok) return setMsg({ ok: false, text: saved.error });
      }
      const r = await testGemini();
      setMsg(r.ok ? { ok: true, text: `Gemini (${r.model}) respondió: ${r.reply}` } : { ok: false, text: r.error });
    });

  const remove = (key: "geminiApiKey" | "openpayPrivateKey") =>
    start(async () => {
      await removeSecret(key);
      setMsg({ ok: true, text: "Llave eliminada." });
    });

  return (
    <form ref={formRef} action={submit} className="mt-8 space-y-6">
      <Section icon={Sparkles} title="Inteligencia Artificial · Gemini" desc="Todos los agentes, el planificador y el reclutador usan esta llave.">
        <div>
          <label className="label" htmlFor="geminiApiKey">API Key de Gemini</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                id="geminiApiKey"
                name="geminiApiKey"
                type="password"
                autoComplete="off"
                className="input pl-9"
                placeholder={hasGemini ? `Guardada (${values.geminiApiKey}) · escribe para reemplazar` : "AIza..."}
              />
            </div>
            {hasGemini && (
              <button type="button" onClick={() => remove("geminiApiKey")} className="btn-outline" title="Eliminar llave">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-stone-500">
            Consíguela gratis en{" "}
            <a className="font-medium text-brand-700 underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>
            . Se guarda en tu base de datos y nunca se muestra completa.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <ModelPicker
            name="geminiModel"
            label="Modelo general"
            placeholder="gemini-2.5-flash"
            hint="Lo usan el planificador, el reclutador y los agentes sin modelo propio."
            defaultValue={values.geminiModel}
          />
          <button type="button" onClick={test} disabled={testing} className="btn-outline sm:mb-6">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Probar conexión
          </button>
        </div>
      </Section>

      <Section icon={UserRound} title="Tu perfil" desc="Así te saludan y te conocen tus agentes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="profileName">Nombre</label>
            <input id="profileName" name="profileName" defaultValue={values.profileName} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="profileRole">Puesto</label>
            <input id="profileRole" name="profileRole" defaultValue={values.profileRole} className="input" />
          </div>
        </div>
      </Section>

      <Section icon={CreditCard} title="Boletos · OpenPay" desc="Credenciales del panel de OpenPay para cobrar boletos en línea.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ticketEventName">Nombre del evento</label>
            <input id="ticketEventName" name="ticketEventName" defaultValue={values.ticketEventName} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="ticketPrice">Precio por boleto (MXN)</label>
            <input id="ticketPrice" name="ticketPrice" type="number" min="0" step="0.01" defaultValue={values.ticketPrice} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="openpayMerchantId">Merchant ID</label>
            <input id="openpayMerchantId" name="openpayMerchantId" defaultValue={values.openpayMerchantId} className="input" autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="openpayPrivateKey">Llave privada (sk_...)</label>
            <div className="flex gap-2">
              <input
                id="openpayPrivateKey"
                name="openpayPrivateKey"
                type="password"
                autoComplete="off"
                className="input"
                placeholder={hasOpenpay ? `Guardada (${values.openpayPrivateKey})` : "sk_..."}
              />
              {hasOpenpay && (
                <button type="button" onClick={() => remove("openpayPrivateKey")} className="btn-outline" title="Eliminar llave">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="openpaySandbox">Ambiente</label>
            <select id="openpaySandbox" name="openpaySandbox" defaultValue={values.openpaySandbox} className="input">
              <option value="true">Sandbox (pruebas)</option>
              <option value="false">Producción (cobros reales)</option>
            </select>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-4 flex items-center justify-end gap-4">
        {msg && (
          <p className={`flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm shadow ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
            {msg.ok && <CheckCircle2 className="h-4 w-4" />} {msg.text}
          </p>
        )}
        <button disabled={pending} className="btn-primary shadow-lg">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar cambios
        </button>
      </div>
    </form>
  );
}

export function Section({ icon: Icon, title, desc, children }: { icon: React.ElementType; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-50 p-2 text-brand-700"><Icon className="h-5 w-5" /></div>
        <div>
          <h2 className="font-display font-bold">{title}</h2>
          <p className="text-sm text-stone-500">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
