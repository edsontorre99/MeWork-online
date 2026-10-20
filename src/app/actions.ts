"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Type, type Part } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { chat, defaultModel, friendlyAIError, normalizeModel, generateJSON, listTextModels, type GeminiModelInfo } from "@/lib/gemini";
import { getSetting, setSetting, type SettingKey } from "@/lib/settings";
import { addDays, fromISODate, toISODate, weekDays, DAY_NAMES } from "@/lib/dates";
import {
  MAX_SURVEY_PHOTOS, SURVEY_BATCH, SURVEY_CHANNELS, normalizeReadings, summarizeSurveys, type SurveyReading,
} from "@/lib/tayau-surveys";
import { createCheckoutCharge, getChargeStatus } from "@/lib/openpay";
import { composeEmailDraft } from "@/lib/mail-compose";
import { decodeDraft, draftAsText, encodeDraft, EMAIL_INTENT } from "@/lib/email-draft";
import { fileToParts, MAX_ATTACHMENTS_BYTES } from "@/lib/attachments";
import { withAttachmentNames } from "@/lib/attachment-names";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e),
});

const refresh = () => {
  revalidatePath("/dashboard");
  revalidatePath("/recursos-humanos");
};

const isHttpUrl = (u: string) => /^https?:\/\//i.test(u) || u.startsWith("/");

// ───────────── Herramientas ─────────────

export async function updateTool(id: string, name: string, url: string): Promise<Result> {
  try {
    await requireAuth();
    name = name.trim();
    url = url.trim();
    if (!name) return { ok: false, error: "El nombre no puede estar vacío." };
    if (!isHttpUrl(url)) return { ok: false, error: "El enlace debe empezar con https:// (o / para páginas internas)." };
    await prisma.tool.update({ where: { id }, data: { name, url } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Proyectos y tareas ─────────────

export async function createProject(name: string, color: string): Promise<Result> {
  try {
    await requireAuth();
    if (!name.trim()) return { ok: false, error: "Escribe un nombre." };
    await prisma.project.create({ data: { name: name.trim(), color } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createTask(title: string, day: string, projectId: string | null): Promise<Result<{ id: string }>> {
  try {
    await requireAuth();
    if (!title.trim()) return { ok: false, error: "Escribe la tarea." };
    const t = await prisma.task.create({ data: { title: title.trim(), day, projectId: projectId || null, order: Date.now() % 1e9 } });
    refresh();
    return { ok: true, id: t.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTask(
  id: string,
  data: Partial<{ day: string; done: boolean; priority: boolean; title: string; projectId: string | null }>,
): Promise<Result> {
  try {
    await requireAuth();
    await prisma.task.update({ where: { id }, data });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTask(id: string): Promise<Result> {
  try {
    await requireAuth();
    await prisma.task.delete({ where: { id } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Agente Planificador: convierte un "brain dump" en tareas distribuidas en la semana. */
export async function planWeek(text: string): Promise<Result<{ count: number }>> {
  try {
    await requireAuth();
    if (text.trim().length < 5) return { ok: false, error: "Escribe un poco más de lo que tienes pendiente." };

    const projects = await prisma.project.findMany();
    const days = weekDays();
    const today = toISODate(new Date());
    const existing = await prisma.task.findMany({ where: { day: { in: days } }, select: { title: true, day: true } });
    const load = days.map((d, i) => `${DAY_NAMES[i]} ${d}: ${existing.filter((t) => t.day === d).length} tareas`).join("\n");

    const res = await generateJSON<{ tasks: { title: string; project: string; dayIndex: number; priority: boolean }[] }>(
      `Eres el Agente Planificador de MeWork. Recibes un texto libre con pendientes de una gerente de marketing y lo conviertes en tareas cortas y accionables (máx. 8 palabras cada una, en español, empezando con verbo). Asigna cada tarea a un proyecto de esta lista exacta: ${projects.map((p) => p.name).join(", ")} (o "General" si no aplica). Distribuye las tareas entre lunes (dayIndex 0) y domingo (6) equilibrando la carga, respetando fechas o días mencionados, poniendo lo urgente primero y nunca antes de hoy (${today}). Marca priority=true solo en lo verdaderamente crítico (máximo 3).`,
      `Semana: ${days[0]} a ${days[6]}. Carga actual:\n${load}\n\nPendientes:\n${text}`,
      {
        type: Type.OBJECT,
        properties: {
          tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                project: { type: Type.STRING },
                dayIndex: { type: Type.INTEGER },
                priority: { type: Type.BOOLEAN },
              },
              required: ["title", "project", "dayIndex", "priority"],
            },
          },
        },
        required: ["tasks"],
      },
    );

    const tasks = (res.tasks ?? []).filter((t) => t.title?.trim());
    const todayIdx = Math.max(0, days.indexOf(today));
    await prisma.task.createMany({
      data: tasks.map((t, i) => ({
        title: t.title.trim().slice(0, 140),
        day: days[Math.min(6, Math.max(todayIdx, t.dayIndex | 0))],
        priority: !!t.priority,
        projectId: projects.find((p) => p.name.toLowerCase() === t.project?.toLowerCase())?.id ?? null,
        order: Date.now() % 1e9 + i,
      })),
    });
    refresh();
    return { ok: true, count: tasks.length };
  } catch (e) {
    return { ok: false, error: friendlyAIError(e) };
  }
}

// ───────────── Agentes de IA ─────────────

export async function getAgentMessages(agentId: string) {
  await requireAuth();
  return prisma.message.findMany({
    where: { agentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, mode: true, model: true },
  });
}

export type ChatMode = "consulta" | "tareas";

const MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  consulta: "MODO CONSULTA: responde de forma breve, directa y conversacional.",
  tareas:
    "MODO TAREAS: ejecuta el trabajo completo con máxima precisión. Entrega el resultado final listo para usar (textos, código, planes paso a paso), revisa tu trabajo antes de responder y señala supuestos o riesgos.",
};

/** Texto del mensaje tal como lo debe leer Gemini (los borradores de correo se guardan como JSON). */
const readableContent = (content: string) => {
  const d = decodeDraft(content);
  return d ? draftAsText(d) : content;
};

export async function sendAgentMessage(
  agentId: string,
  text: string,
  mode: ChatMode = "consulta",
  opts?: { replyToAlertId?: string; files?: File[] },
): Promise<Result<{ reply: string; model: string; messageId: string; content: string }>> {
  try {
    await requireAuth();
    const files = (opts?.files ?? []).filter((f) => f instanceof File && f.size > 0);
    if (!text.trim() && !files.length) return { ok: false, error: "Escribe un mensaje." };
    if (files.reduce((s, f) => s + f.size, 0) > MAX_ATTACHMENTS_BYTES)
      return { ok: false, error: "Los archivos pesan demasiado (máximo 18 MB en total)." };
    if (mode !== "consulta" && mode !== "tareas") mode = "consulta";
    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    // Tareas usa el modelo fuerte; si no está configurado, cae al de consulta y luego al global
    let model =
      (mode === "tareas" ? agent.taskModel || agent.consultModel : agent.consultModel || agent.taskModel) ||
      (await defaultModel());
    const name = await getSetting("profileName");
    const role = await getSetting("profileRole");

    // Memoria aislada: solo los mensajes de este agente (últimos 40)
    const history = (await prisma.message.findMany({ where: { agentId }, orderBy: { createdAt: "desc" }, take: 40 })).reverse();

    // La asistente redacta correos como borrador estructurado (se envían solo con aprobación)
    const lastModel = [...history].reverse().find((m) => m.role === "model");
    const openDraft = lastModel ? decodeDraft(lastModel.content) : null;
    const pending = openDraft?.status === "borrador" ? openDraft : null;
    const wantsEmail =
      !files.length &&
      /asistente/i.test(agent.role) &&
      (EMAIL_INTENT.test(text) || !!opts?.replyToAlertId || (!!pending && /\b(cambia|hazlo|agrega|quita|pon|m[aá]s|menos)\b/i.test(text)));

    let reply: string;
    if (wantsEmail) {
      const alert = opts?.replyToAlertId ? await prisma.mailAlert.findUnique({ where: { id: opts.replyToAlertId } }) : null;
      const conversation = history
        .slice(-10)
        .map((m) => `${m.role === "user" ? name : agent.firstName}: ${readableContent(m.content)}`)
        .join("\n");
      const draft = await composeEmailDraft({
        instruction: text,
        conversation,
        current: pending,
        reply: alert ? { accountId: alert.accountId, messageId: alert.messageId } : null,
      });
      reply = encodeDraft(draft);
      model = await defaultModel();
    } else {
      // Los adjuntos solo viajan en este turno; en el historial queda la línea "📎 nombres"
      const fileParts = (await Promise.all(files.map(fileToParts))).flat();
      const contents = [
        ...history.map((m) => ({ role: m.role, parts: [{ text: readableContent(m.content) }] })),
        { role: "user", parts: [...fileParts, { text: text.trim() || "Revisa los archivos adjuntos." }] },
      ];
      const system = `${agent.systemPrompt}\n\nTrabajas para ${name} (${role}). Hoy es ${toISODate(new Date())}. Eres ${agent.firstName} ${agent.lastName}, ${agent.age} años, puesto: ${agent.role}.\n\n${MODE_INSTRUCTIONS[mode]}`;
      reply = await chat(system, contents, model);
    }

    const now = Date.now();
    const content = withAttachmentNames(text.trim(), files.map((f) => f.name || "archivo"));
    await prisma.message.create({ data: { agentId, role: "user", content, mode, createdAt: new Date(now) } });
    const saved = await prisma.message.create({ data: { agentId, role: "model", content: reply, mode, model, createdAt: new Date(now + 1) } });
    return { ok: true, reply, model, messageId: saved.id, content };
  } catch (e) {
    return { ok: false, error: friendlyAIError(e) };
  }
}

export async function clearAgentMemory(agentId: string): Promise<Result> {
  try {
    await requireAuth();
    await prisma.message.deleteMany({ where: { agentId } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type AgentInput = {
  firstName: string;
  lastName: string;
  avatar: string | null;
  role: string;
  age: number;
  systemPrompt: string;
  color?: string;
  consultModel?: string | null;
  taskModel?: string | null;
};

const MODEL_ID = /^[a-z0-9][a-z0-9.\-_/]{1,80}$/i;

function validateAgent(a: AgentInput): string | null {
  // Normaliza "Gemini 2.5 Flash" → "gemini-2.5-flash" antes de validar
  a.consultModel = normalizeModel(a.consultModel) || null;
  a.taskModel = normalizeModel(a.taskModel) || null;
  for (const m of [a.consultModel, a.taskModel]) {
    if (m && !MODEL_ID.test(m)) return `El nombre de modelo "${m}" no es válido.`;
  }
  if (!a.firstName.trim() || !a.lastName.trim()) return "Escribe nombre y apellidos.";
  if (!a.role.trim()) return "Escribe el puesto o cargo.";
  if (!Number.isFinite(a.age) || a.age < 18 || a.age > 99) return "La edad debe estar entre 18 y 99.";
  if (a.systemPrompt.trim().length < 10) return "Describe un poco más las funciones del agente.";
  if (a.avatar && a.avatar.length > 1_500_000) return "La foto es demasiado pesada.";
  return null;
}

export async function createAgent(a: AgentInput): Promise<Result<{ id: string }>> {
  try {
    await requireAuth();
    const err = validateAgent(a);
    if (err) return { ok: false, error: err };
    const colors = ["#0f766e", "#c2410c", "#4338ca", "#be185d", "#0369a1", "#7c3aed", "#15803d"];
    const agent = await prisma.agent.create({
      data: {
        ...a,
        firstName: a.firstName.trim(),
        lastName: a.lastName.trim(),
        role: a.role.trim(),
        color: a.color ?? colors[(await prisma.agent.count()) % colors.length],
        status: "Recién contratado · Listo para ayudarte",
      },
    });
    refresh();
    return { ok: true, id: agent.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateAgent(id: string, a: AgentInput): Promise<Result> {
  try {
    await requireAuth();
    const err = validateAgent(a);
    if (err) return { ok: false, error: err };
    await prisma.agent.update({ where: { id }, data: a });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Cambio rápido de modelos desde el chat. */
export async function setAgentModels(id: string, consultModel: string | null, taskModel: string | null): Promise<Result> {
  try {
    await requireAuth();
    consultModel = normalizeModel(consultModel) || null;
    taskModel = normalizeModel(taskModel) || null;
    for (const m of [consultModel, taskModel]) {
      if (m && !MODEL_ID.test(m)) return { ok: false, error: `El nombre de modelo "${m}" no es válido.` };
    }
    await prisma.agent.update({ where: { id }, data: { consultModel: consultModel || null, taskModel: taskModel || null } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Modelos disponibles para la API Key (en vivo desde Google). */
export async function listGeminiModels(): Promise<{ models: GeminiModelInfo[]; defaultModel: string; error?: string }> {
  await requireAuth();
  const fallback = await defaultModel();
  try {
    return { models: await listTextModels(), defaultModel: fallback };
  } catch (e) {
    return { models: [], defaultModel: fallback, error: friendlyAIError(e) };
  }
}

export async function deleteAgent(id: string): Promise<Result> {
  try {
    await requireAuth();
    await prisma.agent.delete({ where: { id } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type HireSuggestion = {
  firstName: string;
  lastName: string;
  age: number;
  role: string;
  reason: string;
  bottleneck: string;
  functions: string;
  systemPrompt: string;
  avatar: string;
};

/** Reclutador de Talento Inteligente: detecta cuellos de botella y propone contrataciones. */
export async function suggestHires(): Promise<Result<{ summary: string; suggestions: HireSuggestion[] }>> {
  try {
    await requireAuth();
    const [tasks, agents, ideas, tickets] = await Promise.all([
      prisma.task.findMany({ where: { done: false }, include: { project: true } }),
      prisma.agent.findMany(),
      prisma.tikTokIdea.findMany({ where: { status: { not: "publicado" } } }),
      prisma.ticket.groupBy({ by: ["status"], _count: true }),
    ]);

    const context = [
      `Equipo actual:\n${agents.map((a) => `- ${a.firstName} ${a.lastName}: ${a.role}`).join("\n")}`,
      `Tareas pendientes (${tasks.length}):\n${tasks.map((t) => `- [${t.project?.name ?? "General"}] ${t.title} (${t.day})${t.priority ? " PRIORIDAD" : ""}`).join("\n")}`,
      `Contenido TikTok pendiente: ${ideas.length} piezas (${ideas.map((i) => i.status).join(", ")})`,
      `Boletos por estado: ${tickets.map((t) => `${t.status}=${t._count}`).join(", ") || "sin boletos"}`,
    ].join("\n\n");

    const res = await generateJSON<{ summary: string; suggestions: Omit<HireSuggestion, "avatar">[] }>(
      "Eres el Reclutador de Talento Inteligente de MeWork. Analizas la carga de trabajo de una gerente de marketing y su equipo de agentes de IA. Detecta cuellos de botella (áreas con muchas tareas y sin especialista, p. ej. programación, ciberseguridad, diseño, ventas, atención a clientes) y recomienda de 1 a 3 nuevos agentes especializados que NO dupliquen al equipo actual. Para cada uno genera una ficha realista mexicana: nombre, apellidos, edad (22-55), cargo, el cuello de botella que resuelve, el motivo con datos concretos, sus funciones (2-3 líneas) y un system prompt completo en segunda persona ('Eres ...') en español. El resumen debe ser de 2 frases.",
      context,
      {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                firstName: { type: Type.STRING },
                lastName: { type: Type.STRING },
                age: { type: Type.INTEGER },
                role: { type: Type.STRING },
                bottleneck: { type: Type.STRING },
                reason: { type: Type.STRING },
                functions: { type: Type.STRING },
                systemPrompt: { type: Type.STRING },
              },
              required: ["firstName", "lastName", "age", "role", "bottleneck", "reason", "functions", "systemPrompt"],
            },
          },
        },
        required: ["summary", "suggestions"],
      },
    );

    const suggestions = (res.suggestions ?? []).map((s) => ({
      ...s,
      avatar: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(`${s.firstName} ${s.lastName}`)}&backgroundColor=ccfbf1,fde68a,fecdd3,ddd6fe`,
    }));
    return { ok: true, summary: res.summary ?? "", suggestions };
  } catch (e) {
    return { ok: false, error: friendlyAIError(e) };
  }
}

// ───────────── Tayau ─────────────

const SURVEY_PROMPT = `Eres un capturista que lee fotos de encuestas de satisfacción en papel del restaurante Tayau.
Recibirás varias fotos, cada una precedida por "Foto N:". Devuelve un elemento en "encuestas" por cada encuesta que veas,
con "foto" igual al número N de la foto donde está (normalmente una encuesta por foto; si una foto trae varias, devuelve varias).

Calificaciones (comida, ambiente, servicio), siempre en escala de 1 a 5:
- comida = sabor, platillos, alimentos, bebidas. servicio = atención, meseros, rapidez. ambiente = lugar, música, limpieza, decoración.
- Estrellas o números del 1 al 5: usa el valor marcado. Escala del 1 al 10: divide entre 2.
- Palabras: Excelente = 5, Muy bueno = 4.5, Bueno = 4, Regular = 3, Malo = 2, Muy malo o Pésimo = 1.
- Caritas: la más feliz = 5 y la más triste = 1.
- Si una pregunta no se contestó o no se puede leer, usa null. Nunca inventes datos.

Canales ("¿Cómo nos conociste?" o similar), todos los que estén marcados:
- facebook, instagram, tiktok, google_maps (Google, Maps, reseñas de Google),
  recomendacion (amigo, familiar, recomendación, boca a boca), otro (cualquier otra respuesta; escríbela en "otroCanal").
- Si no se contestó, usa una lista vacía.

Si una foto no es una encuesta o es ilegible, devuelve un elemento con legible = false y lo demás en null.`;

export async function analyzeSurveyPhotos(formData: FormData): Promise<Result<{ readings: SurveyReading[] }>> {
  try {
    await requireAuth();
    const offset = Math.max(0, Number(formData.get("offset")) || 0);
    const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return { ok: false, error: "Selecciona al menos una foto." };
    if (files.length > SURVEY_BATCH) return { ok: false, error: `Máximo ${SURVEY_BATCH} fotos por envío.` };
    if (files.reduce((s, f) => s + f.size, 0) > MAX_ATTACHMENTS_BYTES) {
      return { ok: false, error: "Las fotos pesan demasiado para enviarlas juntas." };
    }

    const parts: Part[] = [];
    for (const [i, f] of files.entries()) {
      const mimeType = f.type || (/\.(heic|heif)$/i.test(f.name) ? "image/heic" : "");
      if (!/^image\/(png|jpeg|webp|heic|heif)$/i.test(mimeType)) {
        return { ok: false, error: `"${f.name}" no es una imagen compatible (usa JPG, PNG, WEBP o HEIC).` };
      }
      parts.push({ text: `Foto ${offset + i + 1}:` }, { inlineData: { mimeType, data: Buffer.from(await f.arrayBuffer()).toString("base64") } });
    }
    parts.push({ text: `Lee las encuestas de las fotos ${offset + 1} a ${offset + files.length}.` });

    const res = await generateJSON<{ encuestas: unknown[] }>(SURVEY_PROMPT, parts, {
      type: Type.OBJECT,
      properties: {
        encuestas: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              foto: { type: Type.INTEGER },
              legible: { type: Type.BOOLEAN },
              comida: { type: Type.NUMBER, nullable: true },
              ambiente: { type: Type.NUMBER, nullable: true },
              servicio: { type: Type.NUMBER, nullable: true },
              canales: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...SURVEY_CHANNELS] } },
              otroCanal: { type: Type.STRING, nullable: true },
            },
            required: ["foto", "legible", "comida", "ambiente", "servicio", "canales", "otroCanal"],
          },
        },
      },
      required: ["encuestas"],
    });
    return { ok: true, readings: normalizeReadings(res.encuestas ?? [], offset + 1, offset + files.length) };
  } catch (e) {
    return { ok: false, error: friendlyAIError(e) };
  }
}

export async function saveTayauSurveys(startDate: string, readings: SurveyReading[]): Promise<Result<{ satisfaction: number }>> {
  try {
    await requireAuth();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: "Selecciona la semana." };
    const m = summarizeSurveys(normalizeReadings(readings, 1, MAX_SURVEY_PHOTOS)).metrics;
    if (!m.sabor && !m.ambiente && !m.servicio) return { ok: false, error: "No encontré calificaciones de comida, ambiente o servicio." };

    const endDate = toISODate(addDays(fromISODate(startDate), 6));
    await prisma.tayauWeek.upsert({
      where: { startDate },
      create: { startDate, endDate, ...m },
      update: { endDate, ...m },
    });
    refresh();
    return { ok: true, satisfaction: Math.round(((m.sabor + m.ambiente + m.servicio) / 3) * 10) / 10 };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTayauWeek(id: string): Promise<Result> {
  try {
    await requireAuth();
    await prisma.tayauWeek.delete({ where: { id } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── TikTok ─────────────

export async function setIdeaStatus(id: string, status: string): Promise<Result> {
  try {
    await requireAuth();
    if (!["guion", "edicion", "programado", "publicado"].includes(status)) return { ok: false, error: "Estado inválido" };
    await prisma.tikTokIdea.update({ where: { id }, data: { status } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteIdea(id: string): Promise<Result> {
  try {
    await requireAuth();
    await prisma.tikTokIdea.delete({ where: { id } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function generateTikTokIdeas(): Promise<Result<{ count: number }>> {
  try {
    await requireAuth();
    const recent = await prisma.tikTokIdea.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
    const res = await generateJSON<{ ideas: { title: string; description: string; project: string }[] }>(
      "Eres Mateo Rivas, estratega de TikTok. Propón 3 ideas de video virales y realistas para esta semana: una para Toram (desarrollo residencial frente al mar), una para Tayau (restaurante) y una para Boletos (preventa de un parque temático). Título corto y llamativo (máx. 7 palabras) y descripción de formato (máx. 8 palabras). No repitas ideas existentes.",
      `Ideas existentes: ${recent.map((r) => r.title).join("; ")}`,
      {
        type: Type.OBJECT,
        properties: {
          ideas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                project: { type: Type.STRING, enum: ["Toram", "Tayau", "Boletos"] },
              },
              required: ["title", "description", "project"],
            },
          },
        },
        required: ["ideas"],
      },
    );
    const ideas = (res.ideas ?? []).slice(0, 5);
    await prisma.tikTokIdea.createMany({ data: ideas.map((i) => ({ ...i, status: "guion" })) });
    refresh();
    return { ok: true, count: ideas.length };
  } catch (e) {
    return { ok: false, error: friendlyAIError(e) };
  }
}

// ───────────── Boletos ─────────────

const newCode = () => `TRM-${randomBytes(5).toString("hex").toUpperCase()}`;

export async function createTicket(buyerName: string, buyerEmail: string): Promise<Result<{ id: string }>> {
  try {
    await requireAuth();
    if (!buyerName.trim()) return { ok: false, error: "Escribe el nombre del comprador." };
    if (!/^\S+@\S+\.\S+$/.test(buyerEmail.trim())) return { ok: false, error: "Escribe un correo válido." };
    const [eventName, price] = [await getSetting("ticketEventName"), parseFloat(await getSetting("ticketPrice")) || 0];
    const t = await prisma.ticket.create({
      data: { code: newCode(), buyerName: buyerName.trim(), buyerEmail: buyerEmail.trim(), eventName, price },
    });
    refresh();
    return { ok: true, id: t.id };
  } catch (e) {
    return fail(e);
  }
}

export async function startCheckout(id: string): Promise<Result<{ url: string }>> {
  try {
    await requireAuth();
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    if (t.status !== "PENDIENTE") return { ok: false, error: "Este boleto ya no está pendiente de pago." };
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    const { chargeId, url } = await createCheckoutCharge({
      amount: t.price,
      description: `${t.eventName} · ${t.code}`,
      orderId: t.code,
      name: t.buyerName,
      email: t.buyerEmail,
      redirectUrl: `${origin}/dashboard#boletos`,
    });
    await prisma.ticket.update({ where: { id }, data: { chargeId, checkoutUrl: url } });
    refresh();
    return { ok: true, url };
  } catch (e) {
    return fail(e);
  }
}

export async function verifyPayment(id: string): Promise<Result<{ status: string }>> {
  try {
    await requireAuth();
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    if (!t.chargeId) return { ok: false, error: "Este boleto no tiene un cobro de OpenPay." };
    const status = await getChargeStatus(t.chargeId);
    if (status === "completed" && t.status === "PENDIENTE") {
      await prisma.ticket.update({ where: { id }, data: { status: "PAGADO" } });
      refresh();
    }
    return { ok: true, status };
  } catch (e) {
    return fail(e);
  }
}

/** Para pagos en efectivo/transferencia o pruebas sin pasarela. */
export async function markTicketPaid(id: string): Promise<Result> {
  try {
    await requireAuth();
    await prisma.ticket.update({ where: { id, status: "PENDIENTE" }, data: { status: "PAGADO" } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelTicket(id: string): Promise<Result> {
  try {
    await requireAuth();
    await prisma.ticket.update({ where: { id }, data: { status: "CANCELADO" } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type ScanResult = { allowed: boolean; reason: string; buyer?: string; code?: string };

export async function validateTicket(rawCode: string): Promise<ScanResult> {
  await requireAuth();
  const code = rawCode.trim().toUpperCase();
  const t = await prisma.ticket.findUnique({ where: { code } });
  if (!t) return { allowed: false, reason: "Boleto no encontrado", code };
  if (t.status === "USADO")
    return { allowed: false, reason: `Ya se usó el ${t.usedAt?.toLocaleString("es-MX") ?? ""}`, buyer: t.buyerName, code };
  if (t.status === "PENDIENTE") return { allowed: false, reason: "El boleto no está pagado", buyer: t.buyerName, code };
  if (t.status === "CANCELADO") return { allowed: false, reason: "Boleto cancelado", buyer: t.buyerName, code };

  // Marcado atómico: solo una lectura puede pasar de PAGADO a USADO
  const upd = await prisma.ticket.updateMany({ where: { id: t.id, status: "PAGADO" }, data: { status: "USADO", usedAt: new Date() } });
  refresh();
  if (upd.count === 0) return { allowed: false, reason: "Ya se usó", buyer: t.buyerName, code };
  return { allowed: true, reason: "Acceso permitido", buyer: t.buyerName, code };
}

// ───────────── Ajustes ─────────────

const SECRET_KEYS: SettingKey[] = ["geminiApiKey", "openpayPrivateKey"];
const EDITABLE_KEYS: SettingKey[] = [
  "geminiApiKey", "geminiModel", "profileName", "profileRole",
  "openpayMerchantId", "openpayPrivateKey", "openpaySandbox", "ticketEventName", "ticketPrice",
];

export async function saveSettings(formData: FormData): Promise<Result> {
  try {
    await requireAuth();
    for (const key of EDITABLE_KEYS) {
      if (!formData.has(key)) continue;
      let value = String(formData.get(key) ?? "").trim();
      if (key === "geminiModel") {
        value = normalizeModel(value);
        if (value && !MODEL_ID.test(value)) return { ok: false, error: `El nombre de modelo "${value}" no es válido.` };
      }
      // Los secretos vacíos significan "no cambiar"
      if (SECRET_KEYS.includes(key) && !value) continue;
      await setSetting(key, value);
    }
    refresh();
    revalidatePath("/ajustes");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeSecret(key: "geminiApiKey" | "openpayPrivateKey"): Promise<Result> {
  try {
    await requireAuth();
    await prisma.setting.deleteMany({ where: { key } });
    revalidatePath("/ajustes");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function testGemini(): Promise<Result<{ reply: string; model: string }>> {
  try {
    await requireAuth();
    const model = await defaultModel();
    const reply = await chat("Responde solo con: Conexión exitosa ✅", [{ role: "user", parts: [{ text: "Hola" }] }]);
    return { ok: true, reply, model };
  } catch (e) {
    return { ok: false, error: friendlyAIError(e) };
  }
}
