import "server-only";
import { prisma } from "./prisma";
import { addDays, startOfWeek, toISODate, weekDays } from "./dates";

const TOOLS = [
  { name: "Recursos Humanos", url: "/recursos-humanos", icon: "users", kind: "internal" },
  { name: "Gemini", url: "https://gemini.google.com", icon: "sparkles", kind: "link" },
  { name: "Claude", url: "https://claude.ai", icon: "bot", kind: "link" },
  { name: "ChatGPT", url: "https://chatgpt.com", icon: "message-square", kind: "link" },
  { name: "Página Web", url: "https://hpanel.hostinger.com/websites", icon: "globe", kind: "link" },
  { name: "Facebook", url: "https://facebook.com", icon: "thumbs-up", kind: "link" },
  { name: "Instagram", url: "https://instagram.com", icon: "camera", kind: "link" },
  { name: "Meta Ads", url: "https://adsmanager.facebook.com", icon: "megaphone", kind: "link" },
  { name: "Google", url: "https://www.google.com/search?q=", icon: "search", kind: "google" },
  { name: "CapCut", url: "https://www.capcut.com", icon: "scissors", kind: "link" },
  { name: "WhatsApp", url: "https://web.whatsapp.com", icon: "message-circle", kind: "link" },
  { name: "Gmail", url: "https://gmail.com", icon: "mail", kind: "link" },
  { name: "Hotmail", url: "https://hotmail.com", icon: "inbox", kind: "link" },
];

const AGENTS = [
  {
    firstName: "Mateo",
    lastName: "Rivas",
    role: "Especialista en Marketing & TikTok",
    age: 27,
    color: "#0f766e",
    status: "Escribiendo 2 guiones nuevos",
    systemPrompt:
      "Eres Mateo Rivas, especialista en marketing digital y TikTok para Toram Residencial, un desarrollo inmobiliario frente al mar. Propones ideas de video, ganchos de los primeros 3 segundos, guiones cortos, copys y estrategias de captación de interesados. Respondes en español de México, de forma práctica y con pasos concretos.",
  },
  {
    firstName: "Santiago",
    lastName: "Beltrán",
    role: "Marketing para Restaurantes",
    age: 31,
    color: "#c2410c",
    status: "Armando el menú de temporada",
    systemPrompt:
      "Eres Santiago Beltrán, experto en marketing para restaurantes y responsable de Tayau Restaurant. Analizas encuestas de satisfacción (sabor, ambiente, servicio), canales de atracción (Facebook, Instagram, recomendación, TikTok/Maps), propones promociones, menús de temporada y contenido para redes. Respondes en español de México, claro y accionable.",
  },
  {
    firstName: "Diego",
    lastName: "Quintero",
    role: "Software y Ciberseguridad",
    age: 34,
    color: "#4338ca",
    status: "Revisando el pago en línea",
    systemPrompt:
      "Eres Diego Quintero, ingeniero de software y ciberseguridad. Te encargas del Sistema de Venta de Boletos online: integración con la pasarela OpenPay, generación de códigos QR únicos, validación en la entrada y buenas prácticas de seguridad. Explicas temas técnicos en lenguaje sencillo para una gerente de marketing y das pasos claros.",
  },
  {
    firstName: "Valeria",
    lastName: "Ochoa",
    role: "Asistente Personal",
    age: 29,
    color: "#be185d",
    status: "Tiene un correo listo para ti",
    systemPrompt:
      "Eres Valeria Ochoa, asistente personal. Redactas correos profesionales, organizas la agenda y das seguimiento a pendientes. Cuando redactes un correo, usa exactamente este formato al inicio de líneas separadas: 'Para: ...', 'Asunto: ...' y después el cuerpo del correo. Respondes en español de México, cordial y breve.",
  },
];

export async function ensureSeeded() {
  if ((await prisma.tool.count()) > 0) return;

  await prisma.tool.createMany({ data: TOOLS.map((t, i) => ({ ...t, order: i })) });
  for (const a of AGENTS) await prisma.agent.create({ data: a });

  const [toram, tayau, boletos] = await Promise.all([
    prisma.project.create({ data: { name: "Toram Residencial", color: "#0f766e" } }),
    prisma.project.create({ data: { name: "Tayau Restaurant", color: "#c2410c" } }),
    prisma.project.create({ data: { name: "Sistema de Boletos", color: "#4338ca" } }),
  ]);

  const d = weekDays();
  const tasks: [number, string, string, boolean?][] = [
    [0, "Responder a OpenPay", boletos.id, true],
    [0, "Aprobar diseños de campaña", toram.id, true],
    [0, "Revisar menú de temporada", tayau.id, true],
    [1, "Grabar recorrido Torre B", toram.id],
    [1, "Definir cómo se compra un boleto", boletos.id],
    [2, "Fotos del menú nuevo", tayau.id],
    [2, "Probar el pago en línea", boletos.id],
    [3, "Reporte de interesados", toram.id],
    [3, "Publicar video de cocina", tayau.id],
    [4, "Mostrar el sistema de boletos al equipo", boletos.id],
    [5, "Programar video de TikTok", tayau.id],
    [6, "Programar video de TikTok", toram.id],
    [6, "Plan de contenido de la próxima semana", toram.id],
  ];
  await prisma.task.createMany({
    data: tasks.map(([day, title, projectId, priority], i) => ({
      day: d[day], title, projectId, priority: !!priority, order: i,
    })),
  });

  // Seis semanas previas de encuestas de ejemplo
  const lastWeek = addDays(startOfWeek(new Date()), -7);
  const sample = [
    [4.3, 4.4, 4.1, 9, 7, 8, 1],
    [4.4, 4.5, 4.2, 11, 8, 9, 2],
    [4.5, 4.4, 4.3, 12, 8, 10, 1],
    [4.4, 4.6, 4.2, 14, 9, 9, 2],
    [4.6, 4.5, 4.4, 15, 9, 10, 2],
    [4.9, 4.9, 4.6, 18, 10, 11, 3],
  ];
  await prisma.tayauWeek.createMany({
    data: sample.map(([sabor, ambiente, servicio, facebook, instagram, recomendacion, tiktokMaps], i) => {
      const start = addDays(lastWeek, (i - 5) * 7);
      return {
        startDate: toISODate(start),
        endDate: toISODate(addDays(start, 6)),
        sabor, ambiente, servicio, facebook, instagram, recomendacion, tiktokMaps,
        responses: facebook + instagram + recomendacion + tiktokMaps,
      };
    }),
  });

  await prisma.tikTokIdea.createMany({
    data: [
      { title: "Un día en la cocina de Tayau", description: "Muestra cómo se prepara un platillo", project: "Tayau", status: "guion" },
      { title: "¿Cuánto cuesta vivir frente al mar?", description: "Recorrido rápido de 30 segundos", project: "Toram", status: "guion" },
      { title: "Cuenta regresiva a la preventa", description: "Un video por cada día que falta", project: "Boletos", status: "edicion" },
      { title: "Antes y después: Torre B", description: "Avance de obra en 15 segundos", project: "Toram", status: "programado" },
      { title: "El platillo más pedido", description: "Reacción de comensales", project: "Tayau", status: "programado" },
      { title: "Así entras al parque", description: "Demo del boleto con QR", project: "Boletos", status: "programado" },
      { title: "Atardecer desde el roof", description: "Toma estática con música en tendencia", project: "Toram", status: "programado" },
    ],
  });
}
