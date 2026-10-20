import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { getSettings } from "@/lib/settings";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  await ensureSeeded();

  const [tools, projects, profile] = await Promise.all([
    prisma.tool.findMany({ orderBy: { order: "asc" } }),
    prisma.project.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { tasks: { where: { done: false } } } } },
    }),
    getSettings(["profileName", "profileRole"]),
  ]);

  return (
    <div className="min-h-screen">
      <Suspense>
        <Sidebar
          tools={tools}
          projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color, pending: p._count.tasks }))}
          profile={{ name: profile.profileName, role: profile.profileRole }}
        />
      </Suspense>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
