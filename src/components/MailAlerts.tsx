"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Check, CheckCheck, ExternalLink, Reply, Sparkles } from "lucide-react";
import { Modal } from "./Modal";
import { getMailAlerts, markAlertRead, markAllAlertsRead, type MailAlertView } from "@/app/mail-actions";

const POLL_MS = 60_000;
export const ALERTS_EVENT = "mework:mail-alerts";

/** Consulta los avisos cada minuto y lanza una notificación del navegador cuando llega uno nuevo. */
export function useMailAlerts() {
  const [data, setData] = useState<{ unread: number; alerts: MailAlertView[] }>({ unread: 0, alerts: [] });
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getMailAlerts();
      setData(d);
      const unread = d.alerts.filter((a) => !a.read);
      // En la primera carga solo se registran; después, lo nuevo genera notificación
      if (seen.current) {
        const fresh = unread.filter((a) => !seen.current!.has(a.id));
        if (fresh.length && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const a = fresh[0];
          const n = new Notification(
            fresh.length > 1 ? `MeWork · ${fresh.length} avisos nuevos de correo` : `MeWork · ${a.kind === "respuesta" ? "Te respondieron" : "Correo importante"}`,
            { body: `${a.fromName}: ${a.subject}\n${a.summary}`, tag: a.id },
          );
          n.onclick = () => window.focus();
        }
      }
      seen.current = new Set([...(seen.current ?? []), ...d.alerts.map((a) => a.id)]);
    } catch {
      // Sin sesión o sin red: se reintenta en el siguiente ciclo
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    // "Revisar ahora" en Ajustes avisa para refrescar sin esperar el minuto
    window.addEventListener(ALERTS_EVENT, load);
    return () => {
      clearInterval(id);
      window.removeEventListener(ALERTS_EVENT, load);
    };
  }, [load]);

  return { ...data, reload: load };
}

const askPermission = () => {
  if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
};

/** Fila de la barra lateral con el número de avisos sin leer. */
export function AlertsNavButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button
      onClick={() => {
        askPermission();
        onClick();
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#1d1d1f] transition hover:bg-black/[0.04]"
    >
      {unread ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      <span className="flex-1 text-left">Avisos</span>
      {unread > 0 && (
        <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

export function AlertsBellIcon({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button
      onClick={() => {
        askPermission();
        onClick();
      }}
      className="relative rounded-lg p-2 hover:bg-stone-100"
      aria-label={`Avisos de correo${unread ? ` (${unread} sin leer)` : ""}`}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />}
    </button>
  );
}

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function AlertsPanel({
  open,
  onClose,
  alerts,
  unread,
  reload,
}: {
  open: boolean;
  onClose: () => void;
  alerts: MailAlertView[];
  unread: number;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [perm, setPerm] = useState<string>("granted");

  useEffect(() => {
    if (open && typeof Notification !== "undefined") setPerm(Notification.permission);
  }, [open]);

  const markRead = (id: string) =>
    start(async () => {
      await markAlertRead(id);
      await reload();
    });

  const reply = (id: string) => {
    onClose();
    router.push(`/dashboard?responder=${id}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Avisos de correo" size="lg">
      {perm === "default" && (
        <button
          onClick={() => Notification.requestPermission().then(setPerm)}
          className="mb-4 flex w-full items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
        >
          <BellRing className="h-4 w-4" /> Activa las notificaciones para enterarte aunque estés en otra pestaña.
        </button>
      )}

      {alerts.length === 0 ? (
        <div className="py-10 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-stone-300" />
          <p className="mt-2 text-sm text-stone-500">Todo en orden. Aquí aparecerán las respuestas y los correos importantes.</p>
        </div>
      ) : (
        <>
          {unread > 0 && (
            <div className="mb-3 flex justify-end">
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await markAllAlertsRead();
                    await reload();
                  })
                }
                className="btn-ghost px-3 py-1 text-xs"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todos como leídos
              </button>
            </div>
          )}
          <ul className="space-y-3">
            {alerts.map((a) => (
              <li key={a.id} className={`rounded-2xl border p-4 ${a.read ? "border-stone-100 opacity-60" : "border-stone-200"}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${a.kind === "respuesta" ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800"}`}>
                    {a.kind === "respuesta" ? "Respuesta" : "Importante"}
                  </span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{a.accountLabel}</span>
                  <span className="ml-auto text-stone-400">{when(a.receivedAt)}</span>
                </div>
                <p className="mt-2 text-sm font-semibold">{a.fromName} <span className="font-normal text-stone-400">· {a.fromEmail}</span></p>
                <p className="truncate text-sm">{a.subject}</p>
                <p className="mt-1 text-sm text-stone-600">{a.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`https://mail.google.com/mail/u/${encodeURIComponent(a.accountEmail)}/#search/rfc822msgid:${encodeURIComponent(a.messageId)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-outline px-3 py-1.5 text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir en Gmail
                  </a>
                  <button onClick={() => reply(a.id)} className="btn-primary px-3 py-1.5 text-xs">
                    <Reply className="h-3.5 w-3.5" /> Pedir a Valeria que responda
                  </button>
                  {!a.read && (
                    <button onClick={() => markRead(a.id)} disabled={pending} className="btn-ghost px-3 py-1.5 text-xs">
                      <Check className="h-3.5 w-3.5" /> Marcar como leído
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
