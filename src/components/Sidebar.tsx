"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bot, Camera, Globe, Home, Inbox, LogOut, Mail, Megaphone, Menu, MessageCircle, MessageSquare,
  MoreVertical, Plus, Scissors, Search, Settings, Sparkles, ThumbsUp, Users, X, Link2, type LucideIcon,
} from "lucide-react";
import { Logo } from "./Logo";
import { Modal } from "./Modal";
import { Avatar } from "./Avatar";
import { AlertsBellIcon, AlertsNavButton, AlertsPanel, useMailAlerts } from "./MailAlerts";
import { createProject, updateTool } from "@/app/actions";
import { logout } from "@/app/auth-actions";

export type ToolItem = { id: string; name: string; url: string; icon: string; kind: string };
export type ProjectItem = { id: string; name: string; color: string; pending: number };

const ICONS: Record<string, LucideIcon> = {
  users: Users, sparkles: Sparkles, bot: Bot, "message-square": MessageSquare, globe: Globe,
  "thumbs-up": ThumbsUp, camera: Camera, megaphone: Megaphone, search: Search, scissors: Scissors,
  "message-circle": MessageCircle, mail: Mail, inbox: Inbox,
};

const PROJECT_COLORS = ["#0f766e", "#c2410c", "#4338ca", "#be185d", "#0369a1", "#a16207"];

export function Sidebar({
  tools,
  projects,
  profile,
}: {
  tools: ToolItem[];
  projects: ProjectItem[];
  profile: { name: string; role: string };
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editing, setEditing] = useState<ToolItem | null>(null);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const activeProject = params.get("proyecto");
  const mail = useMailAlerts();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const openAlerts = () => {
    setMobileOpen(false);
    setAlertsOpen(true);
  };

  const openTool = (t: ToolItem) => {
    if (t.kind === "google") return setGoogleUrl(t.url);
    if (t.kind === "internal") return router.push(t.url);
    window.open(t.url, "_blank", "noopener,noreferrer");
  };

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pt-7 pb-5">
        <Logo size={24} />
        <button className="text-stone-500 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        <NavLink href="/dashboard" icon={Home} active={pathname === "/dashboard" && !activeProject}>Inicio</NavLink>
        <NavLink href="/ajustes" icon={Settings} active={pathname === "/ajustes"}>Ajustes</NavLink>
        <AlertsNavButton unread={mail.unread} onClick={openAlerts} />

        <SectionTitle>Mis proyectos</SectionTitle>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={activeProject === p.id ? "/dashboard" : `/dashboard?proyecto=${p.id}`}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] transition ${
              activeProject === p.id ? "bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#1d1d1f] hover:bg-black/[0.04]"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="flex-1 truncate">{p.name}</span>
            {p.pending > 0 && <span className="text-[11px] text-stone-500 tabular-nums">{p.pending}</span>}
          </Link>
        ))}
        <button
          onClick={() => setProjectOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] text-stone-500 hover:bg-black/[0.04] hover:text-[#1d1d1f]"
        >
          <Plus className="h-4 w-4" /> Nuevo proyecto
        </button>

        <SectionTitle>Herramientas</SectionTitle>
        {tools.map((t) => {
          const Icon = ICONS[t.icon] ?? Link2;
          const active = t.kind === "internal" && pathname.startsWith(t.url);
          return (
            <div
              key={t.id}
              className={`group flex items-center rounded-lg transition ${active ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "hover:bg-black/[0.04]"}`}
            >
              <button
                onClick={() => {
                  openTool(t);
                  setMobileOpen(false);
                }}
                className="flex flex-1 items-center gap-3 truncate px-3 py-1.5 text-left text-[13px] text-[#1d1d1f]"
                title={t.kind === "link" ? t.url : undefined}
              >
                {t.icon === "search" ? (
                  <span className="flex h-4 w-4 items-center justify-center text-[13px] font-semibold text-stone-500">G</span>
                ) : (
                  <Icon className="h-4 w-4 shrink-0 text-stone-500" strokeWidth={1.75} />
                )}
                <span className="truncate">{t.name}</span>
              </button>
              <button
                onClick={() => setEditing(t)}
                className="mr-1 rounded-md p-1 text-stone-400 opacity-0 transition group-hover:opacity-100 hover:bg-black/[0.06] hover:text-[#1d1d1f] focus:opacity-100 max-lg:opacity-60"
                aria-label={`Editar ${t.name}`}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-black/[0.06] px-4 py-4">
        <Avatar name={profile.name} color="#86868b" size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[#1d1d1f]">{profile.name}</p>
          <p className="truncate text-xs text-stone-500">{profile.role}</p>
        </div>
        <form action={logout}>
          <button className="rounded-lg p-2 text-stone-400 hover:bg-black/[0.05] hover:text-[#1d1d1f]" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Barra superior móvil */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo size={22} />
        <div className="flex items-center gap-1">
          <AlertsBellIcon unread={mail.unread} onClick={openAlerts} />
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-stone-100" aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-black/[0.06] bg-[#f2f2f4]/95 backdrop-blur-xl lg:block">{nav}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 bg-[#f2f2f4]">{nav}</aside>
        </div>
      )}

      <ToolEditModal tool={editing} onClose={() => setEditing(null)} />
      <GoogleSearchModal searchUrl={googleUrl} onClose={() => setGoogleUrl(null)} />
      <NewProjectModal open={projectOpen} onClose={() => setProjectOpen(false)} />
      <AlertsPanel open={alertsOpen} onClose={() => setAlertsOpen(false)} alerts={mail.alerts} unread={mail.unread} reload={mail.reload} />
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 mb-1 px-3 text-[11px] font-semibold text-stone-500">{children}</p>;
}

function NavLink({ href, icon: Icon, active, children }: { href: string; icon: LucideIcon; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
        active ? "bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#1d1d1f] hover:bg-black/[0.04]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}

function ToolEditModal({ tool, onClose }: { tool: ToolItem | null; onClose: () => void }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal open={!!tool} onClose={onClose} title="Editar herramienta" size="sm">
      {tool && (
        <form
          key={tool.id}
          className="space-y-4"
          action={(fd) =>
            start(async () => {
              const r = await updateTool(tool.id, String(fd.get("name")), String(fd.get("url")));
              if (r.ok) onClose();
              else setError(r.error);
            })
          }
        >
          <div>
            <label className="label" htmlFor="tool-name">Nombre</label>
            <input id="tool-name" name="name" defaultValue={tool.name} className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="tool-url">
              {tool.kind === "google" ? "URL de búsqueda (se agrega el texto al final)" : "Enlace / URL de destino"}
            </label>
            <input id="tool-url" name="url" defaultValue={tool.url} className="input" required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button disabled={pending} className="btn-primary">Guardar</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function GoogleSearchModal({ searchUrl, onClose }: { searchUrl: string | null; onClose: () => void }) {
  const [q, setQ] = useState("");
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    window.open(`${searchUrl || "https://www.google.com/search?q="}${encodeURIComponent(q.trim())}`, "_blank", "noopener,noreferrer");
    setQ("");
    onClose();
  };
  return (
    <Modal open={!!searchUrl} onClose={onClose} size="md">
      <form onSubmit={search} className="flex flex-col items-center gap-6 pb-4">
        <p className="font-display text-5xl font-bold tracking-tight select-none">
          <span className="text-[#4285F4]">G</span>
          <span className="text-[#EA4335]">o</span>
          <span className="text-[#FBBC05]">o</span>
          <span className="text-[#4285F4]">g</span>
          <span className="text-[#34A853]">l</span>
          <span className="text-[#EA4335]">e</span>
        </p>
        <div className="relative w-full">
          <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-full border border-stone-300 py-3 pr-4 pl-11 shadow-sm outline-none focus:border-stone-400 focus:shadow-md"
            placeholder="Buscar en Google"
          />
        </div>
        <button className="btn-outline rounded-full" disabled={!q.trim()}>Buscar</button>
      </form>
    </Modal>
  );
}

function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal open={open} onClose={onClose} title="Nuevo proyecto" size="sm">
      <form
        className="space-y-4"
        action={(fd) =>
          start(async () => {
            const r = await createProject(String(fd.get("name")), color);
            if (r.ok) onClose();
            else setError(r.error);
          })
        }
      >
        <div>
          <label className="label" htmlFor="p-name">Nombre</label>
          <input id="p-name" name="name" className="input" required autoFocus placeholder="Ej. Lanzamiento Torre C" />
        </div>
        <div>
          <span className="label">Color</span>
          <div className="flex gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full ring-offset-2 ${color === c ? "ring-2 ring-stone-800" : ""}`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button disabled={pending} className="btn-primary">Crear proyecto</button>
        </div>
      </form>
    </Modal>
  );
}
