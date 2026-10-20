import { prisma } from "@/lib/prisma";
import { HRBoard } from "./HRBoard";

export default async function RecursosHumanosPage() {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { messages: true } } },
  });

  return (
    <HRBoard
      agents={agents.map((a) => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        avatar: a.avatar,
        role: a.role,
        age: a.age,
        systemPrompt: a.systemPrompt,
        color: a.color,
        consultModel: a.consultModel,
        taskModel: a.taskModel,
        status: a.status,
        messages: a._count.messages,
      }))}
    />
  );
}
