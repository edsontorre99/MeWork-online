"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BarChart3, Plus, Star, TrendingDown, TrendingUp, UtensilsCrossed } from "lucide-react";
import { shortSpanishDate } from "@/lib/dates";
import { AddMetricsModal } from "./AddMetricsModal";

export type Week = {
  id: string;
  startDate: string;
  endDate: string;
  sabor: number;
  ambiente: number;
  servicio: number;
  facebook: number;
  instagram: number;
  recomendacion: number;
  tiktokMaps: number;
  otros: number;
  responses: number;
};

// Paleta categórica validada (orden fijo); "Otros" va en gris neutro
const C = { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", s4: "#eda100", other: "#a8a29e" };
const satisfaction = (w: Week) => Math.round(((w.sabor + w.ambiente + w.servicio) / 3) * 10) / 10;

export function TayauStats({ weeks }: { weeks: Week[] }) {
  const [view, setView] = useState<"experiencia" | "canales">("experiencia");
  const [open, setOpen] = useState(false);

  const recent = weeks.slice(-8);
  const last = weeks.at(-1);
  const prev = weeks.at(-2);
  const score = last ? satisfaction(last) : null;
  const delta = last && prev ? Math.round((satisfaction(last) - satisfaction(prev)) * 10) / 10 : null;

  const data = useMemo(
    () =>
      recent.map((w) => ({
        semana: shortSpanishDate(w.startDate),
        Comida: w.sabor, Ambiente: w.ambiente, Servicio: w.servicio,
        Facebook: w.facebook, Instagram: w.instagram, "Recomendación": w.recomendacion, "TikTok/Maps": w.tiktokMaps, Otros: w.otros,
      })),
    [recent],
  );

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-50 p-2 text-orange-700"><UtensilsCrossed className="h-5 w-5" /></div>
          <div>
            <h2 className="font-display text-xl font-bold">Tayau Restaurant Stats</h2>
            <p className="text-sm text-stone-500">Satisfacción de comensales semanal</p>
          </div>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary px-3 py-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Agregar métricas
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-5xl font-semibold tracking-tight">{score?.toFixed(1) ?? "—"}</span>
            <span className="text-stone-500">de 5</span>
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          </p>
          {delta !== null && (
            <p className={`mt-1 flex items-center gap-1 text-sm font-semibold ${delta >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {delta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {delta === 0 ? "Igual que la semana pasada" : `${delta > 0 ? "Subió" : "Bajó"} ${Math.abs(delta).toFixed(1)} esta semana`}
            </p>
          )}
        </div>
        {last && (
          <dl className="flex gap-5 text-sm">
            {([["sabor", "Comida"], ["ambiente", "Ambiente"], ["servicio", "Servicio"]] as const).map(([k, label]) => (
              <div key={k}>
                <dt className="text-xs text-stone-500">{label}</dt>
                <dd className="font-bold">{last[k].toFixed(1)}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-stone-500">Encuestas</dt>
              <dd className="font-bold">{last.responses}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="mt-5 inline-flex rounded-xl bg-sand-100 p-1" role="tablist">
        {[
          { id: "experiencia", label: "Calificación de experiencia", icon: Star },
          { id: "canales", label: "Canales de atracción", icon: BarChart3 },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={view === t.id}
            onClick={() => setView(t.id as typeof view)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              view === t.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 h-64">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-stone-300 text-sm text-stone-500">
            Aún no hay semanas. Usa “Agregar métricas”.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {view === "experiencia" ? (
              <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#ecebe7" vertical={false} />
                <XAxis dataKey="semana" tick={{ fontSize: 12, fill: "#52514e" }} axisLine={false} tickLine={false} />
                <YAxis domain={[3, 5]} ticks={[3, 3.5, 4, 4.5, 5]} tick={{ fontSize: 12, fill: "#52514e" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }} formatter={(v: number) => v.toFixed(1)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                {(["Comida", "Ambiente", "Servicio"] as const).map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={[C.s1, C.s2, C.s3][i]}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#ecebe7" vertical={false} />
                <XAxis dataKey="semana" tick={{ fontSize: 12, fill: "#52514e" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#52514e" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f3f1ec" }} contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                {(["Facebook", "Instagram", "Recomendación", "TikTok/Maps", "Otros"] as const).map((k, i, arr) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="canales"
                    fill={[C.s1, C.s2, C.s3, C.s4, C.other][i]}
                    stroke="#fff"
                    strokeWidth={2}
                    maxBarSize={36}
                    radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      <AddMetricsModal open={open} onClose={() => setOpen(false)} existing={weeks.map((w) => w.startDate)} />
    </section>
  );
}
