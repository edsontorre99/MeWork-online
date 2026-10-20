"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { AgentChat, type ChatAgent } from "@/components/AgentChat";
import { getAlertReplyContext } from "@/app/mail-actions";

export type AgentCard = ChatAgent & { status: string };

export function AgentsPanel({ agents }: { agents: AgentCard[] }) {
  const [active, setActive] = useState<AgentCard | null>(null);
  const [autoPrompt, setAutoPrompt] = useState<{ text: string; replyToAlertId?: string } | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const replyAlert = params.get("responder");

  // Desde la campanita: /dashboard?responder=<aviso> abre a la asistente con el contexto del correo
  useEffect(() => {
    if (!replyAlert) return;
    router.replace("/dashboard", { scroll: false });
    getAlertReplyContext(replyAlert).then((r) => {
      const agent = r.ok ? agents.find((a) => a.id === r.agentId) : null;
      if (!r.ok || !agent) return;
      setAutoPrompt({ text: r.prompt, replyToAlertId: replyAlert });
      setActive(agent);
    });
  }, [replyAlert, agents, router]);

  return (
    <section className="card p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">Tu equipo remoto · Gemini</h2>
          <p className="text-sm text-stone-500">Tus empleados remotos, trabajando para ti. Toca a alguien para pedirle ayuda.</p>
        </div>
        <Link href="/recursos-humanos" className="btn-outline shrink-0 px-3 py-1.5 text-xs">
          <UserPlus className="h-3.5 w-3.5" /> Contratar
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setAutoPrompt(null);
              setActive(a);
            }}
            className="group flex items-center gap-3 rounded-2xl border border-stone-200 p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
          >
            <Avatar name={a.name} src={a.avatar} color={a.color} size={48} online />
            <div className="min-w-0">
              <p className="truncate font-bold">{a.name}</p>
              <p className="truncate text-xs text-stone-500">{a.role}</p>
              <p className="mt-0.5 truncate text-xs">
                <span className="font-semibold text-emerald-600">En línea</span>
                <span className="text-stone-400"> · {a.status}</span>
              </p>
            </div>
          </button>
        ))}
      </div>

      <AgentChat
        agent={active}
        autoPrompt={autoPrompt}
        onClose={() => {
          setActive(null);
          setAutoPrompt(null);
        }}
      />
    </section>
  );
}
