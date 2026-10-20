import { runScheduledCheck } from "./lib/mail";

const TICK_MS = 5 * 60_000; // cada 5 min se verifica si ya toca revisar según Ajustes

export function startMailScheduler() {
  const g = globalThis as typeof globalThis & { __meworkMailTimer?: ReturnType<typeof setInterval> };
  // Evita temporizadores duplicados (recargas en desarrollo)
  if (g.__meworkMailTimer) return;

  const tick = () =>
    runScheduledCheck().catch((e) => console.error("[MeWork] Revisión de correo falló:", e instanceof Error ? e.message : e));

  g.__meworkMailTimer = setInterval(tick, TICK_MS);
  setTimeout(tick, 30_000);
}
