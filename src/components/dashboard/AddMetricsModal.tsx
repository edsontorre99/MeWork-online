"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { MONTH_NAMES, addDays, fromISODate, shortSpanishDate, toISODate } from "@/lib/dates";
import { MAX_SURVEY_PHOTOS, SURVEY_BATCH, summarizeSurveys, type SurveyReading } from "@/lib/tayau-surveys";
import { analyzeSurveyPhotos, saveTayauSurveys } from "@/app/actions";

const DOW = ["L", "M", "M", "J", "V", "S", "D"];
const MAX_SIDE = 2000; // px; suficiente para leer letra a mano sin mandar fotos de 5 MB

/** Reduce la foto a JPEG para que 100 fotos quepan en pocas peticiones. Si el navegador no la abre (p. ej. HEIC), se manda tal cual. */
async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function AddMetricsModal({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: string[] }) {
  const [start, setStart] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [readings, setReadings] = useState<SurveyReading[]>([]);
  const [processed, setProcessed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Calendario fijado en el mes actual
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const end = start ? toISODate(addDays(fromISODate(start), 6)) : null;

  const thumbs = useMemo(() => files.slice(0, 24).map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const summary = useMemo(() => summarizeSurveys(readings), [readings]);

  const reset = () => {
    setStart(null);
    setStep(1);
    setFiles([]);
    setReadings([]);
    setProcessed(0);
    setError("");
    setDone(null);
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const addFiles = (list: FileList | null) => {
    const imgs = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const next = [...files, ...imgs];
    setError(next.length > MAX_SURVEY_PHOTOS ? `Solo se toman las primeras ${MAX_SURVEY_PHOTOS} fotos.` : "");
    setFiles(next.slice(0, MAX_SURVEY_PHOTOS));
    setReadings([]);
    setProcessed(0);
  };

  // Manda las fotos en lotes; si un lote falla se puede reintentar desde ahí sin perder lo ya leído.
  const analyze = async () => {
    setBusy(true);
    setError("");
    setStep(3);
    let from = processed;
    let acc = readings;
    while (from < files.length) {
      const batch = files.slice(from, from + SURVEY_BATCH);
      const fd = new FormData();
      fd.set("offset", String(from));
      for (const f of await Promise.all(batch.map(shrink))) fd.append("photos", f);
      const r = await analyzeSurveyPhotos(fd);
      if (!r.ok) {
        setError(r.error);
        break;
      }
      acc = [...acc, ...r.readings];
      from += batch.length;
      setReadings(acc);
      setProcessed(from);
    }
    setBusy(false);
  };

  const save = async () => {
    if (!start) return;
    setBusy(true);
    setError("");
    const r = await saveTayauSurveys(start, readings);
    setBusy(false);
    if (r.ok) setDone(r.satisfaction);
    else setError(r.error);
  };

  const m = summary.metrics;
  const finished = processed === files.length && files.length > 0;

  return (
    <Modal open={open} onClose={close} title="Agregar métricas de Tayau" size="md">
      {done !== null ? (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="mt-3 font-display text-lg font-bold">¡Datos agregados!</p>
          <p className="text-sm text-stone-500">
            Semana del {shortSpanishDate(start!)} al {shortSpanishDate(end!)} · Satisfacción {done.toFixed(1)} de 5
          </p>
          <button onClick={close} className="btn-primary mt-5">Listo</button>
        </div>
      ) : step === 1 ? (
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm text-stone-600">
            <CalendarDays className="h-4 w-4" /> ¿De qué semana son las encuestas? Elige el primer día (se toman 7 días).
          </p>
          <div className="rounded-2xl border border-stone-200 p-4">
            <p className="mb-3 text-center font-display font-bold">{MONTH_NAMES[month]} {year}</p>
            <div className="grid grid-cols-7 gap-1 text-center">
              {DOW.map((d, i) => (
                <span key={i} className="pb-1 text-xs font-semibold text-stone-400">{d}</span>
              ))}
              {Array.from({ length: offset }, (_, i) => <span key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const iso = toISODate(new Date(year, month, i + 1));
                const inRange = start && end && iso >= start && iso <= end;
                const edge = iso === start || iso === end;
                const hasData = existing.includes(iso);
                return (
                  <button
                    key={iso}
                    onClick={() => setStart(iso)}
                    className={`relative h-9 rounded-lg text-sm transition ${
                      edge ? "bg-brand-700 font-bold text-white" : inRange ? "bg-brand-100 text-brand-900" : "hover:bg-stone-100"
                    }`}
                  >
                    {i + 1}
                    {hasData && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-orange-500" title="Ya tiene datos" />}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-3 min-h-5 text-sm text-stone-600">
            {start && end ? (
              <>
                Semana seleccionada: <b>{shortSpanishDate(start)} – {shortSpanishDate(end)}</b>
                {existing.includes(start) && <span className="text-orange-600"> · se reemplazarán los datos existentes</span>}
              </>
            ) : (
              "Selecciona una fecha para continuar."
            )}
          </p>
          <div className="mt-4 flex justify-end">
            <button disabled={!start} onClick={() => setStep(2)} className="btn-primary">Agregar datos</button>
          </div>
        </div>
      ) : step === 2 ? (
        <div>
          <p className="mb-3 text-sm text-stone-600">
            Sube las fotos de las encuestas de la semana <b>{shortSpanishDate(start!)} – {shortSpanishDate(end!)}</b> (hasta {MAX_SURVEY_PHOTOS}).
            Gemini leerá cada una.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 px-4 py-8 text-center hover:border-brand-500 hover:bg-brand-50/50"
          >
            <ImagePlus className="h-8 w-8 text-stone-400" />
            <span className="text-sm font-semibold">
              {files.length ? `${files.length} foto${files.length === 1 ? "" : "s"} seleccionada${files.length === 1 ? "" : "s"} · agregar más` : "Haz clic o arrastra tus fotos aquí"}
            </span>
            <span className="text-xs text-stone-500">Una encuesta por foto, bien iluminada y completa.</span>
          </button>
          {files.length > 0 && (
            <div className="mt-3">
              <div className="grid grid-cols-8 gap-1.5">
                {thumbs.map((u, i) => (
                  <img key={u} src={u} alt={files[i].name} className="aspect-square w-full rounded-md object-cover" />
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
                <span>{files.length > thumbs.length ? `+${files.length - thumbs.length} más` : ""}</span>
                <button
                  onClick={() => {
                    setFiles([]);
                    setReadings([]);
                    setProcessed(0);
                    setError("");
                  }}
                  className="inline-flex items-center gap-1 hover:text-red-600">
                  <X className="h-3.5 w-3.5" /> Quitar todas
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex justify-between">
            <button onClick={() => setStep(1)} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Cambiar semana</button>
            <button disabled={!files.length} onClick={analyze} className="btn-primary">
              <Sparkles className="h-4 w-4" /> Analizar con IA
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-semibold">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {finished ? "Lectura terminada" : busy ? "Leyendo encuestas con Gemini…" : "Lectura en pausa"}
            </span>
            <span className="text-stone-500">{processed} de {files.length}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(processed / files.length) * 100}%` }} />
          </div>

          {readings.length > 0 && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 p-4">
                <p className="text-xs font-semibold text-stone-500">Calificación promedio</p>
                <dl className="mt-2 space-y-1 text-sm">
                  {([["Comida", m.sabor], ["Ambiente", m.ambiente], ["Servicio", m.servicio]] as const).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><dt>{k}</dt><dd className="font-bold">{v ? v.toFixed(1) : "—"}</dd></div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl border border-stone-200 p-4">
                <p className="text-xs font-semibold text-stone-500">¿Cómo nos encontraron?</p>
                <dl className="mt-2 space-y-1 text-sm">
                  {([["Facebook", m.facebook], ["Instagram", m.instagram], ["Recomendación", m.recomendacion], ["TikTok/Maps", m.tiktokMaps], ["Otros", m.otros]] as const).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><dt>{k}</dt><dd className="font-bold">{v}</dd></div>
                  ))}
                </dl>
                {summary.otherLabels.length > 0 && (
                  <p className="mt-2 text-xs text-stone-500">Otros: {summary.otherLabels.join(", ")}</p>
                )}
              </div>
            </div>
          )}

          {readings.length > 0 && (
            <p className="mt-3 text-sm text-stone-600">
              <b>{m.responses}</b> encuesta{m.responses === 1 ? "" : "s"} leída{m.responses === 1 ? "" : "s"}.
            </p>
          )}
          {summary.unreadable.length > 0 && (
            <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>No se pudieron leer: {summary.unreadable.map((f) => files[f - 1]?.name ?? `foto ${f}`).join(", ")}</span>
            </p>
          )}
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-5 flex justify-between">
            <button disabled={busy} onClick={() => setStep(2)} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Cambiar fotos</button>
            {finished ? (
              <button disabled={busy || !m.responses} onClick={save} className="btn-primary">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar semana
              </button>
            ) : (
              <button disabled={busy} onClick={analyze} className="btn-primary">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Reintentar
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
