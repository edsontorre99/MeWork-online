import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { openpayConfig } from "@/lib/openpay";
import { toISODate, weekDays } from "@/lib/dates";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { WeeklyPlanner } from "@/components/dashboard/WeeklyPlanner";
import { AgentsPanel } from "@/components/dashboard/AgentsPanel";
import { TayauStats } from "@/components/dashboard/TayauStats";
import { TikTokPanel } from "@/components/dashboard/TikTokPanel";
import { TicketsPanel } from "@/components/dashboard/TicketsPanel";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ proyecto?: string }> }) {
  const { proyecto } = await searchParams;
  const days = weekDays();
  const today = toISODate(new Date());

  const [tasks, projects, agents, weeks, ideas, tickets, settings, openpay] = await Promise.all([
    prisma.task.findMany({
      where: { day: { in: days }, ...(proyecto ? { projectId: proyecto } : {}) },
      orderBy: [{ priority: "desc" }, { order: "asc" }],
    }),
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.agent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.tayauWeek.findMany({ orderBy: { startDate: "asc" } }),
    prisma.tikTokIdea.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.ticket.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    getSettings(["profileName", "geminiApiKey", "ticketEventName", "ticketPrice"]),
    openpayConfig(),
  ]);

  const activeProject = projects.find((p) => p.id === proyecto);
  const todays = tasks.filter((t) => t.day === today && !t.done);
  const priorities = [...todays.filter((t) => t.priority), ...todays.filter((t) => !t.priority)].slice(0, 3);
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, { name: p.name, color: p.color }]));

  const plainTasks = tasks.map((t) => ({
    id: t.id, title: t.title, day: t.day, done: t.done, priority: t.priority, projectId: t.projectId,
  }));

  return (
    <div className="space-y-6">
      <DashboardHeader
        name={settings.profileName}
        priorities={priorities.map((t) => ({ id: t.id, title: t.title, project: t.projectId ? projectMap[t.projectId] : null }))}
        aiReady={!!settings.geminiApiKey}
      />

      <WeeklyPlanner
        days={days}
        today={today}
        tasks={plainTasks}
        projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
        filterProject={activeProject ? { id: activeProject.id, name: activeProject.name } : null}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <AgentsPanel
          agents={agents.map((a) => ({
            id: a.id, name: `${a.firstName} ${a.lastName}`, role: a.role, avatar: a.avatar, color: a.color, status: a.status,
            consultModel: a.consultModel, taskModel: a.taskModel,
          }))}
        />
        <TayauStats weeks={weeks.map(({ createdAt: _c, ...w }) => w)} />
      </div>

      <TikTokPanel ideas={ideas.map((i) => ({ id: i.id, title: i.title, description: i.description, project: i.project, status: i.status }))} />

      <TicketsPanel
        tickets={tickets.map((t) => ({
          id: t.id, code: t.code, buyerName: t.buyerName, buyerEmail: t.buyerEmail, status: t.status,
          price: t.price, eventName: t.eventName, hasCharge: !!t.chargeId, checkoutUrl: t.checkoutUrl,
          usedAt: t.usedAt?.toISOString() ?? null,
        }))}
        eventName={settings.ticketEventName}
        price={parseFloat(settings.ticketPrice) || 0}
        openpay={{ configured: openpay.configured, sandbox: openpay.openpaySandbox !== "false" }}
      />
    </div>
  );
}
