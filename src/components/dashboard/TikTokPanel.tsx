"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Clapperboard, Loader2, PenLine, Sparkles, Trash2, CheckCheck } from "lucide-react";
import { deleteIdea, generateTikTokIdeas, setIdeaStatus } from "@/app/actions";

type Idea = { id: string; title: string; description: string; project: string; status: string };

const STATUSES = [
  { id: "guion", label: "Guion por escribir", plural: "guiones por escribir", icon: PenLine, cls: "bg-amber-100 text-amber-800" },
  { id: "edicion", label: "Por editar", plural: "por editar", icon: Clapperboard, cls: "bg-sky-100 text-sky-800" },
  { id: "programado", label: "Programado", plural: "programados", icon: CalendarCheck, cls: "bg-emerald-100 text-emerald-800" },
  { id: "publicado", label: "Publicado", plural: "publicados", icon: CheckCheck, cls: "bg-stone-200 text-stone-700" },
];
const PROJECT_CLS: Record<string, string> = {
  Toram: "from-teal-600 to-teal-800",
  Tayau: "from-orange-500 to-orange-700",
  Boletos: "from-indigo-500 to-indigo-700",
};

export function TikTokPanel({ ideas }: { ideas: Idea[] }) {
  const [error, setError] = useState("");
  const [generating, startGen] = useTransition();
  const [, start] = useTransition();
  const [showPublished, setShowPublished] = useState(false);

  const count = (s: string) => ideas.filter((i) => i.status === s).length;
  const visible = ideas.filter((i) => showPublished || i.status !== "publicado");

  const advance = (i: Idea) => {
    const idx = STATUSES.findIndex((s) => s.id === i.status);
    const next = STATUSES[(idx + 1) % STATUSES.length].id;
    start(async () => {
      await setIdeaStatus(i.id, next);
    });
  };

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Foco en Tendencias (TikTok)</h2>
          <p className="text-sm text-stone-500">Ideas de videos que la IA te sugiere esta semana</p>
        </div>
        <button
          onClick={() =>
            startGen(async () => {
              setError("");
              const r = await generateTikTokIdeas();
              if (!r.ok) setError(r.error);
            })
          }
          disabled={generating}
          className="btn-outline px-3 py-1.5 text-xs"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Pedir nuevas ideas
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.slice(0, 3).map((s) => (
          <span key={s.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${s.cls}`}>
            <s.icon className="h-3.5 w-3.5" /> {count(s.id)} {count(s.id) === 1 ? s.label.toLowerCase() : s.plural}
          </span>
        ))}
        {count("publicado") > 0 && (
          <button onClick={() => setShowPublished((v) => !v)} className="text-xs font-medium text-stone-500 underline">
            {showPublished ? "Ocultar" : "Ver"} {count("publicado")} publicados
          </button>
        )}
      </div>

      <div className="scrollbar-thin -mx-6 mt-4 flex snap-x gap-4 overflow-x-auto px-6 pb-2">
        {visible.map((i) => {
          const st = STATUSES.find((s) => s.id === i.status) ?? STATUSES[0];
          return (
            <article key={i.id} className="group relative w-56 shrink-0 snap-start overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <div className={`flex aspect-[4/3] flex-col justify-end bg-gradient-to-br p-3 text-white ${PROJECT_CLS[i.project] ?? "from-stone-600 to-stone-800"}`}>
                <span className="mb-auto w-fit rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase backdrop-blur">
                  {i.project}
                </span>
                <h3 className="font-display leading-tight font-bold">{i.title}</h3>
              </div>
              <div className="space-y-2 p-3">
                <p className="text-xs text-stone-600">{i.description}</p>
                <button
                  onClick={() => advance(i)}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}
                  title="Clic para avanzar al siguiente estado"
                >
                  <st.icon className="h-3 w-3" /> {st.label}
                </button>
              </div>
              <button
                onClick={() => start(async () => void (await deleteIdea(i.id)))}
                className="absolute top-2 right-2 rounded-lg bg-black/20 p-1 text-white opacity-0 backdrop-blur group-hover:opacity-100 hover:bg-black/40"
                aria-label="Eliminar idea"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
