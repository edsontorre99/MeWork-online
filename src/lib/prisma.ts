import path from "node:path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// En SQLite, "file:./dev.db" es relativo a prisma/. Se resuelve a ruta absoluta
// porque Next.js empaqueta el cliente y la ruta relativa dejaría de apuntar ahí.
function datasourceUrl() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:./")) return undefined;
  return `file:${path.join(process.cwd(), "prisma", url.slice("file:./".length))}`;
}

const url = datasourceUrl();
export const prisma = globalForPrisma.prisma ?? new PrismaClient(url ? { datasourceUrl: url } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
