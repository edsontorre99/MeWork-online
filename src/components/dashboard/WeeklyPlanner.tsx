"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { Check, Flame, Loader2, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { DAY_NAMES, MONTH_NAMES, fromISODate } from "@/lib/dates";
import { createTask, deleteTask, planWeek, updateTask } from "@/app/actions";

type Task = { id: string; title: string; day: string; done: boolean; priority: boolean; projectId: string | null };
type Project = { id: string; name: string; color: string };

export function WeeklyPlanner({
  days,
  today,
  tasks: initial,
  projects,
  filterProject,
}: {
  days: string[];
  today: string;
  tasks: Task[];
  projects: Project[];
  filterProject: { id: string; name: string } | null;
}) {
  const [tasks, setTasks] = useState(initial);
  useEffect(() => setTasks(initial), [initial]);
  const [dump, setDump] = useState("");
  const [planMsg, setPlanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [planning, startPlan] = useTransition();
  const [, start] = useTransition();
  const [dragging, setDragging] = useState<Task | null>(null);
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const day = e.over?.id as string | undefined;
    const id = e.active.id as string;
    const task = tasks.find((t) => t.id === id);
    if (!day || !task || task.day === day) return;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, day } : t)));
    start(async () => {
      await updateTask(id, { day });
    });
  };

  const patch = (id: string, data: Partial<Task>) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...data } : t)));
    start(async () => {
      await updateTask(id, data);
    });
  };
  const remove = (id: string) => {
    setTasks((ts) => ts.filter((t) => t.id !== id));
    start(async () => {
      await deleteTask(id);
    });
  };

  const plan = () =>
    startPlan(async () => {
      setPlanMsg(null);
      const r = await planWeek(dump);
      if (r.ok) {
        setPlanMsg({ ok: true, text: `Encontré ${r.count} tareas. Las puedes mover abajo con el dedo o el mouse.` });
        setDump("");
      } else setPlanMsg({ ok: false, text: r.error });
    });

  const first = fromISODate(days[0]);
  const last = fromISODate(days[6]);
  const range =
    first.getMonth() === last.getMonth()
      ? `Del lunes ${first.getDate()} al domingo ${last.getDate()} de ${MONTH_NAMES[last.getMonth()].toLowerCase()}`
      : `Del lunes ${first.getDate()} de ${MONTH_NAMES[first.getMonth()].toLowerCase()} al domingo ${last.getDate()} de ${MONTH_NAMES[last.getMonth()].toLowerCase()}`;

  return (
    <section className="card overflow-hidden">
      <div className="grid gap-6 border-b border-stone-100 bg-gradient-to-b from-[#fbfbfd] to-white p-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-2.5 py-0.5 text-xs font-bold text-white">
            <Sparkles className="h-3.5 w-3.5" /> IA
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">AI Smart Weekly Planner</h2>
          <p className="mt-1 text-sm text-stone-600">Escribe todo lo que tienes pendiente, como te salga. La IA lo acomoda en tu semana.</p>
        </div>
        <div className="space-y-3">
          <textarea
            value={dump}
            onChange={(e) => setDump(e.target.value)}
            rows={3}
            className="input resize-y bg-white/90"
            placeholder="Escribe todo lo que tienes pendiente... ej. el miércoles grabar el recorrido de Torre B, mandar fotos del menú a Santiago, llamar a OpenPay urgente, preparar el reporte para el jueves..."
          />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={plan} disabled={planning || dump.trim().length < 5} className="btn-primary">
              {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {planning ? "Acomodando…" : "Acomodar mi semana"}
            </button>
            {planMsg && <p className={`text-sm ${planMsg.ok ? "text-brand-800" : "text-red-600"}`}>{planMsg.text}</p>}
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-display text-xl font-bold">
              Mi semana{filterProject && <span className="text-stone-400"> · {filterProject.name}</span>}
            </h3>
            <p className="text-sm text-stone-500">{range} · arrastra una tarjeta para cambiarla de día</p>
          </div>
          {filterProject && (
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              <X className="h-3.5 w-3.5" /> Ver todos los proyectos
            </Link>
          )}
        </div>

        <DndContext id="weekly-planner" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="scrollbar-thin -mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-2 min-[1600px]:mx-0 min-[1600px]:grid min-[1600px]:grid-cols-7 min-[1600px]:overflow-visible min-[1600px]:px-0">
            {days.map((day, i) => (
              <DayColumn
                key={day}
                day={day}
                label={`${DAY_NAMES[i]} ${fromISODate(day).getDate()}`}
                isToday={day === today}
                isPast={day < today}
                tasks={tasks.filter((t) => t.day === day)}
                projectMap={projectMap}
                projects={projects}
                defaultProject={filterProject?.id ?? null}
                onPatch={patch}
                onRemove={remove}
                onAdded={(t) => setTasks((ts) => [...ts, t])}
              />
            ))}
          </div>
          <DragOverlay>{dragging && <TaskCard task={dragging} project={dragging.projectId ? projectMap[dragging.projectId] : undefined} overlay />}</DragOverlay>
        </DndContext>
      </div>
    </section>
  );
}

function DayColumn({
  day, label, isToday, isPast, tasks, projectMap, projects, defaultProject, onPatch, onRemove, onAdded,
}: {
  day: string;
  label: string;
  isToday: boolean;
  isPast: boolean;
  tasks: Task[];
  projectMap: Record<string, Project>;
  projects: Project[];
  defaultProject: string | null;
  onPatch: (id: string, d: Partial<Task>) => void;
  onRemove: (id: string) => void;
  onAdded: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProject ?? "");
  const [pending, start] = useTransition();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    start(async () => {
      const r = await createTask(title, day, projectId || null);
      if (r.ok) {
        onAdded({ id: r.id, title: title.trim(), day, done: false, priority: false, projectId: projectId || null });
        setTitle("");
        setAdding(false);
      }
    });
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[16rem] w-[78%] shrink-0 snap-start flex-col rounded-2xl p-2.5 transition sm:w-[14rem] min-[1600px]:w-auto ${
        isOver ? "bg-brand-100 ring-2 ring-brand-500" : isToday ? "bg-brand-50 ring-1 ring-brand-200" : "bg-sand-100"
      } ${isPast && !isToday ? "opacity-70" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <p className={`text-sm font-bold ${isToday ? "text-brand-800" : "text-stone-700"}`}>{label}</p>
        {isToday && <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-bold text-white uppercase">Hoy</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {tasks.map((t) => (
          <DraggableTask key={t.id} task={t} project={t.projectId ? projectMap[t.projectId] : undefined} onPatch={onPatch} onRemove={onRemove} />
        ))}
      </div>

      {adding ? (
        <form onSubmit={add} className="mt-2 space-y-2 rounded-xl bg-white p-2 shadow-sm">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="input py-1.5" placeholder="Nueva tarea" />
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input py-1.5 text-xs">
            <option value="">Sin proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <button disabled={pending || !title.trim()} className="btn-primary flex-1 px-2 py-1 text-xs">Agregar</button>
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost px-2 py-1 text-xs">Cancelar</button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-semibold text-stone-500 hover:bg-white hover:text-brand-700"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      )}
    </div>
  );
}

function DraggableTask({ task, project, onPatch, onRemove }: { task: Task; project?: Project; onPatch: (id: string, d: Partial<Task>) => void; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`touch-manipulation ${isDragging ? "opacity-30" : ""}`}>
      <TaskCard task={task} project={project} onPatch={onPatch} onRemove={onRemove} />
    </div>
  );
}

function TaskCard({
  task, project, overlay, onPatch, onRemove,
}: {
  task: Task;
  project?: Project;
  overlay?: boolean;
  onPatch?: (id: string, d: Partial<Task>) => void;
  onRemove?: (id: string) => void;
}) {
  const stop = (e: React.PointerEvent | React.KeyboardEvent) => e.stopPropagation();
  return (
    <div
      className={`group relative cursor-grab rounded-xl border-l-4 bg-white p-2.5 shadow-sm active:cursor-grabbing ${overlay ? "rotate-2 shadow-xl" : "hover:shadow"}`}
      style={{ borderLeftColor: project?.color ?? "#a8a29e" }}
    >
      <div className="flex items-start gap-2">
        <button
          onPointerDown={stop}
          onKeyDown={stop}
          onClick={() => onPatch?.(task.id, { done: !task.done })}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            task.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-stone-300 bg-white hover:border-brand-600"
          }`}
          aria-label={task.done ? "Marcar como pendiente" : "Marcar como hecha"}
        >
          {task.done && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
        <p className={`flex-1 text-[13px] leading-snug font-semibold ${task.done ? "text-stone-400 line-through" : "text-stone-800"}`}>{task.title}</p>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1 pl-6">
        <span className="truncate text-[11px] font-semibold" style={{ color: project?.color ?? "#78716c" }}>
          {project?.name ?? "General"}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onPointerDown={stop}
            onKeyDown={stop}
            onClick={() => onPatch?.(task.id, { priority: !task.priority })}
            className={`rounded p-0.5 ${task.priority ? "text-orange-500" : "text-stone-300 opacity-0 group-hover:opacity-100 hover:text-orange-500"}`}
            title={task.priority ? "Quitar prioridad" : "Marcar como prioridad"}
          >
            <Flame className="h-3.5 w-3.5" />
          </button>
          <button
            onPointerDown={stop}
            onKeyDown={stop}
            onClick={() => onRemove?.(task.id)}
            className="rounded p-0.5 text-stone-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
