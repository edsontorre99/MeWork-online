"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Flame } from "lucide-react";
import { longSpanishDate } from "@/lib/dates";
import { updateTask } from "@/app/actions";

type Priority = { id: string; title: string; project: { name: string; color: string } | null };

function greeting(h: number) {
  if (h < 12) return "¡Buenos días";
  if (h < 19) return "¡Buenas tardes";
  return "¡Buenas noches";
}

export function DashboardHeader({ name, priorities, aiReady }: { name: string; priorities: Priority[]; aiReady: boolean }) {
  // La hora se calcula en el navegador para respetar la zona horaria del usuario
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [, start] = useTransition();
  const [doneIds, setDoneIds] = useState<string[]>([]);

  const complete = (id: string) => {
    setDoneIds((d) => [...d, id]);
    start(async () => {
      await updateTask(id, { done: true });
    });
  };

  const visible = priorities.filter((p) => !doneIds.includes(p.id));

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-end">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {now ? `${greeting(now.getHours())}, ${name}!` : <span className="opacity-0">.</span>}
        </h1>
        <p className="mt-1 text-lg text-stone-500">{now ? `Hoy es ${longSpanishDate(now)}` : " "}</p>
        {!aiReady && (
          <Link href="/ajustes" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100">
            <AlertTriangle className="h-4 w-4" /> Agrega tu API Key de Gemini en Ajustes para activar a tus agentes.
          </Link>
        )}
      </div>

      <div className="card p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-stone-700">
          <Flame className="h-4 w-4 text-orange-500" />
          {visible.length
            ? `Tienes ${visible.length} ${visible.length === 1 ? "prioridad crítica" : "prioridades críticas"} para hoy. Empieza por aquí:`
            : "¡Sin pendientes críticos para hoy! 🎉"}
        </p>
        <ol className="mt-3 space-y-2">
          {visible.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-sand-100 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.title}</p>
                {p.project && (
                  <p className="text-xs font-medium" style={{ color: p.project.color }}>{p.project.name}</p>
                )}
              </div>
              <button
                onClick={() => complete(p.id)}
                className="rounded-lg border border-stone-300 bg-white p-1 text-stone-400 hover:border-emerald-500 hover:text-emerald-600"
                aria-label="Marcar como hecha"
                title="Marcar como hecha"
              >
                <Check className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
